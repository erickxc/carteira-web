const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config.cjs');
const { entidadesDosEventos, normalizar } = require('./entidades.cjs');
const { serieMensal, movimentoDesde, LIMIAR_VARIACAO } = require('./movimento.cjs');
const { estadoDoCliente } = require('./estado.cjs');

/**
 * Escopo REUNIÃO: o que foi pautado nas reuniões deste cliente e o que aconteceu
 * com o número depois. É o bloco 1 do dossiê ("retorno do combinado") e o que o
 * chat carrega por padrão quando você fala de um cliente.
 *
 * A divisão de responsabilidade aqui é a decisão importante:
 *
 *  - **Nada derivado é gravado.** Entidades citadas, séries e vereditos são
 *    recalculados a cada rodada a partir das atas e do arquivo de vendas. Guardar
 *    isso criaria uma segunda verdade que envelhece sozinha — o bug que já
 *    tivemos entre o dossiê e `AnalisesIA.sugestaoProximaPauta`.
 *  - **Só a decisão humana persiste**: o status que alguém deu ao
 *    acompanhamento (em curso / abandonado / resolvido). Isso não é derivável de
 *    dado nenhum, e é o que faz o alerta parar de aparecer sem virar um botão
 *    "dispensar" que esconde o motivo.
 *
 * Mora em `DATA_DIR` (OneDrive) porque é decisão de negócio, compartilhada entre
 * as máquinas — ao contrário do cache de agregado, que é derivado e fica no
 * LOCALAPPDATA de cada máquina.
 */

const ARQUIVO_STATUS = process.env.ALVOS_ACOMPANHAMENTO_PATH
  || path.join(DATA_DIR, 'alvos-acompanhamento.json');

const STATUS_VALIDOS = ['em_curso', 'abandonado', 'resolvido'];
const STATUS_PADRAO = 'em_curso';

const chaveEntidade = (entidade) => `${entidade.tipo}:${normalizar(entidade.nome)}`;

function carregarStatus(caminho = ARQUIVO_STATUS) {
  try {
    const dado = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    return dado && typeof dado === 'object' ? dado : {};
  } catch {
    return {};
  }
}

/**
 * Grava a decisão sobre UM acompanhamento, preservando o resto.
 * `status` nulo remove o registro (volta ao padrão "em curso").
 */
function definirStatus(clientId, entidade, status, opts = {}) {
  const caminho = opts.caminho || ARQUIVO_STATUS;
  if (status !== null && !STATUS_VALIDOS.includes(status)) {
    throw new Error(`Status inválido: "${status}". Use ${STATUS_VALIDOS.join(', ')}.`);
  }
  const tudo = carregarStatus(caminho);
  const doCliente = { ...(tudo[String(clientId)] || {}) };
  const chave = chaveEntidade(entidade);

  if (status === null) {
    delete doCliente[chave];
  } else {
    doCliente[chave] = {
      status,
      // Data vem de fora: `new Date()` aqui tornaria o teste dependente do dia.
      decididoEm: opts.decididoEm || null,
      nota: opts.nota ? String(opts.nota).slice(0, 300) : undefined,
    };
  }

  const novo = { ...tudo, [String(clientId)]: doCliente };
  fs.writeFileSync(caminho, `${JSON.stringify(novo, null, 2)}\n`, 'utf8');
  return novo;
}

/** Produtos e clientes finais que existem NAS LOJAS deste cliente. */
function listasDoCliente(agregado, lojas) {
  const doCliente = new Set(lojas);
  const produtos = new Set();
  const clientes = new Set();
  for (const p of agregado.produtos || []) if (doCliente.has(p.loja)) produtos.add(p.produto);
  for (const c of agregado.clientes || []) if (doCliente.has(c.loja)) clientes.add(c.cliente);
  return { produtos: [...produtos], clientes: [...clientes] };
}

/**
 * Merece atenção agora?
 *
 * Dois casos, e o segundo é o que evita que silenciar vire cegueira permanente:
 *
 *  - `em_curso` + 2+ reuniões + não movimentou/piorou: a abordagem está sendo
 *    repetida sem efeito. Uma menção só ainda não diz nada — duas dizem.
 *  - `abandonado` que VOLTOU a se mover: foi desistido e reagiu. Precisa
 *    reaparecer, com texto diferente.
 */
function avaliarAlerta({ status, reunioes, movimento }) {
  const v = movimento?.veredicto;
  if (status === 'abandonado') {
    return v === 'movimentou'
      ? { alerta: true, razao: 'abandonado_voltou_a_mover' }
      : { alerta: false, razao: null };
  }
  if (status === 'resolvido') return { alerta: false, razao: null };
  if (reunioes.length >= 2 && (v === 'nao_movimentou' || v === 'piorou')) {
    return { alerta: true, razao: 'insistido_sem_retorno' };
  }
  if (movimento?.divergeReceitaQtd) return { alerta: true, razao: 'receita_e_qtd_divergem' };
  return { alerta: false, razao: null };
}

/** Impacto em R$ do movimento — usado só para ordenar, não para decidir. */
function impacto(movimento) {
  if (!movimento?.receita) return 0;
  return Math.abs((movimento.receita.atual ?? 0) - (movimento.receita.base ?? 0));
}

/**
 * @param cliente  `{ id, empresa }`
 * @param eventos  eventos DESSE cliente (com ata/resumo e data)
 * @param agregado saída de `cache.agregadoDaEmpresa` (ou `leitor.agregar`)
 * @param opts.vinculos / opts.lojasPorEmpresa / opts.caminho / opts.periodoParcial
 */
function fatosDeReuniao(cliente, eventos, agregado, opts = {}) {
  const estado = estadoDoCliente(cliente.id, opts);

  // Regra do usuário: fora de `ok`, nenhuma métrica. E não em silêncio — o
  // motivo volta para virar alerta de cadastro.
  if (!estado.analisarMetricas) {
    return { clientId: cliente.id, empresa: cliente.empresa, estado: estado.estado, motivo: estado.motivo, acompanhamentos: [] };
  }

  const lojas = estado.lojas.map((l) => l.loja);
  const listas = listasDoCliente(agregado, lojas);
  const statusSalvo = opts.status || carregarStatus(opts.caminho);
  const doCliente = statusSalvo[String(cliente.id)] || {};

  const acompanhamentos = entidadesDosEventos(eventos, listas).map((entidade) => {
    const filtro = entidade.tipo === 'produto'
      ? { lojas, produto: entidade.nome }
      : { lojas, cliente: entidade.nome };
    const movimento = movimentoDesde(
      serieMensal(agregado.cruzamento, filtro),
      entidade.combinadoEm,
      { periodoParcial: opts.periodoParcial },
    );

    const registro = doCliente[chaveEntidade(entidade)];
    const status = registro?.status || STATUS_PADRAO;
    return {
      ...entidade,
      status,
      decididoEm: registro?.decididoEm ?? null,
      nota: registro?.nota,
      movimento,
      ...avaliarAlerta({ status, reunioes: entidade.reunioes, movimento }),
    };
  });

  // Alerta primeiro, depois maior impacto em R$: é a ordem em que alguém leria.
  acompanhamentos.sort((a, b) => (Number(b.alerta) - Number(a.alerta)) || (impacto(b.movimento) - impacto(a.movimento)));

  return {
    clientId: cliente.id,
    empresa: cliente.empresa,
    estado: 'ok',
    lojas,
    periodoParcial: opts.periodoParcial ?? null,
    acompanhamentos,
  };
}

module.exports = {
  ARQUIVO_STATUS,
  STATUS_VALIDOS,
  STATUS_PADRAO,
  LIMIAR_VARIACAO,
  chaveEntidade,
  carregarStatus,
  definirStatus,
  listasDoCliente,
  avaliarAlerta,
  fatosDeReuniao,
};
