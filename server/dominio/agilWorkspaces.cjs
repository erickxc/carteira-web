const crypto = require('crypto');
const agilBoards = require('./agilBoards.cjs');

/**
 * Toda área de trabalho nasce com um board fixo de Iniciativas — compartilhado
 * por todos os quadros dela (não um por quadro, que era o defeito do modelo
 * anterior: workspace com 2 quadros normais acabava com 2 boards "Iniciativas"
 * duplicados). `AgilTarefa.iniciativaId` aponta pra uma tarefa DENTRO deste
 * board fixo — mesmo mecanismo de sempre (tarefa referenciando tarefa), só que
 * escopado por workspace em vez de por board.
 */
function criar(repo, payload, opts = {}) {
  const data = repo.get('AgilWorkspaces');
  const ordem = data.length;
  const nova = { descricao: '', ordem, ...payload, id: opts.id ?? crypto.randomUUID(), createdAt: new Date().toISOString() };
  data.push(nova);
  repo.save('AgilWorkspaces', data);

  const boardIniciativas = agilBoards.criar(repo, { workspaceId: nova.id, nome: 'Iniciativas' });
  const atualizada = repo.update('AgilWorkspaces', nova.id, { iniciativasBoardId: boardIniciativas.id });
  return atualizada ?? nova;
}

function atualizar(repo, id, patch) {
  return repo.update('AgilWorkspaces', id, patch);
}

/**
 * Cascade delete: todos os boards da workspace são removidos, cada um pelo
 * `agilBoards.cjs::remover()` já existente — reaproveita a cascade de board
 * (colunas, tarefas, subtarefas, comentários, campos personalizados) em vez de
 * duplicá-la aqui. O board de Iniciativas é só mais um board da workspace,
 * removido junto sem tratamento especial.
 */
function remover(repo, id) {
  const found = repo.delete('AgilWorkspaces', id);
  if (!found) return false;
  const boardsDaWorkspace = repo.get('AgilBoards').filter((b) => String(b.workspaceId) === String(id));
  for (const b of boardsDaWorkspace) agilBoards.remover(repo, b.id);
  return true;
}

/** Reordena em lote (drag da workspace na lista de gerenciamento). */
function reordenar(repo, itens) {
  const data = repo.get('AgilWorkspaces');
  const porId = new Map(itens.map((i) => [String(i.id), i.ordem]));
  const next = data.map((w) => (porId.has(String(w.id)) ? { ...w, ordem: porId.get(String(w.id)) } : w));
  repo.save('AgilWorkspaces', next);
  return next;
}

module.exports = { criar, atualizar, remover, reordenar };
