const crypto = require('crypto');

function criar(repo, payload) {
  const data = repo.get('AgilFrentes');
  const ordem = data.filter((f) => String(f.boardId) === String(payload.boardId)).length;
  const nova = { cor: '#dabb6c', ordem, ...payload, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  data.push(nova);
  repo.save('AgilFrentes', data);
  return nova;
}

function atualizar(repo, id, patch) {
  return repo.update('AgilFrentes', id, patch);
}

/**
 * Remove a Frente SEM apagar as tarefas dela — diferente de coluna/swimlane
 * (estruturais), Frente é só uma etiqueta; as tarefas que a usavam ficam sem
 * frente, não desaparecem.
 */
function remover(repo, id) {
  const found = repo.delete('AgilFrentes', id);
  if (!found) return false;
  const tarefas = repo.get('AgilTarefas');
  const next = tarefas.map((t) => (String(t.frenteId) === String(id) ? { ...t, frenteId: '' } : t));
  repo.save('AgilTarefas', next);
  return true;
}

/** Reordena em lote (drag da Frente na lista de gerenciamento). */
function reordenar(repo, itens) {
  const data = repo.get('AgilFrentes');
  const porId = new Map(itens.map((i) => [String(i.id), i.ordem]));
  const next = data.map((f) => (porId.has(String(f.id)) ? { ...f, ordem: porId.get(String(f.id)) } : f));
  repo.save('AgilFrentes', next);
  return next;
}

module.exports = { criar, atualizar, remover, reordenar };
