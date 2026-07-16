import { addDays, format, subDays } from 'date-fns';
import type { Holiday } from '../types';

function easterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function fixed(year: number, month: number, day: number, name: string, scope: Holiday['scope']): Holiday {
  return { date: new Date(year, month - 1, day), name, scope };
}

export function getHolidaysForYear(year: number): Holiday[] {
  const easter = easterDate(year);

  return [
    fixed(year, 1, 1, 'Confraternização Universal', 'nacional'),
    fixed(year, 4, 21, 'Tiradentes', 'nacional'),
    fixed(year, 5, 1, 'Dia do Trabalho', 'nacional'),
    fixed(year, 9, 7, 'Independência do Brasil', 'nacional'),
    fixed(year, 10, 12, 'Nossa Senhora Aparecida', 'nacional'),
    fixed(year, 11, 2, 'Finados', 'nacional'),
    fixed(year, 11, 15, 'Proclamação da República', 'nacional'),
    fixed(year, 11, 20, 'Consciência Negra', 'nacional'),
    fixed(year, 12, 25, 'Natal', 'nacional'),
    { date: subDays(easter, 47), name: 'Carnaval', scope: 'nacional' },
    { date: subDays(easter, 46), name: 'Quarta-feira de Cinzas', scope: 'nacional' },
    { date: subDays(easter, 2), name: 'Sexta-feira Santa', scope: 'nacional' },
    { date: addDays(easter, 60), name: 'Corpus Christi', scope: 'nacional' },

    fixed(year, 4, 23, 'São Jorge', 'estadual-rj'),
    fixed(year, 7, 9, 'Revolução Constitucionalista de 1932', 'estadual-rj'),
    fixed(year, 11, 20, 'Zumbi dos Palmares', 'estadual-rj'),

    fixed(year, 7, 25, 'Aniversário de Duque de Caxias', 'municipal-dc'),
    fixed(year, 8, 25, 'Dia de São Bento (padroeiro)', 'municipal-dc'),
  ];
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function getHoliday(date: Date): Holiday | null {
  const holidays = getHolidaysForYear(date.getFullYear());
  return holidays.find((h) => sameDay(h.date, date)) ?? null;
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function isBusinessDay(date: Date): boolean {
  return !isWeekend(date) && !getHoliday(date);
}

/** Dia útil anterior mais próximo (ou a própria data, se já for útil) — antecipa notificações de lembretes. */
export function previousBusinessDay(date: Date): Date {
  let cursor = date;
  while (!isBusinessDay(cursor)) {
    cursor = subDays(cursor, 1);
  }
  return cursor;
}

export function formatHolidayLabel(holiday: Holiday): string {
  const scopeLabel: Record<Holiday['scope'], string> = {
    nacional: 'Feriado Nacional',
    'estadual-rj': 'Feriado Estadual (RJ)',
    'municipal-dc': 'Feriado Municipal (Duque de Caxias)',
  };
  return `${holiday.name} — ${scopeLabel[holiday.scope]}`;
}

export function dateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}
