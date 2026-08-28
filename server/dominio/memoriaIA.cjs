const crypto = require('crypto');

/**
 * Memória geral do agente (`MemoriaIA`) na fila multi-máquina — regras do
 * processo que valem pra carteira inteira.
 *
 * Diferente de `acoesIA`/`usoIA`, esta entidade é editável de verdade: o
 * usuário registra e remove regras. `atualizar` existe pro contrato da fila,
 * embora a UI/ferramentas de hoje só criem e removam.
 */
function criar(repo, payload, opts = {}) {
  const data = repo.get('MemoriaIA');
  const novo = { ...payload, id: opts.id ?? crypto.randomUUID() };
  data.push(novo);
  repo.save('MemoriaIA', data);
  return novo;
}

function atualizar(repo, id, patch) {
  return repo.update('MemoriaIA', id, patch);
}

function remover(repo, id) {
  return repo.delete('MemoriaIA', id);
}

module.exports = { criar, atualizar, remover };
