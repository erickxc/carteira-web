import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type PeriodoKey = 'mes_anterior' | 'mes_atual' | 'd90' | 'm6' | 'm12' | 'tudo';

export interface Janela {
  /** Início do intervalo (null = sem limite inferior). */
  inicio: Date | null;
  /** Fim do intervalo (null = até agora). Mês fechado tem fim; janela móvel não. */
  fim: Date | null;
  /** Texto para o subtítulo — o período exato que está na tela. */
  descricao: string;
}

export const PERIODOS: { key: PeriodoKey; label: string }[] = [
  { key: 'mes_anterior', label: 'Mês anterior' },
  { key: 'mes_atual', label: 'Mês atual' },
  { key: 'd90', label: '90 dias' },
  { key: 'm6', label: '6 meses' },
  { key: 'm12', label: '12 meses' },
  { key: 'tudo', label: 'Tudo' },
];

/**
 * Traduz o filtro de período em um intervalo concreto.
 *
 * "Mês anterior"/"Mês atual" são períodos FECHADOS de calendário (têm início e
 * fim), diferente das janelas móveis de N dias — é o corte que serve para
 * fechamento mensal, em que comparar "últimos 30 dias" não fecha com nada.
 */
export function janelaDe(key: PeriodoKey, agora: Date): Janela {
  const mes = (d: Date) => format(d, "MMMM 'de' yyyy", { locale: ptBR });
  const dia = (d: Date) => format(d, 'dd/MM/yyyy');
  switch (key) {
    case 'mes_anterior': {
      const ref = subMonths(agora, 1);
      const inicio = startOfMonth(ref);
      const fim = endOfMonth(ref);
      return { inicio, fim, descricao: `${mes(ref)} · ${dia(inicio)} a ${dia(fim)}` };
    }
    case 'mes_atual': {
      const inicio = startOfMonth(agora);
      return { inicio, fim: agora, descricao: `${mes(agora)} · ${dia(inicio)} até hoje` };
    }
    case 'd90':
    case 'm6':
    case 'm12': {
      const dias = key === 'd90' ? 90 : key === 'm6' ? 180 : 365;
      const inicio = new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000);
      return { inicio, fim: agora, descricao: `últimos ${dias} dias · ${dia(inicio)} até hoje` };
    }
    default:
      return { inicio: null, fim: null, descricao: 'todo o histórico registrado' };
  }
}

/** True se a data ISO cai dentro da janela (fim inclusive). */
export function dentroDaJanela(iso: string | undefined, janela: Janela): boolean {
  if (!janela.inicio && !janela.fim) return true; // "Tudo"
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  if (janela.inicio && d < janela.inicio) return false;
  if (janela.fim && d > janela.fim) return false;
  return true;
}
