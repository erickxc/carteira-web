import jsPDF from 'jspdf';
import { format, parseISO } from 'date-fns';
import { preAnaliseParaTexto, type EventoAgenda } from '../types';
import type { AtaContexto } from './ata';

const GOLD: [number, number, number] = [218, 187, 108];
const DARK: [number, number, number] = [20, 20, 22];
const MUT: [number, number, number] = [110, 110, 118];
const TXT: [number, number, number] = [38, 38, 42];

function sanitize(s: string) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'reuniao';
}

/**
 * `ev.ata` (quando já foi gerada — automática ou por IA, ver `gerarAta` em
 * `src/utils/ata.ts`) já traz as seções 2/3/4 prontas e corretas, inclusive
 * com o que a IA identificou. Extrai o texto de uma seção pelo cabeçalho
 * literal que `gerarAta` sempre usa (linhas indentadas com 3 espaços, até o
 * próximo cabeçalho em maiúsculas ou o fim do texto).
 *
 * Bug que isso corrige: o PDF tinha sua PRÓPRIA lógica (mais fraca, sem IA)
 * pra reconstruir "O que foi tratado"/Decisões/Próximos passos a partir do
 * `resumo` cru — resultado: o resumo inteiro (às vezes vários parágrafos
 * emendados) caía como um bloco só na seção 2, ignorando a ata que já estava
 * certa na tela. Ler direto da ata elimina essa segunda fonte de verdade.
 */
function extrairSecaoAta(ata: string, cabecalho: string): string[] | null {
  const linhas = ata.split('\n');
  const inicio = linhas.findIndex((l) => l.trim() === cabecalho);
  if (inicio === -1) return null;
  const resto = linhas.slice(inicio + 1);
  const fimRel = resto.findIndex((l) => /^[A-ZÀ-Ú0-9][A-ZÀ-Ú0-9 .çÇ]*$/.test(l.trim()) && l.trim().length > 0);
  const corpo = fimRel === -1 ? resto : resto.slice(0, fimRel);
  return corpo.map((l) => l.trim()).filter(Boolean);
}

/**
 * Gera e baixa a Ata da reunião em PDF, com a marca da 2D Consultores.
 *
 * As seções seguem a MESMA estrutura de `gerarAta` (utils/ata.ts): antes o PDF
 * tinha layout próprio (Checklist / Resumo / Observações) e despejava a ata
 * inteira dentro de "Observações", repetindo o conteúdo — o documento enviado ao
 * cliente não batia com a ata vista na tela.
 */
export function gerarAtaPdf(ev: Partial<EventoAgenda>, ctx: AtaContexto = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 16, BOTTOM = 282;
  let cy = 0;

  // --- Cabeçalho: marca (seta ascendente) + wordmark 2D Consultores ---
  const S = 13, bx = M, by = 13, f = S / 32;
  doc.setFillColor(...DARK);
  doc.roundedRect(bx, by, S, S, 2.6, 2.6, 'F');
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.6);
  doc.setLineJoin('round'); doc.setLineCap('round');
  const pt = (px: number, py: number): [number, number] => [bx + (7.5 + 0.72 * px) * f, by + (7.5 + 0.72 * py) * f];
  const poly = (pts: [number, number][]) => { const m = pts.map(([a, b]) => pt(a, b)); for (let i = 0; i < m.length - 1; i++) doc.line(m[i][0], m[i][1], m[i + 1][0], m[i + 1][1]); };
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

  // --- helpers de conteúdo ---
  function ensure(h: number) { if (cy + h > BOTTOM) { doc.addPage(); cy = 20; } }
  function h2(t: string) { ensure(11); cy += 2; doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...GOLD); doc.text(t, M, cy); cy += 5.5; }
  function par(t: string, indent = 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...TXT);
    doc.splitTextToSize(t, W - 2 * M - indent).forEach((l: string) => { ensure(5); doc.text(l, M + indent, cy); cy += 5; });
  }
  function meta(label: string, val: string) {
    ensure(5.5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...MUT); doc.text(`${label}: `, M, cy);
    const lw = doc.getTextWidth(`${label}: `);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...TXT); doc.text(val || '—', M + lw, cy); cy += 5.5;
  }

  // --- título + metadados ---
  const d = ev.date ? parseISO(ev.date) : null;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...DARK);
  ensure(9); doc.text(ev.clientName || 'Reunião', M, cy); cy += 8;

  meta('Data', d ? format(d, 'dd/MM/yyyy') + (ev.time ? ` às ${ev.time}` : '') : '—');
  meta('Tipo', ev.type || '—');
  meta('Status', ev.status || '—');
  if (ev.subject) meta('Assunto', ev.subject);
  if (ev.servicos && ev.servicos.length) meta('Serviços', ev.servicos.join(', '));

  // --- Pré-Análise ---
  // `preAnaliseParaTexto` cobre os dois formatos: o texto breve atual e o
  // legado (tabela de orientações), que continuaria invisível aqui se o PDF
  // seguisse lendo só os campos antigos.
  const preAnaliseTexto = preAnaliseParaTexto(ev.preAnalise);
  if (preAnaliseTexto.trim()) {
    h2('Pré-Análise');
    preAnaliseTexto.split('\n').forEach((linha) => par(linha, 3));
  }

  // --- Participantes ---
  // Mesma regra da ata em texto: contatos do serviço tratado + o monitor.
  const servicosEv = ev.servicos ?? [];
  const contatos = ctx.cliente?.contatos ?? [];
  const doCliente = ctx.participantesCliente?.filter(Boolean) ?? (
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

  // --- 1. Pauta ---
  const cl = ev.checklist ?? [];
  h2('1. Pauta');
  if (cl.length === 0) par('(sem pauta registrada)', 3);
  else cl.forEach((i) => par(`${i.done ? '[x]' : '[ ]'} ${i.text}${i.done ? '' : '  (não tratado)'}`, 3));

  // --- 2/3/4: extraídas da própria `ev.ata` quando ela já foi gerada (tem a
  // estrutura de `gerarAta`, com IA ou não) — é a fonte de verdade correta,
  // já vista na tela. Só cai na heurística própria (resumo cru) pra atas
  // antigas/manuais que não têm esse formato.
  const ataTexto = ev.ata?.trim() ?? '';
  const secaoTratado = extrairSecaoAta(ataTexto, '2. O QUE FOI TRATADO');
  const secaoDecisoes = extrairSecaoAta(ataTexto, '3. DECISÕES');
  const secaoProximosPassos = extrairSecaoAta(ataTexto, '4. PRÓXIMOS PASSOS');

  const relato = ev.resumo?.trim() || ev.description?.trim() || '';

  // --- 2. O que foi tratado ---
  h2('2. O que foi tratado');
  if (secaoTratado) secaoTratado.forEach((l) => par(l, 3));
  else par(relato || '(a preencher)', 3);

  // --- 3. Decisões ---
  h2('3. Decisões');
  if (secaoDecisoes) {
    secaoDecisoes.forEach((l) => par(l, 3));
  } else {
    // Mesma heurística de `gerarAta` pra ata sem esse formato: linha do
    // relato que começa com marcador de decisão.
    const decisoes = relato
      .split('\n')
      .map((l) => l.replace(/^\s*(?:[-*•—]|\d+[.)])\s*/, '').trim())
      .filter((l) => /^(decis|decidid|ficou\s+(definido|acordado)|acordad)/i.test(l));
    if (decisoes.length > 0) decisoes.forEach((x) => par(`— ${x}`, 3));
    else par('(a preencher)', 3);
  }

  // --- 4. Próximos passos ---
  h2('4. Próximos passos');
  if (secaoProximosPassos) {
    secaoProximosPassos.forEach((l) => par(l, 3));
  } else {
    const pendentes = cl.filter((i) => !i.done).map((i) => i.text);
    if (pendentes.length > 0) pendentes.forEach((p) => par(`[2D] ${p}`, 3));
    else par('(a preencher)', 3);
  }

  // --- Ata editada à mão ---
  // Só entra se `ev.ata` NÃO segue o formato de `gerarAta` (já extraído acima)
  // — senão o PDF repetiria o conteúdo das seções 2-4 de novo aqui embaixo.
  if (ataTexto && !secaoTratado) {
    h2('Observações');
    par(ataTexto, 3);
  }

  // --- Rodapé em todas as páginas ---
  const pages = doc.getNumberOfPages();
  const geradoEm = format(new Date(), "dd/MM/yyyy 'às' HH:mm");
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...GOLD); doc.setLineWidth(0.4); doc.line(M, 288, W - M, 288);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUT);
    doc.text(`2D Consultores — Ata gerada em ${geradoEm}`, M, 293);
    doc.text(`${p}/${pages}`, W - M, 293, { align: 'right' });
  }

  const nome = `Ata_${sanitize(ev.clientName || '')}_${d ? format(d, 'yyyy-MM-dd') : 'sem-data'}.pdf`;
  doc.save(nome);
}
