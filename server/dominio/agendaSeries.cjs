const crypto = require('crypto');
const { materializarTudo } = require('../agendaSeries.cjs');

function criar(repo, payload) {
  const data = repo.get('AgendaSeries');
  const now = new Date().toISOString();
  const nova = { ativo: true, ...payload, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  data.push(nova);
  repo.save('AgendaSeries', data);
  // Materializa na hora: sem isso o usuário só veria o primeiro evento no
  // próximo boot/cron, e o objetivo é ver o resultado ao salvar. Passa o
  // mesmo `repo` recebido (não o padrão da planilha real) — importante pros
  // testes com repoMemoria, e coerente com o resto do módulo.
  materializarTudo({ repo, apenasSerieId: nova.id });
  return nova;
}

function atualizar(repo, id, patch) {
  const updated = repo.update('AgendaSeries', id, { ...patch, updatedAt: new Date().toISOString() });
  if (updated) materializarTudo({ repo, apenasSerieId: id });
  return updated;
}

/**
 * Remove a REGRA, não os eventos já criados por ela — os eventos gerados são
 * agenda de verdade a essa altura (podem ter status alterado, anexos etc.) e
 * apagá-los junto seria uma cascade destrutiva não pedida. `EventoAgenda.serie`
 * continua neles como registro de onde vieram.
 */
function remover(repo, id) {
  return repo.delete('AgendaSeries', id);
}

module.exports = { criar, atualizar, remover };
