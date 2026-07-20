/** Cor por TIPO de evento (Reunião/Precificação/Contato/Relatório/...), consistente
 * em todo o app. Tipos conhecidos têm cor fixa; desconhecidos caem num hash
 * determinístico sobre uma paleta de reserva (nunca quebra com categoria nova). */
const CORES_CONHECIDAS: Record<string, string> = {
  'Reunião': '#bd952f',
  'Precificação': '#5a9bd4',
  'Contato': '#4cae7a',
  'Relatório': '#c77dba',
};

const PALETA_RESERVA = ['#d69a3c', '#7b8794', '#e0645c', '#6dc0d1'];

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

/** Fundo translúcido (14%) para usar atrás de badges/chips com a cor do tipo. */
export function corTipoBg(tipo: string): string {
  const hex = corTipo(tipo).replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.16)`;
}
