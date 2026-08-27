const crypto = require('crypto');
const { gravarReuniaoJson, removerReuniaoJson } = require('../reunioesJson.cjs');

/** Ver `server/dominio/clientes.cjs` para o significado de `opts.id`/`opts.efeitosExternos`. */
function criar(repo, payload, opts = {}) {
  const efeitosExternos = opts.efeitosExternos !== false;
  const data = repo.get('Agenda');
  const novo = { ...payload, id: opts.id ?? crypto.randomUUID() };
  data.push(novo);
  repo.save('Agenda', data);
  if (efeitosExternos) gravarReuniaoJson(novo);
  return novo;
}

function atualizar(repo, id, patch, opts = {}) {
  const efeitosExternos = opts.efeitosExternos !== false;
  const updated = repo.update('Agenda', id, patch);
  if (updated && efeitosExternos) gravarReuniaoJson(updated);
  return updated;
}

/**
 * Cascade de Lembretes por `eventId` roda sempre (consistência de dado).
 * `removerReuniaoJson` é efeito externo (apaga arquivo da pasta compartilhada
 * `REUNIOES_DIR`) — só em `efeitosExternos`.
 */
function remover(repo, id, opts = {}) {
  const efeitosExternos = opts.efeitosExternos !== false;
  const found = repo.delete('Agenda', id);
  if (!found) return false;
  repo.save('Lembretes', repo.get('Lembretes').filter((r) => String(r.eventId) !== String(id)));
  if (efeitosExternos) removerReuniaoJson(id);
  return true;
}

module.exports = { criar, atualizar, remover };
