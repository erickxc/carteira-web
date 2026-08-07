import jsPDF from 'jspdf';

const GOLD: [number, number, number] = [218, 187, 108];
const DARK: [number, number, number] = [20, 20, 22];
const MUT: [number, number, number] = [110, 110, 118];
const TXT: [number, number, number] = [38, 38, 42];

// A fonte padrão do jsPDF (helvetica/WinAnsi) não tem glifo pra setas Unicode
// (→ ← ↔) — sem isso, viravam caracteres corrompidos no PDF ("R$560k !' R$490k"
// em vez de "R$560k → R$490k"). Aspas curvas e "—"/"•" já são suportados, só
// setas precisam de substituição.
function semSetas(s: string) {
  return s.replace(/→/g, '->').replace(/←/g, '<-').replace(/↔/g, '<->');
}

function sanitize(s: string) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'relatorio';
}

export interface CapituloRelatorio {
  titulo: string;
  texto: string;
}

export interface DadosRelatorioReuniao {
  /** Nome do cliente identificado — vai no lugar de "[Empresa]" do template. */
  empresa: string;
  /** Linha de data como veio da transcrição (ex.: "qui., 6 de ago. de 2026"). */
  data: string;
  resumo: string;
  capitulos: CapituloRelatorio[];
  tarefas: string;
  /** Não vem da transcrição — preenchida manualmente antes de gerar (pode ficar vazia). */
  perguntasChave: string;
  blocoNotas: string;
}

/** Gera o PDF no layout "RELATÓRIO 2D - ALVOS" (mesma marca visual da Ata:
 * cabeçalho preto, logo seta ascendente, acento dourado), preenchido a partir
 * das seções extraídas da transcrição da reunião. */
export function gerarRelatorioReuniaoPdf(dados: DadosRelatorioReuniao) {
  const d: DadosRelatorioReuniao = {
    empresa: semSetas(dados.empresa),
    data: semSetas(dados.data),
    resumo: semSetas(dados.resumo),
    capitulos: dados.capitulos.map((c) => ({ titulo: semSetas(c.titulo), texto: semSetas(c.texto) })),
    tarefas: semSetas(dados.tarefas),
    perguntasChave: semSetas(dados.perguntasChave),
    blocoNotas: semSetas(dados.blocoNotas),
  };
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 16, BOTTOM = 282;
  let cy = 0;

  // --- Cabeçalho: barra preta + "RELATÓRIO 2D" ---
  doc.setFillColor(...DARK);
  doc.rect(0, 0, W, 16, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text('RELATÓRIO 2D - ALVOS', W - M, 10, { align: 'right' });
  doc.text('2D CONSULTORES', M, 10);

  cy = 28;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...DARK);
  doc.text(d.empresa || '[Empresa]', M, cy); cy += 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...MUT);
  doc.text(d.data || '—', M, cy); cy += 4;

  doc.setDrawColor(...GOLD); doc.setLineWidth(0.8); doc.line(M, cy + 3, W - M, cy + 3);
  cy += 12;

  function ensure(h: number) { if (cy + h > BOTTOM) { doc.addPage(); cy = 20; } }
  function h2(t: string) { ensure(11); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...GOLD); doc.text(t, M, cy); cy += 6; }
  function par(t: string, indent = 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...TXT);
    doc.splitTextToSize(t, W - 2 * M - indent).forEach((l: string) => { ensure(5); doc.text(l, M + indent, cy); cy += 5; });
  }
  function linhasDeLista(bloco: string) {
    return bloco.split('\n').map((l) => l.trim()).filter(Boolean);
  }

  h2('Resumo');
  if (d.resumo.trim()) linhasDeLista(d.resumo).forEach((l) => par(l.replace(/^[•*]\s*/, '• ')));
  else par('—');
  cy += 3;

  h2('Capítulos e tópicos');
  if (d.capitulos.length) {
    d.capitulos.forEach((c) => {
      ensure(6);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...TXT);
      doc.text(c.titulo, M, cy); cy += 5;
      if (c.texto) par(c.texto, 3);
      cy += 2;
    });
  } else {
    par('—');
  }
  cy += 1;

  h2('Tarefas');
  if (d.tarefas.trim()) linhasDeLista(d.tarefas).forEach((l) => par(l.replace(/^[•*]\s*/, '• ')));
  else par('—');
  cy += 3;

  h2('Perguntas-chave');
  par(d.perguntasChave.trim() || '—');
  cy += 3;

  h2('Bloco de Notas');
  par(d.blocoNotas.trim() || '* Sem anotações');

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...GOLD); doc.setLineWidth(0.4); doc.line(M, 288, W - M, 288);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUT);
    doc.text('2D CONSULTORES', M, 293);
    doc.text(`${p}/${pages}`, W - M, 293, { align: 'right' });
  }

  doc.save(`Relatorio_${sanitize(d.empresa)}.pdf`);
}
