/** Cor por TIPO de evento (Reunião/Precificação/Contato/Relatório/...), consistente
 * em todo o app. Tipos conhecidos têm cor fixa — tons derivados da paleta de
 * marca (Soft Fawn/French Blue/Slate Grey/Burnt Caramel), clareados o
 * suficiente para servirem de texto legível sobre fundo quase preto — e
 * desconhecidos caem num hash determinístico sobre uma paleta de reserva
 * (nunca quebra com categoria nova). */
const CORES_CONHECIDAS: Record<string, string> = {
  'Reunião': '#dabb6c',
  'Precificação': '#6f8cc4',
  'Contato': '#8aa3ad',
  'Relatório': '#e0975a',
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
