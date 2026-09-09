const crypto = require('crypto');

// Global (não por board) — marcos do dia a dia da 2D, iguais em qualquer quadro.
function criar(repo, payload, opts = {}) {
  const data = repo.get('AgilFrentes');
  const ordem = data.length;
  const nova = { ordem, ...payload, id: opts.id ?? crypto.randomUUID(), createdAt: new Date().toISOString() };
  data.push(nova);
  repo.save('AgilFrentes', data);
  return nova;
}

function atualizar(repo, id, patch) {
  return repo.update('AgilFrentes', id, patch);
}

/** Remover a Frente não apaga tarefas — só limpa `frenteId` das que a usavam. */
function remover(repo, id) {
  const found = repo.delete('AgilFrentes', id);
  if (!found) return false;
  repo.save('AgilTarefas', repo.get('AgilTarefas').map((t) => (String(t.frenteId) === String(id) ? { ...t, frenteId: '' } : t)));
  return true;
}

/** Reordena em lote (drag na lista de Frentes em Configurações do Ágil). */
function reordenar(repo, itens) {
  const data = repo.get('AgilFrentes');
  const porId = new Map(itens.map((i) => [String(i.id), i.ordem]));
  const next = data.map((f) => (porId.has(String(f.id)) ? { ...f, ordem: porId.get(String(f.id)) } : f));
  repo.save('AgilFrentes', next);
  return next;
}

module.exports = { criar, atualizar, remover, reordenar };
