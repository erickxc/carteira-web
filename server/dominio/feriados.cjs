const { addDays, isWeekend, subDays } = require('date-fns');

/**
 * Porta de `src/utils/holidays.ts` (só o necessário pra `isBusinessDay`, usado
 * por `sugestaoAgenda.cjs`). Mesma duplicação deliberada explicada em
 * `cadenciaServico.cjs`: frontend é `.ts` (Vite), backend é `.cjs` (Express),
 * sem pacote compartilhado hoje. Se a lista de feriados mudar lá, muda aqui.
 *
 * Feriados nacionais fixos + móveis (Páscoa via algoritmo Gregoriano) +
 * estaduais RJ + municipais Duque de Caxias — a carteira é atendida dessa
 * região.
 */

function easterDate(year) {
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

function getHolidaysForYear(year) {
  const easter = easterDate(year);
  const fixed = (mes, dia, nome) => ({ date: new Date(year, mes - 1, dia), name: nome });
  return [
    fixed(1, 1, 'Confraternização Universal'),
    fixed(4, 21, 'Tiradentes'),
    fixed(5, 1, 'Dia do Trabalho'),
    fixed(9, 7, 'Independência do Brasil'),
    fixed(10, 12, 'Nossa Senhora Aparecida'),
    fixed(11, 2, 'Finados'),
    fixed(11, 15, 'Proclamação da República'),
    fixed(11, 20, 'Consciência Negra'),
    fixed(12, 25, 'Natal'),
    { date: subDays(easter, 47), name: 'Carnaval' },
    { date: subDays(easter, 46), name: 'Quarta-feira de Cinzas' },
    { date: subDays(easter, 2), name: 'Sexta-feira Santa' },
    { date: addDays(easter, 60), name: 'Corpus Christi' },
    fixed(4, 23, 'São Jorge'),
    fixed(7, 9, 'Revolução Constitucionalista de 1932'),
    fixed(11, 20, 'Zumbi dos Palmares'),
    fixed(7, 25, 'Aniversário de Duque de Caxias'),
    fixed(8, 25, 'Dia de São Bento (padroeiro)'),
  ];
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getHoliday(date) {
  return getHolidaysForYear(date.getFullYear()).find((h) => sameDay(h.date, date)) ?? null;
}

function isBusinessDay(date) {
  return !isWeekend(date) && !getHoliday(date);
}

module.exports = { getHolidaysForYear, getHoliday, isBusinessDay };
