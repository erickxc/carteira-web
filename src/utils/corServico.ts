/**
 * Cor de referência por Serviço (badges da tabela de Clientes) — configurável
 * em Configurações → Categorias → Serviço (`Categoria.cor`, hex). Sem cor
 * configurada, cai num fallback determinístico (hash do nome → paleta fixa)
 * em vez de tudo virar a mesma cor "accent" — é o que motivou o pedido: dar
 * pra distinguir os serviços de bate-olho na tabela, sem precisar configurar
 * nada antes de já ficar diferenciado.
 */
const PALETA_FALLBACK = [
  '#dabb6c', '#68818d', '#cc6300', '#304373', '#8a6fb0',
  '#4a8f6b', '#c25b5b', '#5c8fc2', '#a3763f', '#7a9e3f',
];

function hashSimples(texto: string): number {
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) >>> 0;
  return h;
}

/** `corConfigurada` (de `Categoria.cor`) tem prioridade; sem ela, uma cor
 *  estável (mesmo serviço sempre cai na mesma cor da paleta) pelo nome. */
export function corDoServico(nome: string, corConfigurada?: string | null): string {
  if (corConfigurada) return corConfigurada;
  return PALETA_FALLBACK[hashSimples(nome) % PALETA_FALLBACK.length];
}

/** #RRGGBB -> "r, g, b", pra compor `rgba(...)` (fundo suave + texto na cor
 *  sólida) sem depender de biblioteca de cor. Cor inválida cai num cinza neutro. */
export function hexParaRgb(hex: string): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return '128, 128, 128';
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
