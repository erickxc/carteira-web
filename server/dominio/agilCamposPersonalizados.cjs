const crypto = require('crypto');

// Por board (não global): cada quadro define os campos que fazem sentido pra
// ele (ex.: "Valor do contrato" num board de vendas, "Cliente afetado" num de
// suporte) — não são conceitos universais como Frente.
function criar(repo, payload, opts = {}) {
  const data = repo.get('AgilCamposPersonalizados');
  const ordem = data.filter((c) => String(c.boardId) === String(payload.boardId)).length;
  const novo = { ordem, ...payload, id: opts.id ?? crypto.randomUUID(), createdAt: new Date().toISOString() };
  data.push(novo);
  repo.save('AgilCamposPersonalizados', data);
  return novo;
}

function atualizar(repo, id, patch) {
  return repo.update('AgilCamposPersonalizados', id, patch);
}

/**
 * Remover a definição do campo NÃO limpa o valor já gravado nas tarefas
 * (`AgilTarefa.camposPersonalizados` é um JSON `{ campoId: valor }`) — o
 * valor órfão fica no JSON sem aparecer em lugar nenhum, mesmo espírito
 * não-destrutivo do resto do módulo (frenteId/iniciativaId órfãos também não
 * são limpos ativamente).
 */
function remover(repo, id) {
  return repo.delete('AgilCamposPersonalizados', id);
}

/** Reordena em lote (drag na lista de campos do board). */
function reordenar(repo, itens) {
  const data = repo.get('AgilCamposPersonalizados');
  const porId = new Map(itens.map((i) => [String(i.id), i.ordem]));
  const next = data.map((c) => (porId.has(String(c.id)) ? { ...c, ordem: porId.get(String(c.id)) } : c));
  repo.save('AgilCamposPersonalizados', next);
  return next;
}

module.exports = { criar, atualizar, remover, reordenar };
