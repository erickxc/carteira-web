import { describe, expect, it } from 'vitest';
import { datasNoIntervalo, descreverRegra, parseDataLocal } from './regraRecorrencia.cjs';

function d(ano: number, mes: number, dia: number): Date {
  return new Date(ano, mes - 1, dia);
}
function fmt(datas: Date[]): string[] {
  return datas.map((x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`);
}

describe('datasNoIntervalo — semanal', () => {
  it('gera toda ocorrência do dia da semana dentro do intervalo', () => {
    // Agosto/2026: dia 1 é sábado (6). Terça (2) = 4, 11, 18, 25.
    const datas = datasNoIntervalo({ modo: 'semanal', diaSemana: 2 }, d(2026, 8, 1), d(2026, 8, 31));
    expect(fmt(datas)).toEqual(['2026-08-04', '2026-08-11', '2026-08-18', '2026-08-25']);
  });

  it('quando o próprio dia inicial já é o dia da semana, inclui ele', () => {
    const datas = datasNoIntervalo({ modo: 'semanal', diaSemana: 2 }, d(2026, 8, 4), d(2026, 8, 10));
    expect(fmt(datas)).toEqual(['2026-08-04']);
  });
});

describe('datasNoIntervalo — mensalVezes', () => {
  it('1x por mês cai sempre no diaBase', () => {
    const datas = datasNoIntervalo({ modo: 'mensalVezes', vezesPorMes: 1, diaBase: 15 }, d(2026, 1, 1), d(2026, 3, 31));
    expect(fmt(datas)).toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
  });

  it('2x por mês espaça por floor(28/2)=14 dias a partir do diaBase', () => {
    const datas = datasNoIntervalo({ modo: 'mensalVezes', vezesPorMes: 2, diaBase: 5 }, d(2026, 8, 1), d(2026, 8, 31));
    expect(fmt(datas)).toEqual(['2026-08-05', '2026-08-19']);
  });

  it('diaBase maior que os dias do mês cai no último dia (fevereiro)', () => {
    const datas = datasNoIntervalo({ modo: 'mensalVezes', vezesPorMes: 1, diaBase: 31 }, d(2026, 2, 1), d(2026, 2, 28));
    expect(fmt(datas)).toEqual(['2026-02-28']);
  });

  it('encontra ocorrência do mês anterior que caiu dentro da janela por causa do espaçamento', () => {
    // diaBase 25, passo 9 (4x/mês -> floor(28/4)=7... usar vezes=3 -> passo 9):
    // mês anterior: 25, +9=dia 4 do mês seguinte (cai dentro da janela pedida).
    const datas = datasNoIntervalo({ modo: 'mensalVezes', vezesPorMes: 3, diaBase: 25 }, d(2026, 8, 1), d(2026, 8, 10));
    expect(fmt(datas)).toContain('2026-08-03');
  });
});

describe('datasNoIntervalo — diasMes', () => {
  it('gera os dias fixos em cada mês do intervalo', () => {
    const datas = datasNoIntervalo({ modo: 'diasMes', diasDoMes: [10, 20] }, d(2026, 8, 1), d(2026, 9, 30));
    expect(fmt(datas)).toEqual(['2026-08-10', '2026-08-20', '2026-09-10', '2026-09-20']);
  });

  it('dia 31 em fevereiro cai no dia 28 (não bissexto)', () => {
    const datas = datasNoIntervalo({ modo: 'diasMes', diasDoMes: [31] }, d(2026, 2, 1), d(2026, 2, 28));
    expect(fmt(datas)).toEqual(['2026-02-28']);
  });

  it('sem dias configurados não gera nada', () => {
    expect(datasNoIntervalo({ modo: 'diasMes', diasDoMes: [] }, d(2026, 8, 1), d(2026, 8, 31))).toEqual([]);
  });
});

describe('datasNoIntervalo — casos gerais', () => {
  it('regra vazia ou sem modo não gera nada', () => {
    expect(datasNoIntervalo(null, d(2026, 8, 1), d(2026, 8, 31))).toEqual([]);
    expect(datasNoIntervalo({}, d(2026, 8, 1), d(2026, 8, 31))).toEqual([]);
  });

  it('intervalo invertido não gera nada', () => {
    expect(datasNoIntervalo({ modo: 'semanal', diaSemana: 1 }, d(2026, 8, 31), d(2026, 8, 1))).toEqual([]);
  });

  it('nunca repete a mesma data', () => {
    const datas = datasNoIntervalo({ modo: 'mensalVezes', vezesPorMes: 31, diaBase: 1 }, d(2026, 8, 1), d(2026, 8, 31));
    const chaves = new Set(fmt(datas));
    expect(chaves.size).toBe(datas.length);
  });
});

describe('parseDataLocal', () => {
  // Bug real: `new Date("2026-08-19")` é meia-noite UTC, que em fuso negativo
  // (Brasil, UTC-3) volta pra 18/08 ao ler em hora local — a prévia de
  // recorrência chegou a devolver uma data ANTES do início pedido por causa
  // disso. `parseDataLocal` deve sempre preservar o dia informado.
  it('preserva o dia informado (não volta um dia por fuso)', () => {
    const d = parseDataLocal('2026-08-19');
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 8, 19]);
  });

  it('é meia-noite local, não UTC', () => {
    const d = parseDataLocal('2026-08-19');
    expect(d.getHours()).toBe(0);
  });

  it('string inválida devolve Invalid Date, não lança', () => {
    expect(isNaN(parseDataLocal('').getTime())).toBe(true);
    expect(isNaN(parseDataLocal('lixo').getTime())).toBe(true);
  });
});

describe('descreverRegra', () => {
  it('descreve os três modos', () => {
    expect(descreverRegra({ modo: 'semanal', diaSemana: 2 })).toBe('Toda terça');
    expect(descreverRegra({ modo: 'mensalVezes', vezesPorMes: 1 })).toBe('Uma vez por mês');
    expect(descreverRegra({ modo: 'mensalVezes', vezesPorMes: 3 })).toBe('3x por mês');
    expect(descreverRegra({ modo: 'diasMes', diasDoMes: [20, 5] })).toBe('Dias 5, 20 de cada mês');
  });
});
