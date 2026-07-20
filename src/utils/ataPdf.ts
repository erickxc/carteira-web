import jsPDF from 'jspdf';
import { format, parseISO } from 'date-fns';
import type { EventoAgenda } from '../types';

const GOLD: [number, number, number] = [218, 187, 108];
const DARK: [number, number, number] = [20, 20, 22];
const MUT: [number, number, number] = [110, 110, 118];
const TXT: [number, number, number] = [38, 38, 42];

function sanitize(s: string) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'reuniao';
}

/** Gera e baixa a Ata da reunião em PDF, com a marca da 2D Consultores. */
export function gerarAtaPdf(ev: Partial<EventoAgenda>) {
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
  const pa = ev.preAnalise;
  const ori = (pa?.orientacoes ?? []).filter((o) => o.cliente || o.produto || o.orientacao);
  if (ori.length || pa?.clientesGeral?.trim() || pa?.produtosGeral?.trim()) {
    h2('Pré-Análise');
    if (ori.length) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...TXT); ensure(5); doc.text('Orientações:', M, cy); cy += 5;
      ori.forEach((o) => par(`• ${[o.cliente, o.produto].filter(Boolean).join(' / ')}${o.orientacao ? `: ${o.orientacao}` : ''}`, 3));
    }
    if (pa?.clientesGeral?.trim()) { cy += 1; par(`Clientes em geral: ${pa.clientesGeral.trim()}`); }
    if (pa?.produtosGeral?.trim()) { par(`Produtos em geral: ${pa.produtosGeral.trim()}`); }
  }

  // --- Checklist ---
  const cl = ev.checklist ?? [];
  if (cl.length) {
    h2('Checklist / pauta');
    cl.forEach((i) => par(`${i.done ? '[x]' : '[ ]'} ${i.text}`, 3));
  }

  // --- Resumo ---
  if (ev.resumo?.trim()) { h2('Resumo da Reunião'); par(ev.resumo.trim()); }

  // --- Observações (ata) ---
  if (ev.ata?.trim()) { h2('Observações'); par(ev.ata.trim()); }

  // --- Descrição ---
  if (ev.description?.trim()) { h2('Descrição'); par(ev.description.trim()); }

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
