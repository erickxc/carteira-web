const crypto = require('crypto');

function criar(repo, payload, opts = {}) {
  const data = repo.get('Modelos');
  const nova = { id: opts.id ?? crypto.randomUUID(), createdAt: new Date().toISOString(), ...payload };
  data.push(nova);
  repo.save('Modelos', data);
  return nova;
}

function atualizar(repo, id, patch) {
  return repo.update('Modelos', id, patch);
}

function remover(repo, id) {
  return repo.delete('Modelos', id);
}

module.exports = { criar, atualizar, remover };
