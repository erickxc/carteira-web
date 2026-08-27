import { differenceInCalendarDays, format } from 'date-fns';
import type { AcaoTipo } from '../types';
import type { BadgeVariant } from '../ui';

/** Item unificado do histórico: reunião (agenda) OU ação registrada. */
export interface Item {
  key: string; refId: string; clientId: string; tipoLabel: string; date: Date;
  statusLabel: string; statusBadge: BadgeVariant; obs: string;
  origem: 'reuniao' | 'acao'; acaoStatus?: string; eventDate?: string;
}

export function rotuloData(d: Date): string {
  const dias = differenceInCalendarDays(new Date(), d);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias > 0 && dias <= 30) return `há ${dias} dias`;
  return format(d, 'dd/MM/yyyy');
}

/**
 * Data relativa curta, cobrindo passado E futuro: "hoje", "ontem", "amanhã",
 * "há 12d", "em 5d". Diferente de `rotuloData` (só passado), porque o histórico
 * do card mistura o que já aconteceu com o que está agendado — e ler "17/11/26"
 * não deixa claro de imediato de que lado da data de hoje o item está.
 * Acima de 180 dias volta pra data absoluta, onde "há 400d" não ajuda ninguém.
 */
export function rotuloDataCurto(d: Date, agora: Date = new Date()): string {
  const dias = differenceInCalendarDays(agora, d);
  if (Math.abs(dias) > 180) return format(d, 'dd/MM/yy');
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias === -1) return 'amanhã';
  return dias > 0 ? `há ${dias}d` : `em ${-dias}d`;
}

/**
 * Ordena o histórico de um cliente por PROXIMIDADE da data de hoje — o que
 * acabou de acontecer e o que está logo aí primeiro, empate resolvido a favor
 * do que já aconteceu.
 *
 * Antes a lista era só data decrescente e cortada em 3, então subiam sempre os
 * agendamentos mais DISTANTES no futuro (ex.: três relatórios de novembro,
 * todos "Agendado") em vez do que de fato aconteceu perto de hoje — bug real
 * relatado no card de Acompanhamento.
 */
export function ordenarPorProximidade(itens: Item[], agora: Date = new Date()): Item[] {
  return [...itens].sort((a, b) => {
    const distA = Math.abs(differenceInCalendarDays(a.date, agora));
    const distB = Math.abs(differenceInCalendarDays(b.date, agora));
    if (distA !== distB) return distA - distB;
    const passadoA = a.date.getTime() <= agora.getTime();
    const passadoB = b.date.getTime() <= agora.getTime();
    if (passadoA !== passadoB) return passadoA ? -1 : 1;
    return b.date.getTime() - a.date.getTime();
  });
}

/** Sugestão de próxima ação a partir da data do último contato. */
export function sugestoes(ult: Date | null): AcaoTipo[] {
  if (!ult) return ['contato'];
  const dias = differenceInCalendarDays(new Date(), ult);
  if (dias > 45) return ['reuniao', 'relatorio'];
  if (dias > 30) return ['reuniao'];
  return ['relatorio'];
}
