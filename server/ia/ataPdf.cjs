const { jsPDF } = require('jspdf');
const { format, parseISO } = require('date-fns');

/**
 * Port server-side (CommonJS) de `src/utils/ataPdf.ts` — mesmo layout/marca,
 * pra que a ata em PDF gerada pelo monitorIA no chat (`gerar_ata_pdf`,
 * `server/ia/tools.cjs`) seja visualmente idêntica à que o botão no
 * navegador gera. jsPDF roda sem DOM (só texto/vetor, sem canvas/imagem
 * aqui) — verificado que funciona puro em Node antes de portar.
 *
 * Import automático das duas versões ficarem divergentes é o risco real
 * dessa duplicação: qualquer mudança de layout em `src/utils/ataPdf.ts`
 * precisa ser espelhada aqui também (não dá pra importar TS/ESM de dentro
 * de um `.cjs` de servidor sem build step).
 */

const GOLD = [218, 187, 108];
const DARK = [20, 20, 22];
const MUT = [110, 110, 118];
const TXT = [38, 38, 42];

function sanitize(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'reuniao';
}

/** Mesma lógica de `preAnaliseParaTexto` (src/types/index.ts), pra objeto já deserializado. */
function preAnaliseParaTexto(pa) {
  if (!pa) return '';
  if (pa.texto && pa.texto.trim()) return pa.texto;
  const partes = [];
  (pa.orientacoes ?? []).forEach((o) => {
    const cabeca = [o.cliente, o.produto].filter(Boolean).join(' / ');
    const linha = [cabeca, o.orientacao].filter(Boolean).join(': ');
    if (linha) partes.push(linha);
  });
  if (pa.clientesGeral && pa.clientesGeral.trim()) partes.push(`Clientes em geral: ${pa.clientesGeral.trim()}`);
  if (pa.produtosGeral && pa.produtosGeral.trim()) partes.push(`Produtos em geral: ${pa.produtosGeral.trim()}`);
  return partes.join('\n');
}

/** Idêntica à versão do frontend — ver comentário lá sobre o porquê do regex. */
function extrairSecaoAta(ata, cabecalho) {
  const linhas = ata.split('\n');
  const inicio = linhas.findIndex((l) => l.trim() === cabecalho);
  if (inicio === -1) return null;
  const resto = linhas.slice(inicio + 1);
  const fimRel = resto.findIndex((l) => /^[A-ZÀ-Ú0-9][A-ZÀ-Ú0-9 .çÇ]*$/.test(l.trim()) && l.trim().length > 0);
  const corpo = fimRel === -1 ? resto : resto.slice(0, fimRel);
  return corpo.map((l) => l.trim()).filter(Boolean);
}

/**
 * Gera a Ata em PDF e devolve os bytes prontos (não escreve em disco nem
 * abre nada — quem chama decide: `tools.cjs` salva em `UPLOADS_DIR` quando
 * o monitorIA gera pelo chat).
 *
 * `ev` já deve vir com os campos JSON deserializados (checklist/monitores/
 * servicos/attachments via `listaJSON`, preAnalise via `JSON.parse`) — quem
 * chama (a ferramenta) é responsável por isso, igual faz pro resto do app.
 */
function gerarAtaPdfBuffer(ev, ctx = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 16, BOTTOM = 282;
  let cy = 0;

  const S = 13, bx = M, by = 13, f = S / 32;
  doc.setFillColor(...DARK);
  doc.roundedRect(bx, by, S, S, 2.6, 2.6, 'F');
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.6);
  doc.setLineJoin('round'); doc.setLineCap('round');
  const pt = (px, py) => [bx + (7.5 + 0.72 * px) * f, by + (7.5 + 0.72 * py) * f];
  const poly = (pts) => { const m = pts.map(([a, b]) => pt(a, b)); for (let i = 0; i < m.length - 1; i++) doc.line(m[i][0], m[i][1], m[i + 1][0], m[i + 1][1]); };
  poly([[22, 7], [13.5, 15.5], [8.5, 10.5], [2, 17]]);
  poly([[16, 7], [22, 7], [22, 13]]);

  doc.setTextColor(...DARK); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text('2D CONSULTORES', bx + S + 5, by + 6.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUT);
  doc.text('Carteira de Monitoria', bx + S + 5, by + 11.5);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...GOLD);
  doc.text('ATA DE REUNIÃO', W - M, by + 6.5, { align: 'right' });

  cy = by + S + 4;
  doc.setDrawColor(...GOLD); doc.setLineWidth(0.8); doc.line(M, cy, W - M, cy);
  cy += 9;

  function ensure(h) { if (cy + h > BOTTOM) { doc.addPage(); cy = 20; } }
  function h2(t) { ensure(11); cy += 2; doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...GOLD); doc.text(t, M, cy); cy += 5.5; }
  function par(t, indent = 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...TXT);
    doc.splitTextToSize(t, W - 2 * M - indent).forEach((l) => { ensure(5); doc.text(l, M + indent, cy); cy += 5; });
  }
  function meta(label, val) {
    ensure(5.5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...MUT); doc.text(`${label}: `, M, cy);
    const lw = doc.getTextWidth(`${label}: `);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...TXT); doc.text(val || '—', M + lw, cy); cy += 5.5;
  }

  const d = ev.date ? parseISO(ev.date) : null;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...DARK);
  ensure(9); doc.text(ev.clientName || 'Reunião', M, cy); cy += 8;

  meta('Data', d ? format(d, 'dd/MM/yyyy') + (ev.time ? ` às ${ev.time}` : '') : '—');
  meta('Tipo', ev.type || '—');
  meta('Status', ev.status || '—');
  if (ev.subject) meta('Assunto', ev.subject);
  if (ev.servicos && ev.servicos.length) meta('Serviços', ev.servicos.join(', '));

  const preAnaliseTexto = preAnaliseParaTexto(ev.preAnalise);
  if (preAnaliseTexto.trim()) {
    h2('Pré-Análise');
    preAnaliseTexto.split('\n').forEach((linha) => par(linha, 3));
  }

  const servicosEv = ev.servicos ?? [];
  const contatos = ctx.cliente?.contatos ?? [];
  const doCliente = (ctx.participantesCliente?.filter(Boolean)) ?? (
    servicosEv.length > 0
      ? contatos.filter((c) => (c.servicos ?? []).length === 0 || (c.servicos ?? []).some((s) => servicosEv.includes(s)))
      : contatos
  ).map((c) => (c.cargo ? `${c.nome} (${c.cargo})` : c.nome));
  const monitoresEv = ev.monitores ?? [];
  if (doCliente.length > 0 || monitoresEv.length > 0) {
    h2('Participantes');
    doCliente.forEach((p) => par(`• ${p} — ${ev.clientName ?? 'cliente'}`, 3));
    monitoresEv.forEach((m) => par(`• ${m} — 2D Consultores`, 3));
  }

  const cl = ev.checklist ?? [];
  h2('1. Pauta');
  if (cl.length === 0) par('(sem pauta registrada)', 3);
  else cl.forEach((i) => par(`${i.done ? '[x]' : '[ ]'} ${i.text}${i.done ? '' : '  (não tratado)'}`, 3));

  const ataTexto = ev.ata?.trim() ?? '';
  const secaoTratado = extrairSecaoAta(ataTexto, '2. O QUE FOI TRATADO');
  const secaoDecisoes = extrairSecaoAta(ataTexto, '3. DECISÕES');
  const secaoProximosPassos = extrairSecaoAta(ataTexto, '4. PRÓXIMOS PASSOS');
  const relato = ev.resumo?.trim() || ev.description?.trim() || '';

  h2('2. O que foi tratado');
  if (secaoTratado) secaoTratado.forEach((l) => par(l, 3));
  else par(relato || '(a preencher)', 3);

  h2('3. Decisões');
  if (secaoDecisoes) {
    secaoDecisoes.forEach((l) => par(l, 3));
  } else {
    const decisoes = relato
      .split('\n')
      .map((l) => l.replace(/^\s*(?:[-*•—]|\d+[.)])\s*/, '').trim())
      .filter((l) => /^(decis|decidid|ficou\s+(definido|acordado)|acordad)/i.test(l));
    if (decisoes.length > 0) decisoes.forEach((x) => par(`— ${x}`, 3));
    else par('(a preencher)', 3);
  }

  h2('4. Próximos passos');
  if (secaoProximosPassos) {
    secaoProximosPassos.forEach((l) => par(l, 3));
  } else {
    const pendentes = cl.filter((i) => !i.done).map((i) => i.text);
    if (pendentes.length > 0) pendentes.forEach((p) => par(`[2D] ${p}`, 3));
    else par('(a preencher)', 3);
  }

  if (ataTexto && !secaoTratado) {
    h2('Observações');
    par(ataTexto, 3);
  }

  const pages = doc.getNumberOfPages();
  const geradoEm = format(new Date(), "dd/MM/yyyy 'às' HH:mm");
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...GOLD); doc.setLineWidth(0.4); doc.line(M, 288, W - M, 288);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUT);
    doc.text(`2D Consultores — Ata gerada em ${geradoEm}`, M, 293);
    doc.text(`${p}/${pages}`, W - M, 293, { align: 'right' });
  }

  const nomeArquivo = `Ata_${sanitize(ev.clientName || '')}_${d ? format(d, 'yyyy-MM-dd') : 'sem-data'}.pdf`;
  doc.setProperties({ title: nomeArquivo.replace(/\.pdf$/, '') });
  const buffer = Buffer.from(doc.output('arraybuffer'));
  return { buffer, nomeArquivo };
}

module.exports = { gerarAtaPdfBuffer };
