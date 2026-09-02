const crypto = require('crypto');

function criar(repo, payload, opts = {}) {
  const data = repo.get('AgilComentarios');
  const novo = { ...payload, id: opts.id ?? crypto.randomUUID(), createdAt: new Date().toISOString() };
  data.push(novo);
  repo.save('AgilComentarios', data);
  return novo;
}

function remover(repo, id) {
  return repo.delete('AgilComentarios', id);
}

module.exports = { criar, remover };
