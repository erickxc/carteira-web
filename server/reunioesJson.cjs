const fs = require('fs');
const path = require('path');
const { REUNIOES_DIR } = require('./config.cjs');

// --- Exportação de reuniões em JSON (uma por arquivo, para outro sistema) ---
function parseMaybe(v, def) {
  if (v == null) return def;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return def; }
}
function sanitizeNome(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'reuniao';
}
function eventoParaJson(ev) {
  return {
    id: ev.id, clientId: ev.clientId, clientName: ev.clientName,
    tipo: ev.type, assunto: ev.subject, data: ev.date, hora: ev.time || '', duracao: ev.duracao || null,
    status: ev.status, servicos: parseMaybe(ev.servicos, []), checklist: parseMaybe(ev.checklist, []),
    preAnalise: parseMaybe(ev.preAnalise, { orientacoes: [], clientesGeral: '', produtosGeral: '' }),
    ata: ev.ata || '', resumo: ev.resumo || '', descricao: ev.description || '',
    anexos: parseMaybe(ev.attachments, []), serie: ev.serie || '', createdAt: ev.createdAt,
    exportedAt: new Date().toISOString(),
  };
}
function nomeArquivoReuniao(ev) {
  const d = String(ev.date || '').slice(0, 10) || 'sem-data';
  return `${d}__${sanitizeNome(ev.clientName)}__${ev.id}.json`;
}
function removerReuniaoJson(id) {
  try {
    if (!fs.existsSync(REUNIOES_DIR)) return;
    for (const f of fs.readdirSync(REUNIOES_DIR)) if (f.endsWith(`__${id}.json`)) fs.unlinkSync(path.join(REUNIOES_DIR, f));
  } catch (e) { console.error('Falha ao remover JSON da reunião:', e.message); }
}
function gravarReuniaoJson(ev) {
  try {
    if (!fs.existsSync(REUNIOES_DIR)) fs.mkdirSync(REUNIOES_DIR, { recursive: true });
    removerReuniaoJson(ev.id);
    fs.writeFileSync(path.join(REUNIOES_DIR, nomeArquivoReuniao(ev)), JSON.stringify(eventoParaJson(ev), null, 2), 'utf8');
  } catch (e) { console.error('Falha ao gravar JSON da reunião:', e.message); }
}

module.exports = { gravarReuniaoJson, removerReuniaoJson, REUNIOES_DIR };
