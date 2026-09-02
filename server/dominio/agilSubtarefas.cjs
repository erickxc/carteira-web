const crypto = require('crypto');

function criar(repo, payload, opts = {}) {
  const data = repo.get('AgilSubtarefas');
  const ordem = data.filter((s) => String(s.tarefaId) === String(payload.tarefaId)).length;
  const nova = { concluida: false, ordem, ...payload, id: opts.id ?? crypto.randomUUID(), createdAt: new Date().toISOString() };
  data.push(nova);
  repo.save('AgilSubtarefas', data);
  return nova;
}

function atualizar(repo, id, patch) {
  return repo.update('AgilSubtarefas', id, patch);
}

function remover(repo, id) {
  return repo.delete('AgilSubtarefas', id);
}

module.exports = { criar, atualizar, remover };
