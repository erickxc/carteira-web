const crypto = require('crypto');

function criar(repo, payload, opts = {}) {
  const data = repo.get('AgilIniciativas');
  const ordem = data.filter((i) => String(i.boardId) === String(payload.boardId)).length;
  const nova = { ordem, ...payload, id: opts.id ?? crypto.randomUUID(), createdAt: new Date().toISOString() };
  data.push(nova);
  repo.save('AgilIniciativas', data);
  return nova;
}

function atualizar(repo, id, patch) {
  return repo.update('AgilIniciativas', id, patch);
}

/**
 * Remover um agrupador não pode destruir o trabalho agrupado: tarefas que
 * apontavam pra esta iniciativa só perdem o vínculo (`iniciativaId`), mesmo
 * espírito do que já valia para o antigo board de Iniciativas.
 */
function remover(repo, id) {
  const found = repo.delete('AgilIniciativas', id);
  if (!found) return false;
  repo.save('AgilTarefas', repo.get('AgilTarefas').map((t) => (String(t.iniciativaId) === String(id) ? { ...t, iniciativaId: '' } : t)));
  return true;
}

/** Reordena em lote (drag na lista de iniciativas do board). */
function reordenar(repo, itens) {
  const data = repo.get('AgilIniciativas');
  const porId = new Map(itens.map((i) => [String(i.id), i.ordem]));
  const next = data.map((i) => (porId.has(String(i.id)) ? { ...i, ordem: porId.get(String(i.id)) } : i));
  repo.save('AgilIniciativas', next);
  return next;
}

module.exports = { criar, atualizar, remover, reordenar };
