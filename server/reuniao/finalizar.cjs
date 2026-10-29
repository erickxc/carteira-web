// Fim da reunião: transcrição no evento, ata pelo mesmo motor do "Gerar ata com
// IA" (`redigirAtaReuniao`), transcrição e PDF da ata anexados e áudio apagado. A ordem é a
// garantia: o texto é salvo antes da IA (se ela falhar, nada se perde) e o
// áudio só some depois que a ata foi gravada.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { lerSegmentos, descartarEco, rotular, formatarTranscricao } = require('./transcricao.cjs');
const { listaJSON } = require('../../shared/cadenciaServico.cjs');

const MARCA = '> Gerada pelo monitorIA — revise antes de concluir.';

function secaoInsights(insights) {
  const linhas = (insights ?? []).map((i) => {
    let l = `- ${i.texto}`;
    if (i.acao) l += ` — ${i.acao}`;
    if (i.fontes) l += ` (Fontes: ${i.fontes})`;
    return l;
  });
  return `### Insights da reunião\n${linhas.length ? linhas.join('\n') : '- Nenhum.'}`;
}

async function finalizarReuniao({
  repo, eventId, pasta, insights, nomeMonitor,
  redigir = require('../ia/tools.cjs').redigirAtaReuniao,
  mutar = require('../fila/mutacao.cjs').executarMutacao,
  uploadsDir = require('../config.cjs').UPLOADS_DIR,
  anexarPdf = require('./ataPdfAnexo.cjs').anexarAtaPdf,
}) {
  const transcricao = formatarTranscricao(rotular(descartarEco(lerSegmentos(pasta)), nomeMonitor));
  mutar('agenda', 'update', { id: eventId, patch: { transcricao } });

  try {
    const { ataCompleta } = await redigir(repo, { eventId, salvar: false, transcricao });
    const evento = repo.get('Agenda').find((e) => String(e.id) === String(eventId));
    const data = new Date().toISOString().slice(0, 10);
    const originalName = `transcricao-${data}.txt`;
    const filename = `${crypto.randomUUID()}-${originalName}`;
    fs.writeFileSync(path.join(uploadsDir, filename), transcricao, 'utf8');
    const attachments = [...listaJSON(evento?.attachments), { id: filename, filename, originalName, uploadedAt: new Date().toISOString() }];
    const ata = `${MARCA}\n\n${ataCompleta}\n\n${secaoInsights(insights)}`;
    mutar('agenda', 'update', { id: eventId, patch: { ata, attachments } });
    // PDF da ata nos anexos. Falha aqui não perde a ata, que já foi gravada.
    try {
      anexarPdf({ repo, evento: { ...evento, transcricao, ata, attachments }, gravar: (patch) => mutar('agenda', 'update', { id: eventId, patch }), uploadsDir });
    } catch (err) {
      console.warn(`reunião: PDF da ata não gerado: ${err.message}`);
    }
  } catch (err) {
    return { ok: false, erro: err.message };
  }

  for (const f of fs.readdirSync(pasta)) {
    if (f.endsWith('.wav')) fs.rmSync(path.join(pasta, f), { force: true });
  }
  return { ok: true };
}

module.exports = { finalizarReuniao };
