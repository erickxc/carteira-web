const crypto = require('crypto');

function criar(repo, payload, opts = {}) {
  const data = repo.get('AgilSwimlanes');
  const ordem = data.filter((s) => String(s.boardId) === String(payload.boardId)).length;
  const nova = { ordem, ...payload, id: opts.id ?? crypto.randomUUID(), createdAt: new Date().toISOString() };
  data.push(nova);
  repo.save('AgilSwimlanes', data);
  return nova;
}

function atualizar(repo, id, patch) {
  return repo.update('AgilSwimlanes', id, patch);
}

/** Cascade delete: tarefas da swimlane (e subtarefas/comentários delas) também são removidas. */
function remover(repo, id) {
  const found = repo.delete('AgilSwimlanes', id);
  if (!found) return false;
  const tarefasRemovidas = repo.get('AgilTarefas').filter((t) => String(t.swimlaneId) === String(id)).map((t) => String(t.id));
  repo.save('AgilTarefas', repo.get('AgilTarefas').filter((t) => String(t.swimlaneId) !== String(id)));
  repo.save('AgilSubtarefas', repo.get('AgilSubtarefas').filter((s) => !tarefasRemovidas.includes(String(s.tarefaId))));
  repo.save('AgilComentarios', repo.get('AgilComentarios').filter((c) => !tarefasRemovidas.includes(String(c.tarefaId))));
  return true;
}

/** Reordena em lote (drag de swimlane) — um único get/save em vez de N updates. */
function reordenar(repo, itens) {
  const data = repo.get('AgilSwimlanes');
  const porId = new Map(itens.map((i) => [String(i.id), i.ordem]));
  const next = data.map((s) => (porId.has(String(s.id)) ? { ...s, ordem: porId.get(String(s.id)) } : s));
  repo.save('AgilSwimlanes', next);
  return next;
}

module.exports = { criar, atualizar, remover, reordenar };
