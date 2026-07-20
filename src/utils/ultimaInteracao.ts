import { parseISO } from 'date-fns';
import type { Acao, EventoAgenda } from '../types';

/**
 * Última interação por cliente = reunião de agenda OU ação concluída mais
 * recente (registrar uma ação conta como contato, não só reunião — regra de
 * negócio central do acompanhamento). Usado por AcoesPage e DashboardPage;
 * antes duplicado em ambos com thresholds/filtros indo aos poucos divergindo.
 */
export function buildUltimaInteracaoMap(
  agenda: EventoAgenda[],
  acoes: Acao[],
  opts?: { now?: Date; isRelevant?: (clientId: string) => boolean }
): Map<string, Date> {
  const now = opts?.now ?? new Date();
  const isRelevant = opts?.isRelevant ?? (() => true);
  const m = new Map<string, Date>();
  const push = (cid: string, d: Date) => {
    if (!isRelevant(cid) || isNaN(d.getTime()) || d > now) return;
    const cur = m.get(cid);
    if (!cur || d > cur) m.set(cid, d);
  };
  agenda.forEach((a) => push(a.clientId, parseISO(a.date)));
  acoes.filter((a) => a.status === 'concluido').forEach((a) => push(a.clientId, parseISO(a.dueAt || a.updatedAt || a.createdAt)));
  return m;
}
