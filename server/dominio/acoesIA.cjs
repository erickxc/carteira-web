const crypto = require('crypto');

/**
 * Log de auditoria do agente de IA (`AcoesIA`) na fila multi-máquina.
 *
 * É append-only por natureza: uma ação executada é fato consumado, não se
 * edita nem se apaga. `atualizar`/`remover` existem só pra satisfazer o
 * contrato que `fila/aplicar.cjs` espera de toda entidade — e falham alto se
 * alguém tentar usar, em vez de silenciosamente não fazer nada.
 */
function criar(repo, payload, opts = {}) {
  const data = repo.get('AcoesIA');
  const novo = { ...payload, id: opts.id ?? crypto.randomUUID() };
  data.push(novo);
  repo.save('AcoesIA', data);
  return novo;
}

function atualizar() {
  throw new Error('AcoesIA é append-only: log de auditoria não se edita.');
}

function remover() {
  throw new Error('AcoesIA é append-only: log de auditoria não se apaga.');
}

module.exports = { criar, atualizar, remover };
