import type { BadgeVariant } from '../ui';

/** Cor por SALA, mesmo espírito de `corTipo` (tipoCor.ts) — hash determinístico
 *  sobre um conjunto de variantes de Badge, pra sala render como pílula colorida
 *  em vez de texto cinza (que se perdia visualmente entre os cards). Variantes
 *  escolhidas deixam de fora `danger` (sugere erro) e `muted` (é o "sem sala"). */
const VARIANTES: BadgeVariant[] = ['accent', 'warning', 'success', 'gratuidade'];

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function corSalaVariant(sala: string): BadgeVariant {
  if (!sala) return 'muted';
  return VARIANTES[hash(sala) % VARIANTES.length];
}
