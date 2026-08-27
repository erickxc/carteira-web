const crypto = require('crypto');

function criar(repo, payload, opts = {}) {
  const data = repo.get('Lembretes');
  const novo = { ...payload, id: opts.id ?? crypto.randomUUID() };
  data.push(novo);
  repo.save('Lembretes', data);
  return novo;
}

function atualizar(repo, id, patch) {
  return repo.update('Lembretes', id, patch);
}

function remover(repo, id) {
  return repo.delete('Lembretes', id);
}

module.exports = { criar, atualizar, remover };
