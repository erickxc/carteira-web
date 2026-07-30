/** Cor por TIPO de evento (Reunião/Precificação/Contato/Relatório/...), consistente
 * em todo o app. Os VALORES vivem no tema (:root em src/index.css, tokens
 * --tipo-*) — aqui só mapeamos tipo→token, para haver uma fonte única de cor.
 * Tipos conhecidos têm token fixo; desconhecidos caem num hash determinístico
 * sobre a paleta de reserva (nunca quebra com categoria nova). As funções
 * retornam strings `var(--tipo-*)`, usadas em `style={{...}}` e na custom
 * property --chip-color (o navegador resolve var() em estilo inline). */
const CORES_CONHECIDAS: Record<string, string> = {
  'Reunião': 'var(--tipo-reuniao)',
  'Precificação': 'var(--tipo-precificacao)',
  'Contato': 'var(--tipo-contato)',
  'Relatório': 'var(--tipo-relatorio)',
  'Ligação': 'var(--tipo-ligacao)',
};

const PALETA_RESERVA = ['var(--tipo-reserva-1)', 'var(--tipo-reserva-2)', 'var(--tipo-reserva-3)', 'var(--tipo-reserva-4)'];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function corTipo(tipo: string): string {
  if (CORES_CONHECIDAS[tipo]) return CORES_CONHECIDAS[tipo];
  if (!tipo) return PALETA_RESERVA[0];
  return PALETA_RESERVA[hash(tipo) % PALETA_RESERVA.length];
}

/** Fundo translúcido (16%) para usar atrás de badges/chips com a cor do tipo.
 * color-mix com transparent equivale a rgba(cor, 0.16) — mas referenciando o
 * token do tema em vez de recomputar a partir de um hex fixo. */
export function corTipoBg(tipo: string): string {
  return `color-mix(in srgb, ${corTipo(tipo)} 16%, transparent)`;
}
