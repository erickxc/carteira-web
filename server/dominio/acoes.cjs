const crypto = require('crypto');

function criar(repo, payload, opts = {}) {
  const now = new Date().toISOString();
  const data = repo.get('Acoes');
  const nova = { id: opts.id ?? crypto.randomUUID(), createdAt: now, updatedAt: now, ...payload };
  data.push(nova);
  repo.save('Acoes', data);
  return nova;
}

function atualizar(repo, id, patch) {
  return repo.update('Acoes', id, patch, (row) => ({ ...row, updatedAt: new Date().toISOString() }));
}

function remover(repo, id) {
  return repo.delete('Acoes', id);
}

module.exports = { criar, atualizar, remover };
