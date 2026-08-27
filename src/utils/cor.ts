/**
 * Preto ou branco — o que tiver mais contraste sobre a cor de fundo dada
 * (hex #RRGGBB). Usado no cabeçalho colorido do modal de tarefa (cor da
 * Frente escolhida pelo usuário, livre) e em qualquer pastilha que precise de
 * texto legível sobre uma cor arbitrária, não uma paleta fixa.
 * Fórmula de luminância relativa (WCAG), com fallback pra preto se o hex vier
 * malformado (nunca deixa o texto invisível).
 */
export function corContrastante(hex: string): '#000000' | '#ffffff' {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return '#000000';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const luminancia = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminancia > 0.6 ? '#000000' : '#ffffff';
}
