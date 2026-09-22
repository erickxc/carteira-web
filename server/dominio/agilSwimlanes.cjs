const crypto = require('crypto');

/**
 * Swimlanes são OPCIONAIS por board: um board sem nenhuma linha aqui continua
 * um grid simples de colunas (comportamento de sempre, `AgilTarefa.swimlaneId`
 * vazio = "raia padrão", sem cabeçalho de raia nenhum na tela). Só vira grid
 * 2D quando o usuário cria a primeira swimlane pelo board.
 */
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

/**
 * Remover uma swimlane não apaga as tarefas dela — elas voltam pra raia
 * padrão (`swimlaneId` limpo), mesmo espírito não-destrutivo de remover uma
 * Frente ou desvincular uma Iniciativa.
 */
function remover(repo, id) {
  const found = repo.delete('AgilSwimlanes', id);
  if (!found) return false;
  repo.save('AgilTarefas', repo.get('AgilTarefas').map((t) => (String(t.swimlaneId) === String(id) ? { ...t, swimlaneId: '' } : t)));
  return true;
}

/** Reordena em lote (drag do cabeçalho de swimlane). */
function reordenar(repo, itens) {
  const data = repo.get('AgilSwimlanes');
  const porId = new Map(itens.map((i) => [String(i.id), i.ordem]));
  const next = data.map((s) => (porId.has(String(s.id)) ? { ...s, ordem: porId.get(String(s.id)) } : s));
  repo.save('AgilSwimlanes', next);
  return next;
}

module.exports = { criar, atualizar, remover, reordenar };
