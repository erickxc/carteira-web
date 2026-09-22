const crypto = require('crypto');

function criar(repo, payload, opts = {}) {
  const data = repo.get('AgilConexoes');
  const novo = { ...payload, id: opts.id ?? crypto.randomUUID(), createdAt: new Date().toISOString() };
  data.push(novo);
  repo.save('AgilConexoes', data);
  return novo;
}

function remover(repo, id) {
  return repo.delete('AgilConexoes', id);
}

module.exports = { criar, remover };
