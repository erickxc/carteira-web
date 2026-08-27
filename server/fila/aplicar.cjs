/**
 * Aplica UMA operação da fila sobre um repo — mesma função usada pelo overlay
 * do cliente remoto (em memória, Etapa 3) e pelo controller ao aplicar de
 * verdade (Etapa 4) — garante que os dois caminhos nunca divirjam na lógica
 * de negócio (cascade delete, `syncClienteColumns`, etc.).
 */
const { ENTIDADES } = require('./entidades.cjs');

function aplicarOperacao(repo, op, opts = {}) {
  const entidade = ENTIDADES[op.entity];
  if (!entidade) throw new Error(`aplicarOperacao: entidade desconhecida "${op.entity}".`);
  const { dominio } = entidade;
  if (op.operation === 'create') return dominio.criar(repo, op.changes, { id: op.recordId, ...opts });
  if (op.operation === 'update') return dominio.atualizar(repo, op.recordId, op.changes, opts);
  if (op.operation === 'delete') return dominio.remover(repo, op.recordId, opts);
  throw new Error(`aplicarOperacao: operação desconhecida "${op.operation}".`);
}

module.exports = { aplicarOperacao };
