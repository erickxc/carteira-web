const crypto = require('crypto');

function criar(repo, payload, opts = {}) {
  const data = repo.get('AgilTarefas');
  const ordem = data.filter((t) => String(t.colunaId) === String(payload.colunaId)).length;
  // Número sequencial por board — é o identificador curto que as pessoas usam
  // pra falar do card ("o 12"), em vez do uuid.
  const numero = data
    .filter((t) => String(t.boardId) === String(payload.boardId))
    .reduce((max, t) => Math.max(max, Number(t.numero) || 0), 0) + 1;
  const now = new Date().toISOString();
  const nova = { ordem, numero, ...payload, id: opts.id ?? crypto.randomUUID(), createdAt: now, updatedAt: now };
  data.push(nova);
  repo.save('AgilTarefas', data);
  return nova;
}

function atualizar(repo, id, patch) {
  return repo.update('AgilTarefas', id, { ...patch, updatedAt: new Date().toISOString() });
}

/**
 * Cascade delete: subtarefas e comentários da tarefa também são removidos.
 * Se esta tarefa era a Iniciativa de outras, elas NÃO são apagadas — só
 * perdem o vínculo (`iniciativaId`): remover o agrupador não pode destruir
 * o trabalho agrupado.
 */
function remover(repo, id) {
  const found = repo.delete('AgilTarefas', id);
  if (!found) return false;
  repo.save('AgilSubtarefas', repo.get('AgilSubtarefas').filter((s) => String(s.tarefaId) !== String(id)));
  repo.save('AgilComentarios', repo.get('AgilComentarios').filter((c) => String(c.tarefaId) !== String(id)));
  repo.save('AgilTarefas', repo.get('AgilTarefas').map((t) => (String(t.iniciativaId) === String(id) ? { ...t, iniciativaId: '' } : t)));
  return true;
}

/**
 * Reordena em lote (drag de card, dentro da mesma coluna ou entre colunas) —
 * um único get/save para todo o drop, em vez de uma escrita completa da
 * planilha por card movido.
 */
function reordenar(repo, itens) {
  const data = repo.get('AgilTarefas');
  const porId = new Map(itens.map((i) => [String(i.id), i]));
  const now = new Date().toISOString();
  const next = data.map((t) => {
    const patch = porId.get(String(t.id));
    return patch ? { ...t, colunaId: patch.colunaId, ordem: patch.ordem, updatedAt: now } : t;
  });
  repo.save('AgilTarefas', next);
  return next;
}

module.exports = { criar, atualizar, remover, reordenar };
