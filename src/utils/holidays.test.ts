import { describe, expect, it } from 'vitest';
import { dateKey, formatHolidayLabel, getHoliday, getHolidaysForYear, isBusinessDay, isWeekend, previousBusinessDay } from './holidays';

describe('getHolidaysForYear', () => {
  it('calcula a Páscoa/Carnaval móveis corretamente (verificado contra calendário oficial)', () => {
    // Páscoa 2026 é em 5 de abril (fonte: calendário civil brasileiro).
    const holidays = getHolidaysForYear(2026);
    const pascoaMenos2 = holidays.find((h) => h.name === 'Sexta-feira Santa')!;
    expect(pascoaMenos2.date.getMonth()).toBe(3); // abril (0-indexed)
    expect(pascoaMenos2.date.getDate()).toBe(3);
  });

  it('inclui feriados nacionais, estaduais (RJ) e municipais (Duque de Caxias)', () => {
    const holidays = getHolidaysForYear(2026);
    expect(holidays.some((h) => h.scope === 'nacional')).toBe(true);
    expect(holidays.some((h) => h.scope === 'estadual-rj')).toBe(true);
    expect(holidays.some((h) => h.scope === 'municipal-dc')).toBe(true);
  });
});

describe('getHoliday', () => {
  it('encontra um feriado fixo pela data', () => {
    const natal = getHoliday(new Date(2026, 11, 25));
    expect(natal?.name).toBe('Natal');
  });

  it('retorna null para um dia comum', () => {
    expect(getHoliday(new Date(2026, 5, 15))).toBeNull();
  });
});

describe('isWeekend / isBusinessDay', () => {
  it('sábado e domingo são fim de semana', () => {
    expect(isWeekend(new Date(2026, 7, 15))).toBe(true); // sábado
    expect(isWeekend(new Date(2026, 7, 16))).toBe(true); // domingo
    expect(isWeekend(new Date(2026, 7, 17))).toBe(false); // segunda
  });

  it('feriado em dia de semana não é dia útil', () => {
    expect(isBusinessDay(new Date(2026, 11, 25))).toBe(false); // Natal, sexta
  });

  it('dia de semana sem feriado é dia útil', () => {
    expect(isBusinessDay(new Date(2026, 7, 17))).toBe(true);
  });
});

describe('previousBusinessDay', () => {
  it('retorna a própria data quando já é dia útil', () => {
    const seg = new Date(2026, 7, 17);
    expect(previousBusinessDay(seg).getTime()).toBe(seg.getTime());
  });

  it('recua do fim de semana para a sexta anterior', () => {
    const domingo = new Date(2026, 7, 16);
    const resultado = previousBusinessDay(domingo);
    expect(resultado.getDay()).toBe(5); // sexta
    expect(resultado.getDate()).toBe(14);
  });

  it('recua do Natal (sexta, feriado) para a quinta anterior', () => {
    const natal = new Date(2026, 11, 25); // sexta
    const resultado = previousBusinessDay(natal);
    expect(resultado.getDate()).toBe(24);
  });
});

describe('formatHolidayLabel', () => {
  it('formata com o escopo por extenso', () => {
    expect(formatHolidayLabel({ date: new Date(2026, 0, 1), name: 'Confraternização Universal', scope: 'nacional' }))
      .toBe('Confraternização Universal — Feriado Nacional');
  });
});

describe('dateKey', () => {
  it('formata como yyyy-MM-dd', () => {
    expect(dateKey(new Date(2026, 7, 5))).toBe('2026-08-05');
  });
});
