/**
 * Cor de uma série/legenda usada como cor de TEXTO (o número da legenda), que
 * substituiu a bolinha colorida ao lado do rótulo (rejeitada pelo usuário na
 * revisão 1.6). As cores semânticas vivas não passam AA como texto no tema
 * claro, então vão para a variante `-fg`; tokens de tipo/texto já são legíveis;
 * qualquer outra coisa (fundo de card, borda, color-mix) vira o texto padrão.
 */
export function corDeTexto(cor: string): string {
  const c = cor.trim();
  const semantica = /^var\(--(success|danger|warning|gratuidade|accent)\)$/.exec(c);
  if (semantica) return `var(--${semantica[1]}-fg)`;
  if (/^var\(--(tipo-[a-z0-9-]+|text-(primary|secondary|muted))\)$/.test(c)) return c;
  return 'var(--text-primary)';
}
