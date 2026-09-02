/**
 * Separação da resposta do modelo em blocos (parágrafo, lista, título).
 *
 * Módulo separado do componente por duas razões: a regra do projeto de
 * fast-refresh (arquivo de componente só exporta componente) e o teste —
 * isto é função pura e roda no ambiente `node` do vitest, sem DOM.
 */
export type Bloco =
  | { tipo: 'paragrafo'; linhas: string[] }
  | { tipo: 'lista'; ordenada: boolean; itens: string[] }
  | { tipo: 'titulo'; texto: string };

/**
 * `[rótulo](url)` só é reconhecido como link de verdade quando a URL aponta
 * pra `/uploads/<arquivo>` — o único link que o chat de fato produz hoje
 * (`gerar_ata_pdf`, ver `server/ia/tools.cjs`). Extraído aqui (não em
 * `RespostaIA.tsx`) pelo mesmo motivo do resto deste arquivo: função pura,
 * testável em `node` sem precisar montar componente/DOM.
 */
export function extrairLinkUpload(parteInline: string): { rotulo: string; arquivo: string } | null {
  const m = parteInline.match(/^\[([^\]\n]+)\]\(\/uploads\/([^/\s)]+)\)$/);
  return m ? { rotulo: m[1], arquivo: decodeURIComponent(m[2]) } : null;
}

/**
 * Agrupa as linhas em blocos. Feito em duas etapas (blocos, depois inline) em
 * vez de linha a linha porque bullets consecutivos precisam virar UMA lista —
 * um `<ul>` por item quebraria o espaçamento.
 */
export function separarBlocos(texto: string): Bloco[] {
  const blocos: Bloco[] = [];
  let atual: Bloco | null = null;

  const fechar = () => { if (atual) { blocos.push(atual); atual = null; } };

  for (const linha of texto.replace(/\r\n/g, '\n').split('\n')) {
    const t = linha.trim();

    if (!t) { fechar(); continue; }

    const titulo = t.match(/^#{1,6}\s+(.*)$/);
    if (titulo) { fechar(); blocos.push({ tipo: 'titulo', texto: titulo[1] }); continue; }

    // `- item`, `* item` ou `• item`. Exige o espaço: sem ele, uma frase que
    // comece com `*negrito*` seria confundida com bullet.
    const bullet = t.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      if (atual?.tipo !== 'lista' || atual.ordenada) { fechar(); atual = { tipo: 'lista', ordenada: false, itens: [] }; }
      (atual as { itens: string[] }).itens.push(bullet[1]);
      continue;
    }

    const numerada = t.match(/^\d+[.)]\s+(.*)$/);
    if (numerada) {
      if (atual?.tipo !== 'lista' || !atual.ordenada) { fechar(); atual = { tipo: 'lista', ordenada: true, itens: [] }; }
      (atual as { itens: string[] }).itens.push(numerada[1]);
      continue;
    }

    if (atual?.tipo !== 'paragrafo') { fechar(); atual = { tipo: 'paragrafo', linhas: [] }; }
    (atual as { linhas: string[] }).linhas.push(t);
  }
  fechar();
  return blocos;
}
