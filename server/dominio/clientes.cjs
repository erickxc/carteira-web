const crypto = require('crypto');
const { syncClienteColumns } = require('../db.cjs');
const { gerarRelatoriosPendentes } = require('../relatoriosAutomaticos.cjs');

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
function criar(repo, payload, opts = {}) {
  const efeitosExternos = opts.efeitosExternos !== false;
  const data = repo.get('Clientes');
  const novo = syncClienteColumns({ ...payload, id: opts.id ?? crypto.randomUUID() });
  data.push(novo);
  repo.save('Clientes', data);
  if (efeitosExternos) gerarRelatorioSeConfigurado(novo.id, novo.relatorioCadencia);
  return novo;
}

function atualizar(repo, id, patch, opts = {}) {
  const efeitosExternos = opts.efeitosExternos !== false;
  const updated = repo.update('Clientes', id, patch, syncClienteColumns);
  if (updated && efeitosExternos && 'relatorioCadencia' in patch) {
    gerarRelatorioSeConfigurado(id, updated.relatorioCadencia);
  }
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

module.exports = { criar, atualizar, remover, gerarRelatorioSeConfigurado };
