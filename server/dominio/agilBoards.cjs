const crypto = require('crypto');

// 5 colunas de período — padrão de saída, editável depois (renomear, somar,
// remover, WIP limit, 2 níveis). Cores mantêm o espírito do trio anterior
// (Kanbanize), estendido pras 2 colunas novas.
const CORES_PADRAO = ['#8a8a93', '#304373', '#d69a3c', '#7c5cbf', '#4cae7a'];
const TITULOS_PADRAO = ['Backlog', 'A fazer', 'Em andamento', 'Validação', 'Concluído'];

function criarColunasPadrao(repo, boardId, now) {
  const colunas = repo.get('AgilColunas');
  TITULOS_PADRAO.forEach((titulo, ordem) => {
    colunas.push({ id: crypto.randomUUID(), boardId, titulo, ordem, cor: CORES_PADRAO[ordem], createdAt: now });
  });
  repo.save('AgilColunas', colunas);
}

function criar(repo, payload, opts = {}) {
  const data = repo.get('AgilBoards');
  const now = new Date().toISOString();
  const novo = { ...payload, id: opts.id ?? crypto.randomUUID(), createdAt: now };
  data.push(novo);
  repo.save('AgilBoards', data);
  criarColunasPadrao(repo, novo.id, now);
  return novo;
}

function atualizar(repo, id, patch) {
  return repo.update('AgilBoards', id, patch);
}

/**
 * Cascade delete: colunas, tarefas (e subtarefas/comentários delas),
 * iniciativas e campos personalizados do board são removidos. Frentes são
 * globais — sobrevivem ao
 * board, só perdem o vínculo nas tarefas removidas (que já somem junto).
 */
function remover(repo, id) {
  const found = repo.delete('AgilBoards', id);
  if (!found) return false;
  repo.save('AgilColunas', repo.get('AgilColunas').filter((c) => String(c.boardId) !== String(id)));
  repo.save('AgilIniciativas', repo.get('AgilIniciativas').filter((i) => String(i.boardId) !== String(id)));
  repo.save('AgilCamposPersonalizados', repo.get('AgilCamposPersonalizados').filter((c) => String(c.boardId) !== String(id)));
  const tarefasRemovidas = repo.get('AgilTarefas').filter((t) => String(t.boardId) === String(id)).map((t) => String(t.id));
  const tarefasRemovidasSet = new Set(tarefasRemovidas);
  repo.save('AgilTarefas', repo.get('AgilTarefas').filter((t) => String(t.boardId) !== String(id)));
  repo.save('AgilSubtarefas', repo.get('AgilSubtarefas').filter((s) => !tarefasRemovidasSet.has(String(s.tarefaId))));
  repo.save('AgilComentarios', repo.get('AgilComentarios').filter((c) => !tarefasRemovidasSet.has(String(c.tarefaId))));
  return true;
}

module.exports = { criar, atualizar, remover };
