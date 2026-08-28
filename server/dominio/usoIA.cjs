const crypto = require('crypto');

/**
 * Consumo de IA por pergunta (`UsoIA`) na fila multi-máquina. Append-only pelo
 * mesmo motivo de `acoesIA.cjs`: é medição de um evento que já aconteceu.
 */
function criar(repo, payload, opts = {}) {
  const data = repo.get('UsoIA');
  const novo = { ...payload, id: opts.id ?? crypto.randomUUID() };
  data.push(novo);
  repo.save('UsoIA', data);
  return novo;
}

function atualizar() {
  throw new Error('UsoIA é append-only: medição de consumo não se edita.');
}

function remover() {
  throw new Error('UsoIA é append-only: medição de consumo não se apaga.');
}

module.exports = { criar, atualizar, remover };
