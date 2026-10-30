const crypto = require('crypto');
const { syncClienteColumns } = require('../db.cjs');
const { gerarRelatoriosPendentes } = require('../relatoriosAutomaticos.cjs');
const { sincronizarSemQuebrar } = require('./statusHistorico.cjs');
const { listaJSON } = require('../../shared/cadenciaServico.cjs');
const {
  PRODUTOS_OFICIAIS, FASES, renomearProduto, produtosDeLegado, traduzirPatchLegado, mudancasDeFase,
} = require('../../shared/produtos.cjs');

const CAMPOS_SITUACAO = ['status', 'estado', 'pausadoAte'];

/**
 * Gera o próximo relatório na hora quando o cliente salvo já vem com cadência
 * configurada — sem isso, a agenda só refletiria a mudança na próxima
 * sexta-feira (cron). Erro aqui não deve derrubar a resposta ao cliente.
 * Opera sempre sobre a planilha REAL (`gerarRelatoriosPendentes` não recebe
 * repo) — por isso só é chamada quando `efeitosExternos` está ligado.
 */
function gerarRelatorioSeConfigurado(clientId, relatorioCadencia) {
  if (!relatorioCadencia) return;
  try {
    gerarRelatoriosPendentes({ apenasClientId: clientId });
  } catch (err) {
    console.warn(`Falha ao gerar relatório automático para o cliente ${clientId}:`, err.message);
  }
}

/**
 * `opts.id`: permite ao chamador decidir o id (usado futuramente pelo
 * servidor local do cliente remoto, que precisa devolver uma resposta
 * otimista com o id definitivo antes de enfileirar a operação). As rotas HTTP
 * de hoje não passam isso — sempre gera um id novo, descartando qualquer
 * `id` vindo em `payload` (mesmo comportamento de antes).
 * `opts.efeitosExternos` (default true): desliga a geração automática de
 * relatório — usado pelo overlay/testes, que operam num repo em memória e
 * não devem disparar efeitos que gravam na planilha real.
 */
const MOTIVO_LEGADO = 'cadastro anterior aos produtos (1.7)';
const MOTIVO_CADASTRO = 'cliente cadastrado';

const erro400 = (mensagem) => Object.assign(new Error(mensagem), { status: 400 });

/**
 * `produtos` do cliente; sem a coluna (cliente ainda não migrado), monta do
 * formato antigo SÓ EM MEMÓRIA — fase Ativo pra tudo, igual ao `servicos` de
 * hoje, então a tela e a cadência veem o mesmo que antes. Usado pela leitura
 * da API e como "antes" na validação de fase (a tela 1.7 devolve essa mesma
 * lista; comparar com [] exigiria motivo pra produto que já estava lá).
 */
function produtosDoCliente(cliente) {
  const p = cliente && cliente.produtos;
  if (p != null && !(typeof p === 'string' && !p.trim())) return listaJSON(p);
  return produtosDeLegado(cliente || {}, { agora: new Date().toISOString(), motivo: MOTIVO_LEGADO });
}

/**
 * Integridade de `produtos` (o SQLite daqui não tem constraint): produto NOVO
 * com nome na lista oficial ou na categoria `servico` (o que já estava gravado
 * não é revalidado — categoria apagada depois não pode travar a edição de
 * outros campos nem o patch de uma máquina 1.6), sem repetir (nome antigo e
 * novo contam como o mesmo), fase válida. Grava com o nome oficial e sem
 * `senha` (texto puro) nem `temSenha` (derivado da leitura) — a rota já cifrou.
 * Produto que chega sem `senhaCifrada` (a tela nunca a recebe) mantém a salva.
 */
function normalizarProdutos(repo, lista, anteriores, agora) {
  const validos = new Set([
    ...PRODUTOS_OFICIAIS,
    ...repo.get('Categorias').filter((c) => c.tipo === 'servico').map((c) => renomearProduto(c.valor)),
  ]);
  const vistos = new Set();
  return listaJSON(lista).map((item) => {
    if (!item || typeof item !== 'object') throw erro400('Produto inválido.');
    const produto = renomearProduto(item.produto);
    const antes = anteriores.find((a) => renomearProduto(a.produto) === produto);
    if (!antes && !validos.has(produto)) throw erro400(`Produto desconhecido: "${item.produto}".`);
    if (vistos.has(produto)) throw erro400(`Produto repetido: "${produto}".`);
    vistos.add(produto);
    if (!FASES.includes(item.fase)) throw erro400(`Fase inválida para ${produto}: "${item.fase}". Use: ${FASES.join(', ')}.`);
    const { senha: _senha, temSenha: _temSenha, ...resto } = item;
    const out = { ...resto, produto };
    if (!('senhaCifrada' in item) && antes && antes.senhaCifrada) out.senhaCifrada = antes.senhaCifrada;
    // `faseDesde` é o início do relógio "nunca atendido" (buildFilaCadencia).
    // Produto novo ou fase nova sem data informada: começa agora. Fase igual:
    // mantém a data salva, mesmo '' (cliente sem createdAt não ganha carência
    // só porque alguém editou o link).
    if (!antes) {
      if (!out.faseDesde) out.faseDesde = agora;
    } else if (antes.fase !== out.fase) {
      if (!out.faseDesde || out.faseDesde === antes.faseDesde) out.faseDesde = agora;
    } else if (!out.faseDesde) {
      out.faseDesde = antes.faseDesde || '';
    }
    return out;
  });
}

function criar(repo, payload, opts = {}) {
  const efeitosExternos = opts.efeitosExternos !== false;
  const data = repo.get('Clientes');
  let dados = payload;
  if ('produtos' in payload && payload.produtos != null) {
    // Cliente novo não tem "fase anterior": motivo vazio vira o padrão.
    const produtos = normalizarProdutos(repo, payload.produtos, [], new Date().toISOString())
      .map((p) => (String(p.motivoFase || '').trim() ? p : { ...p, motivoFase: MOTIVO_CADASTRO }));
    dados = { ...payload, produtos };
  }
  const novo = syncClienteColumns({ ...dados, id: opts.id ?? crypto.randomUUID() });
  data.push(novo);
  repo.save('Clientes', data);
  if (efeitosExternos) {
    gerarRelatorioSeConfigurado(novo.id, novo.relatorioCadencia);
    sincronizarSemQuebrar(repo, 'cliente criado');
  }
  return novo;
}

/**
 * Com `produtos` no patch (ou um patch da 1.6 traduzido para `produtos`),
 * valida antes de gravar: toda troca de fase precisa de motivo novo, e tirar
 * produto da lista é recusado (é Cancelado com motivo, não apagar a linha).
 * Lança erro com `status: 400` — a rota responde com a mensagem.
 */
function prepararPatchProdutos(repo, atual, patch) {
  const agora = new Date().toISOString();
  const traduzido = traduzirPatchLegado(atual.produtos, patch, agora);
  if (!traduzido && !('produtos' in patch)) return patch;
  const anteriores = produtosDoCliente(atual);
  const produtos = normalizarProdutos(repo, traduzido || patch.produtos, anteriores, agora);
  for (const m of mudancasDeFase(anteriores, produtos)) {
    if (m.para === null) throw erro400(`Para tirar ${m.produto}, mude a fase para Cancelado e informe o motivo.`);
    if (!m.motivoMudou) throw erro400('Informe o motivo da mudança de fase.');
  }
  return { ...patch, produtos };
}

function atualizar(repo, id, patch, opts = {}) {
  const efeitosExternos = opts.efeitosExternos !== false;
  const atual = repo.get('Clientes').find((c) => String(c.id) === String(id));
  if (!atual) return null;
  patch = prepararPatchProdutos(repo, atual, patch);
  const updated = repo.update('Clientes', id, patch, syncClienteColumns);
  if (updated && efeitosExternos && 'relatorioCadencia' in patch) {
    gerarRelatorioSeConfigurado(id, updated.relatorioCadencia);
  }
  if (updated && efeitosExternos && CAMPOS_SITUACAO.some((c) => c in patch)) sincronizarSemQuebrar(repo, 'cliente atualizado');
  return updated;
}

/**
 * Cascade delete (Agenda/Lembretes/Acoes vinculados) roda sempre, independente
 * de `efeitosExternos` — é consistência de dado, não efeito externo, e o
 * overlay do cliente remoto precisa dele pra tela não ficar com órfãos.
 */
function remover(repo, id) {
  const found = repo.delete('Clientes', id);
  if (!found) return false;
  repo.save('Agenda', repo.get('Agenda').filter((a) => String(a.clientId) !== String(id)));
  repo.save('Lembretes', repo.get('Lembretes').filter((r) => String(r.clientId) !== String(id)));
  repo.save('Acoes', repo.get('Acoes').filter((a) => String(a.clientId) !== String(id)));
  return true;
}

module.exports = { criar, atualizar, remover, gerarRelatorioSeConfigurado, produtosDoCliente };
