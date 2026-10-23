// Lê o `transcricao.jsonl` que o transcritor (Python) vai anexando e transforma
// em texto de reunião: descarta o eco do microfone e rotula quem falou.
const fs = require('fs');
const path = require('path');

const palavras = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

function lerSegmentos(pasta) {
  const arquivo = path.join(pasta, 'transcricao.jsonl');
  if (!fs.existsSync(arquivo)) return [];
  const segs = [];
  // A última linha pode estar pela metade (o Python ainda escrevendo): é só ignorada.
  for (const linha of fs.readFileSync(arquivo, 'utf8').split('\n')) {
    try {
      const s = JSON.parse(linha);
      if (s && typeof s.texto === 'string') segs.push(s);
    } catch { /* linha incompleta ou malformada */ }
  }
  return segs;
}

function parecido(a, b) {
  const pa = new Set(palavras(a));
  const pb = new Set(palavras(b));
  if (pa.size < 3 || pb.size < 3) return false;
  const comum = [...pa].filter((p) => pb.has(p)).length;
  return comum / new Set([...pa, ...pb]).size >= 0.6;
}

// Sem fone, a voz do cliente sai na caixa e volta pelo microfone. Trecho do mic
// quase igual a um do "sistema" com início a até 3 s é eco. Limite conhecido:
// eco baixo, transcrito pela metade em fala simultânea, pode passar.
function descartarEco(segs) {
  const sistema = segs.filter((s) => s.faixa === 'sistema');
  return segs.filter((s) => s.faixa !== 'mic'
    || !sistema.some((o) => Math.abs(o.inicio - s.inicio) <= 3 && parecido(o.texto, s.texto)));
}

function rotular(segs, nomeMonitor) {
  return segs
    .map((s) => ({ falante: s.faixa === 'mic' ? nomeMonitor : 'Cliente', inicio: s.inicio, fim: s.fim, texto: s.texto }))
    .sort((a, b) => a.inicio - b.inicio);
}

const mmss = (seg) => `${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(Math.floor(seg % 60)).padStart(2, '0')}`;

function formatarTranscricao(rotulados) {
  return rotulados.map((r) => `[${mmss(r.inicio)}] ${r.falante}: ${r.texto}`).join('\n');
}

module.exports = { lerSegmentos, descartarEco, rotular, formatarTranscricao };
