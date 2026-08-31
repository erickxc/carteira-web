const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('../config.cjs');

/**
 * Vínculo entre `ID_LOJA` (dos "Dados Alvos") e o cliente da Carteira.
 *
 * Por que isto não é automático — e não pode ser:
 *
 * Quando a análise é SEGMENTADA (`Cliente.tipoAnalise === 'segmentado'`, 11
 * clientes hoje), cada loja da empresa é um cliente separado, nomeado
 * `Grupo - Loja` ("Aliança - Itaboraí", "Aliança - Cabo Frio", "Piloto - Matriz",
 * "Piloto - Filial"). O arquivo traz uma linha por loja também — mas com o id do
 * ERP, não com o nome.
 *
 * No mock, os dois ids são `alianca_itaborai` e `alianca_itaborai_CF`. Casar por
 * texto liga "Aliança - Cabo Frio" ao id `alianca_itaborai` (que contém
 * "itaborai" e nada de "cabo frio"), e liga "Aliança - Itaboraí" aos DOIS ids,
 * porque um é prefixo do outro. Um match por substring erraria em silêncio e o
 * relatório da reunião sairia com a loja trocada.
 *
 * Então: o vínculo é EXPLÍCITO e confirmado por gente. `sugerir()` só ranqueia
 * candidatos para quem vai confirmar, com três pistas de peso diferente — o
 * balcão da loja ("CONSUMIDOR CABO FRIO (SA)" só existe na loja de Cabo Frio),
 * a sigla no id (`_CF` = Cabo Frio) e, bem mais fraco, o texto solto do id.
 * Nada é gravado sem confirmação.
 *
 * O que este módulo não resolve (loja sem balcão nomeado, sigla que não bate,
 * nome cadastrado diferente do nome no ERP) vai para `mapaIA.cjs`, que pede uma
 * segunda opinião ao Ollama — restrita à lista de candidatos daqui.
 *
 * Onde fica gravado: um JSON em DATA_DIR, não numa coluna de `Clientes`. Motivo:
 * é mapeamento de integração, muda raramente, e assim não mexe no schema da
 * planilha nem na fila multi-máquina enquanto o desenho da feature não fechar.
 * Se virar dado de primeira classe do cliente, migra para `Clientes` — a leitura
 * está isolada em `carregar()`/`salvar()` para essa troca sair barata.
 */

const ARQUIVO_VINCULOS = process.env.ALVOS_VINCULOS_PATH || path.join(DATA_DIR, 'alvos-vinculos.json');

const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const tokens = (t) => semAcento(t).toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 1);

/**
 * Estrutura: `{ "<pasta da empresa>": { "<ID_LOJA>": "<clientId>" } }`.
 * Ausência de arquivo é estado normal (nada vinculado ainda), não erro.
 */
function carregar(caminho = ARQUIVO_VINCULOS) {
  try {
    const dado = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    return dado && typeof dado === 'object' ? dado : {};
  } catch {
    return {};
  }
}

function salvar(vinculos, caminho = ARQUIVO_VINCULOS) {
  fs.writeFileSync(caminho, `${JSON.stringify(vinculos, null, 2)}\n`, 'utf8');
  return vinculos;
}

/** Grava/remove o vínculo de UMA loja, preservando o resto do arquivo. */
function vincular(empresa, loja, clientId, caminho = ARQUIVO_VINCULOS) {
  const vinculos = carregar(caminho);
  const daEmpresa = { ...(vinculos[empresa] || {}) };
  if (clientId) daEmpresa[loja] = String(clientId);
  else delete daEmpresa[loja];
  return salvar({ ...vinculos, [empresa]: daEmpresa }, caminho);
}

function clienteDaLoja(empresa, loja, caminho = ARQUIVO_VINCULOS) {
  return carregar(caminho)[empresa]?.[loja] ?? null;
}

/**
 * Pistas de identidade de uma loja, em DOIS conjuntos separados de propósito:
 *
 *  - `id`: tokens do próprio `ID_LOJA`. Fraco, e às vezes enganoso — o id da
 *    loja de Cabo Frio é `alianca_itaborai_CF`, então "itaborai" é pista a favor
 *    do cliente ERRADO. Medido: sem separar, "Aliança - Itaboraí" também
 *    aparecia como candidato de confiança alta para a loja de Cabo Frio.
 *  - `balcao`: tokens dos nomes de balcão ("CONSUMIDOR CABO FRIO (SA)"), que
 *    carregam a cidade da loja. É a pista boa — desde que seja o balcão DELA.
 *
 * O filtro de materialidade não é zelo preventivo: no arquivo real,
 * `CONSUMIDOR ITABORAI (SA)` também aparece na loja de Cabo Frio, com R$ 182
 * contra R$ 4,1 milhões do balcão dela (0,004%). Sem o corte, "Itaboraí" entrava
 * como pista boa das DUAS lojas e o cliente errado voltava a aparecer com
 * confiança alta. Um balcão residual assim é lançamento perdido, não a
 * identidade da loja.
 */
const PARTICIPACAO_MINIMA_BALCAO = 0.05;

function pistasDaLoja(agregado, loja) {
  const totalDaLoja = (agregado.lojas || []).find((l) => l.loja === loja)?.receita
    ?? (agregado.clientes || []).reduce((s, c) => (c.loja === loja ? s + (c.receita || 0) : s), 0);
  const piso = Math.max(0, totalDaLoja) * PARTICIPACAO_MINIMA_BALCAO;

  const balcao = new Set();
  for (const c of agregado.clientes || []) {
    if (c.loja !== loja) continue;
    if (!/^consumidor\b/i.test(semAcento(c.cliente))) continue;
    if ((c.receita || 0) < piso) continue;
    for (const t of tokens(c.cliente)) {
      if (t !== 'consumidor' && t !== 'especial') balcao.add(t);
    }
  }
  return { id: new Set(tokens(loja)), balcao };
}

/** Parte "loja" do nome `Grupo - Loja`; o nome inteiro quando não há " - ". */
function trechoDaLoja(cliente) {
  const nome = String(cliente.empresa ?? '');
  const corte = nome.indexOf(' - ');
  return corte === -1 ? nome : nome.slice(corte + 3);
}

/**
 * Sigla da loja: "Cabo Frio" -> "cf", que é literalmente o sufixo do id
 * `alianca_itaborai_CF` (confirmado pelo usuário). É uma pista tão forte quanto
 * o balcão e não depende de dado de venda nenhum — resolve o caso mesmo em loja
 * sem balcão nomeado.
 *
 * Exige 2+ iniciais: loja de nome único ("Itaboraí" -> "i") casaria com
 * qualquer id que tivesse a letra solta, o que não identifica nada.
 */
function siglaDaLoja(cliente) {
  const partes = tokens(trechoDaLoja(cliente));
  return partes.length >= 2 ? partes.map((p) => p[0]).join('') : null;
}

/**
 * Candidatos ranqueados para cada loja da empresa. NÃO decide: devolve
 * `confianca` e o `motivo`, para a tela mostrar e alguém confirmar.
 *
 * Duas pistas dão confiança alta: o BALCÃO da loja e a SIGLA no id. Casar só com
 * o texto do id é fraco (o id pode carregar o nome da outra loja) e casar só com
 * o grupo não é resposta nenhuma — "Aliança" serve igual para todas as lojas da
 * Aliança.
 *
 * A sigla só vale acompanhada do grupo: um id qualquer terminando em `_CF` não
 * pode puxar a "Cabo Frio" de outra empresa.
 */
function sugerir(empresa, agregado, clientes) {
  const ativos = clientes.filter((c) => String(c.estado ?? 'Ativo') !== 'Inativo');
  // A PASTA da empresa é um vínculo por si: "Mineirão/" ao lado do cliente de
  // grupo "Mineirão". Vale pouco como decisão (não distingue as lojas do grupo),
  // mas é o que garante que exista lista de candidatos onde o id não diz nada —
  // no Mineirão os ids são `0001`/`0002` e o balcão é "CONSUMIDOR ESPECIAL", sem
  // cidade. Sem isto a lista vinha VAZIA e não havia nem o que perguntar.
  const daPasta = new Set(tokens(empresa));

  return (agregado.lojas || []).map(({ loja, receita }) => {
    const pistas = pistasDaLoja(agregado, loja);
    const candidatos = ativos.map((c) => {
      const doGrupo = tokens(c.grupo || '');
      const daLoja = tokens(trechoDaLoja(c)).filter((t) => !doGrupo.includes(t));
      const porBalcao = daLoja.filter((t) => pistas.balcao.has(t));
      const porId = daLoja.filter((t) => pistas.id.has(t) && !pistas.balcao.has(t));
      const porGrupo = doGrupo.filter((t) => pistas.balcao.has(t) || pistas.id.has(t));
      const porPasta = [...doGrupo, ...tokens(c.empresa)].filter((t) => daPasta.has(t));
      const sigla = siglaDaLoja(c);
      const porSigla = !!sigla && pistas.id.has(sigla) && (porGrupo.length > 0 || porPasta.length > 0);
      if (!porBalcao.length && !porId.length && !porGrupo.length && !porPasta.length) return null;

      const confianca = (porBalcao.length || porSigla) ? 'alta' : (porId.length ? 'media' : 'baixa');
      const motivo = porBalcao.length
        ? `balcão da loja cita "${porBalcao.join('", "')}"`
        : (porSigla
          ? `sigla "${sigla.toUpperCase()}" no ID_LOJA corresponde a "${trechoDaLoja(c)}"`
          : (porId.length
            ? `só o ID_LOJA cita "${porId.join('", "')}" — o id pode carregar o nome de outra loja`
            : (porGrupo.length
              ? `só o grupo casa ("${porGrupo.join('", "')}") — não distingue as lojas`
              : `só a pasta "${empresa}" casa com o grupo do cliente — não distingue as lojas`)));

      return {
        clientId: c.id,
        empresa: c.empresa,
        pontos: porBalcao.length * 100 + (porSigla ? 50 : 0) + porId.length * 10 + porGrupo.length,
        confianca,
        motivo,
      };
    }).filter(Boolean).sort((a, b) => b.pontos - a.pontos);

    // Empate no topo com a mesma confiança não é sugestão: é ambiguidade.
    const ambiguo = candidatos.length > 1 && candidatos[0].pontos === candidatos[1].pontos;
    return {
      loja,
      receita,
      vinculado: clienteDaLoja(empresa, loja),
      sugestao: !ambiguo && candidatos[0]?.confianca === 'alta' ? candidatos[0] : null,
      candidatos: candidatos.slice(0, 5),
      ambiguo,
    };
  });
}

module.exports = {
  ARQUIVO_VINCULOS,
  carregar,
  salvar,
  vincular,
  clienteDaLoja,
  pistasDaLoja,
  trechoDaLoja,
  siglaDaLoja,
  sugerir,
};
