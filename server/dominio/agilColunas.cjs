const crypto = require('crypto');

const paiDe = (coluna) => String(coluna.parentId || '');

function criar(repo, payload) {
  const data = repo.get('AgilColunas');
  const parentId = String(payload.parentId || '');
  // Ordem é entre IRMÃS (mesmo pai), não entre todas as colunas do board.
  const ordem = data.filter(
    (c) => String(c.boardId) === String(payload.boardId) && paiDe(c) === parentId
  ).length;
  const nova = { ordem, ...payload, parentId, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  data.push(nova);
  repo.save('AgilColunas', data);

  // Ao transformar uma coluna em agrupador (ganhando sua primeira sub-coluna),
  // as tarefas que estavam nela ficariam num nó não-folha e desapareceriam do
  // board — só folhas são renderizadas. Move essas tarefas para a sub-coluna
  // nova. Idempotente: se o pai não tem tarefas, nada acontece.
  if (parentId) {
    const tarefas = repo.get('AgilTarefas');
    let mudou = false;
    const next = tarefas.map((t) => {
      if (String(t.colunaId) !== parentId) return t;
      mudou = true;
      return { ...t, colunaId: nova.id };
    });
    if (mudou) repo.save('AgilTarefas', next);
  }

  return nova;
}

function atualizar(repo, id, patch) {
  return repo.update('AgilColunas', id, patch);
}

/**
 * Cascade delete: sub-colunas da coluna, as tarefas de todas elas e as
 * subtarefas/comentários dessas tarefas.
 */
function remover(repo, id) {
  const colunas = repo.get('AgilColunas');
  if (!colunas.some((c) => String(c.id) === String(id))) return false;

  const idsColunas = new Set([
    String(id),
    ...colunas.filter((c) => paiDe(c) === String(id)).map((c) => String(c.id)),
  ]);
  repo.save('AgilColunas', colunas.filter((c) => !idsColunas.has(String(c.id))));

  const tarefas = repo.get('AgilTarefas');
  const tarefasRemovidas = tarefas.filter((t) => idsColunas.has(String(t.colunaId))).map((t) => String(t.id));
  repo.save('AgilTarefas', tarefas.filter((t) => !idsColunas.has(String(t.colunaId))));
  repo.save('AgilSubtarefas', repo.get('AgilSubtarefas').filter((s) => !tarefasRemovidas.includes(String(s.tarefaId))));
  repo.save('AgilComentarios', repo.get('AgilComentarios').filter((c) => !tarefasRemovidas.includes(String(c.tarefaId))));
  return true;
}

/** Reordena em lote (drag de coluna) — um único get/save em vez de N updates. */
function reordenar(repo, itens) {
  const data = repo.get('AgilColunas');
  const porId = new Map(itens.map((i) => [String(i.id), i.ordem]));
  const next = data.map((c) => (porId.has(String(c.id)) ? { ...c, ordem: porId.get(String(c.id)) } : c));
  repo.save('AgilColunas', next);
  return next;
}

module.exports = { criar, atualizar, remover, reordenar };
