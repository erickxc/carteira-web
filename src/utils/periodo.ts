import { differenceInCalendarMonths, endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type PeriodoKey = 'mes_atual' | 'mes_anterior' | 'trimestre' | 'semestre' | 'ano' | 'tudo';

export interface Janela {
  /** Início do intervalo (null = sem limite inferior). */
  inicio: Date | null;
  /** Fim do intervalo (null = até agora). Mês fechado tem fim; janela móvel não. */
  fim: Date | null;
  /** Período com as datas exatas — para tooltip, onde há espaço. */
  descricao: string;
  /** Versão curta para o subtítulo do card (cabe em meia tela). */
  curta: string;
}

/** Meses de histórico que cada período exige para fazer sentido na tela. */
export const PERIODOS: { key: PeriodoKey; label: string; mesesNecessarios: number }[] = [
  { key: 'mes_atual', label: 'Mês atual', mesesNecessarios: 0 },
  { key: 'mes_anterior', label: 'Mês anterior', mesesNecessarios: 1 },
  { key: 'trimestre', label: 'Trimestre', mesesNecessarios: 3 },
  { key: 'semestre', label: 'Semestre', mesesNecessarios: 6 },
  { key: 'ano', label: 'Ano', mesesNecessarios: 12 },
  { key: 'tudo', label: 'Tudo', mesesNecessarios: 0 },
];

/**
 * Filtra os períodos pelos que o histórico realmente cobre.
 *
 * Oferecer "Ano" com 4 meses de dados é pior que não oferecer: o usuário compara
 * períodos que na prática são o mesmo recorte e conclui que o número não muda.
 * `dataMaisAntiga` deve ser a data do registro mais antigo em uso na tela; a
 * lista cresce sozinha conforme a base envelhece.
 *
 * "Mês atual" e "Tudo" entram sempre — o primeiro é o recorte mínimo, o segundo
 * é justamente a saída para quando o histórico é curto.
 */
export function periodosDisponiveis(dataMaisAntiga: Date | null, agora: Date = new Date()) {
  if (!dataMaisAntiga) return PERIODOS.filter((p) => p.mesesNecessarios === 0);
  const mesesDeHistorico = differenceInCalendarMonths(agora, dataMaisAntiga);
  return PERIODOS.filter((p) => p.mesesNecessarios <= mesesDeHistorico);
}

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
      return { inicio, fim, descricao: `${mes(ref)} · ${dia(inicio)} a ${dia(fim)}`, curta: mes(ref) };
    }
    case 'mes_atual': {
      const inicio = startOfMonth(agora);
      return { inicio, fim: agora, descricao: `${mes(agora)} · ${dia(inicio)} até hoje`, curta: `${mes(agora)} até hoje` };
    }
    // Trimestre/semestre/ano são meses fechados + o mês atual (ex.: trimestre =
    // este mês e os 2 anteriores completos), não janelas de 90/180/365 dias:
    // é assim que fechamento é lido, e casa com o filtro de mês.
    case 'trimestre':
    case 'semestre':
    case 'ano': {
      const meses = key === 'trimestre' ? 3 : key === 'semestre' ? 6 : 12;
      const inicio = startOfMonth(subMonths(agora, meses - 1));
      return {
        inicio, fim: agora,
        descricao: `${mes(inicio)} a ${mes(agora)} · ${dia(inicio)} até hoje`,
        curta: `últimos ${meses} meses`,
      };
    }
    default:
      return { inicio: null, fim: null, descricao: 'todo o histórico registrado', curta: 'todo o histórico' };
  }
}

/**
 * Meses (0–11) que fazem sentido oferecer no filtro de um determinado ano:
 * os que têm registro + o mês corrente quando o ano é o atual.
 *
 * Os filtros de mês da Visão Geral e de Relatórios listavam os 12 meses fixos,
 * mesmo com a base começando em abril — escolher janeiro só mostrava tela vazia.
 * O mês corrente entra sempre (ainda que sem registro) porque "este mês está
 * vazio" é uma informação legítima, diferente de "esse mês não existe".
 */
export function mesesComDados(datasISO: (string | undefined)[], ano: number, agora: Date = new Date()): number[] {
  const meses = new Set<number>();
  for (const iso of datasISO) {
    if (!iso) continue;
    const d = new Date(iso);
    if (isNaN(d.getTime()) || d.getFullYear() !== ano) continue;
    meses.add(d.getMonth());
  }
  if (ano === agora.getFullYear()) meses.add(agora.getMonth());
  return [...meses].sort((a, b) => a - b);
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
