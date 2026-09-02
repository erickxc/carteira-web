const crypto = require('crypto');

// Cores padrão das 3 colunas — mesmo trio usado pelo Kanbanize (azul/laranja/
// verde) na coluna "Requested/In Progress/Done". Aplicadas de saída pra as
// bolinhas de progresso da Iniciativa já funcionarem sem o usuário precisar
// configurar cor manualmente.
const CORES_PADRAO = ['#304373', '#d69a3c', '#4cae7a'];
const TITULOS_PADRAO = ['A Fazer', 'Em Andamento', 'Concluído'];

function criarColunasEswimlanePadrao(repo, boardId, now) {
  const colunas = repo.get('AgilColunas');
  TITULOS_PADRAO.forEach((titulo, ordem) => {
    colunas.push({ id: crypto.randomUUID(), boardId, titulo, ordem, cor: CORES_PADRAO[ordem], createdAt: now });
  });
  repo.save('AgilColunas', colunas);

  const swimlanes = repo.get('AgilSwimlanes');
  swimlanes.push({ id: crypto.randomUUID(), boardId, titulo: 'Geral', ordem: 0, createdAt: now });
  repo.save('AgilSwimlanes', swimlanes);
}

/**
 * `payload.ehIniciativas`: uso interno, só quando ESTA função cria o board
 * companheiro de Iniciativas (evita recursão infinita — o companheiro não
 * ganha o seu próprio companheiro). Chamadas normais (rotas HTTP) nunca
 * passam isso.
 */
function criar(repo, payload, opts = {}) {
  const data = repo.get('AgilBoards');
  const now = new Date().toISOString();
  const novo = { ...payload, id: opts.id ?? crypto.randomUUID(), createdAt: now };
  data.push(novo);
  repo.save('AgilBoards', data);
  criarColunasEswimlanePadrao(repo, novo.id, now);

  // Iniciativas é workflow PADRÃO de todo board (Kanbanize: "Initiatives
  // Workflow" vem embutido, não é algo que se vincula manualmente) — todo
  // board novo já nasce com o seu, criado e ligado automaticamente.
  if (!novo.ehIniciativas) {
    const iniciativas = criar(repo, {
      workspaceId: novo.workspaceId,
      nome: 'Iniciativas',
      ehIniciativas: true,
    });
    repo.update('AgilBoards', novo.id, { iniciativasBoardId: iniciativas.id });
    novo.iniciativasBoardId = iniciativas.id;
  }

  return novo;
}

function atualizar(repo, id, patch) {
  return repo.update('AgilBoards', id, patch);
}

/**
 * Cascade delete: colunas e tarefas do board também são removidas. Se o board
 * tem um companheiro de Iniciativas (`iniciativasBoardId`), ele é removido
 * junto — não faz sentido sobreviver órfão, sem nenhum board de Tarefas que o
 * mostre. Tarefas de OUTROS boards que apontavam pra uma tarefa-iniciativa
 * daqui perdem só o vínculo (`iniciativaId`) — não-destrutivo, mesmo espírito
 * do resto do módulo.
 */
function remover(repo, id) {
  const board = repo.get('AgilBoards').find((b) => String(b.id) === String(id));
  const found = repo.delete('AgilBoards', id);
  if (!found) return false;
  repo.save('AgilColunas', repo.get('AgilColunas').filter((c) => String(c.boardId) !== String(id)));
  const tarefasRemovidas = repo.get('AgilTarefas').filter((t) => String(t.boardId) === String(id)).map((t) => String(t.id));
  const tarefasRemovidasSet = new Set(tarefasRemovidas);
  repo.save('AgilTarefas', repo.get('AgilTarefas')
    .filter((t) => String(t.boardId) !== String(id))
    .map((t) => (tarefasRemovidasSet.has(String(t.iniciativaId)) ? { ...t, iniciativaId: '' } : t)));
  repo.save('AgilSwimlanes', repo.get('AgilSwimlanes').filter((s) => String(s.boardId) !== String(id)));
  repo.save('AgilFrentes', repo.get('AgilFrentes').filter((f) => String(f.boardId) !== String(id)));
  repo.save('AgilSubtarefas', repo.get('AgilSubtarefas').filter((s) => !tarefasRemovidasSet.has(String(s.tarefaId))));
  repo.save('AgilComentarios', repo.get('AgilComentarios').filter((c) => !tarefasRemovidasSet.has(String(c.tarefaId))));
  repo.save('AgilBoards', repo.get('AgilBoards').map((b) => (String(b.iniciativasBoardId) === String(id) ? { ...b, iniciativasBoardId: '' } : b)));

  if (board && board.iniciativasBoardId) {
    remover(repo, board.iniciativasBoardId);
  }
  return true;
}

module.exports = { criar, atualizar, remover };
