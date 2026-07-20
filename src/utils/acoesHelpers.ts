import { differenceInCalendarDays, format } from 'date-fns';
import type { AcaoTipo } from '../types';

/** Item unificado do histórico: reunião (agenda) OU ação registrada. */
export interface Item {
  key: string; refId: string; clientId: string; tipoLabel: string; date: Date;
  statusLabel: string; statusBadge: string; obs: string;
  origem: 'reuniao' | 'acao'; acaoStatus?: string; eventDate?: string;
}

export function rotuloData(d: Date): string {
  const dias = differenceInCalendarDays(new Date(), d);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias > 0 && dias <= 30) return `há ${dias} dias`;
  return format(d, 'dd/MM/yyyy');
}

/** Sugestão de próxima ação a partir da data do último contato. */
export function sugestoes(ult: Date | null): AcaoTipo[] {
  if (!ult) return ['contato'];
  const dias = differenceInCalendarDays(new Date(), ult);
  if (dias > 45) return ['reuniao', 'relatorio'];
  if (dias > 30) return ['reuniao'];
  return ['relatorio'];
}
