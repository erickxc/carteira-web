const crypto = require('crypto');
const { gravarReuniaoJson, removerReuniaoJson } = require('../reunioesJson.cjs');

const TIPO_SOLICITACAO = 'Solicitação';

/** O Hub 2D grava o pedido de reunião como Contato + status Solicitado; aqui vira o tipo próprio. */
function comTipoDeSolicitacao(evento) {
  return /solicit/i.test(evento.status || '') ? { ...evento, type: TIPO_SOLICITACAO } : evento;
}

/**
 * Boot do servidor (idempotente): garante a categoria do tipo e converte os
 * pedidos gravados antes da conversão. Devolve quantos eventos converteu.
 */
function prepararSolicitacoes(repo) {
  const categorias = repo.get('Categorias');
  if (!categorias.some((c) => c.tipo === 'tipo_evento' && c.valor === TIPO_SOLICITACAO)) {
    const ordem = Math.max(-1, ...categorias.filter((c) => c.tipo === 'tipo_evento').map((c) => Number(c.ordem) || 0)) + 1;
    repo.save('Categorias', [...categorias, { id: crypto.randomUUID(), tipo: 'tipo_evento', valor: TIPO_SOLICITACAO, ordem, createdAt: new Date().toISOString() }]);
  }
  const alvo = repo.get('Agenda').filter((e) => /solicit/i.test(e.status || '') && e.type !== TIPO_SOLICITACAO);
  for (const e of alvo) atualizar(repo, e.id, { type: TIPO_SOLICITACAO }, { efeitosExternos: false });
  return alvo.length;
}

/** Ver `server/dominio/clientes.cjs` para o significado de `opts.id`/`opts.efeitosExternos`. */
function criar(repo, payload, opts = {}) {
  const efeitosExternos = opts.efeitosExternos !== false;
  const data = repo.get('Agenda');
  const novo = { ...comTipoDeSolicitacao(payload), id: opts.id ?? crypto.randomUUID() };
  data.push(novo);
  repo.save('Agenda', data);
  if (efeitosExternos) gravarReuniaoJson(novo);
  return novo;
}

function atualizar(repo, id, patch, opts = {}) {
  const efeitosExternos = opts.efeitosExternos !== false;
  const ataAntes = 'ata' in (patch ?? {}) ? repo.get('Agenda').find((e) => String(e.id) === String(id))?.ata : undefined;
  let updated = repo.update('Agenda', id, patch);
  if (updated && efeitosExternos) {
    // Ata editada num evento com PDF da ata anexado: o PDF é refeito (sempre o da ata atual).
    const { anexarAtaPdf, temAtaPdf } = require('../reuniao/ataPdfAnexo.cjs');
    if ('ata' in patch && patch.ata !== ataAntes && temAtaPdf(updated)) {
      try {
        anexarAtaPdf({ repo, evento: updated, uploadsDir: opts.uploadsDir, gravar: (p) => { updated = repo.update('Agenda', id, p) ?? updated; } });
      } catch (err) {
        console.warn(`agenda: PDF da ata não refeito (${id}): ${err.message}`);
      }
    }
    gravarReuniaoJson(updated);
  }
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

module.exports = { criar, atualizar, remover, prepararSolicitacoes };
