import { describe, expect, it } from 'vitest';
import { dentroDaJanela, janelaDe, mesesComDados, periodosDisponiveis } from './periodo';

const NOW = new Date(2026, 7, 17); // 17/08/2026

describe('periodosDisponiveis', () => {
  it('sem nenhuma data, só oferece os períodos que não exigem histórico', () => {
    const periodos = periodosDisponiveis(null, NOW);
    expect(periodos.map((p) => p.key)).toEqual(['mes_atual', 'tudo']);
  });

  it('filtra períodos que o histórico ainda não cobre', () => {
    const doisMesesAtras = new Date(2026, 5, 1);
    const periodos = periodosDisponiveis(doisMesesAtras, NOW);
    expect(periodos.map((p) => p.key)).toEqual(['mes_atual', 'mes_anterior', 'tudo']);
  });

  it('com histórico de 1 ano, oferece todos os períodos', () => {
    const umAnoAtras = new Date(2025, 7, 1);
    const periodos = periodosDisponiveis(umAnoAtras, NOW);
    expect(periodos.map((p) => p.key)).toEqual(['mes_atual', 'mes_anterior', 'trimestre', 'semestre', 'ano', 'tudo']);
  });
});

describe('janelaDe', () => {
  it('"mes_anterior" é um período fechado (início e fim de julho)', () => {
    const j = janelaDe('mes_anterior', NOW);
    expect(j.inicio).toEqual(new Date(2026, 6, 1));
    expect(j.fim).toEqual(new Date(2026, 6, 31, 23, 59, 59, 999));
  });

  it('"mes_atual" vai do início do mês até agora (fim aberto)', () => {
    const j = janelaDe('mes_atual', NOW);
    expect(j.inicio).toEqual(new Date(2026, 7, 1));
    expect(j.fim).toEqual(NOW);
  });

  it('"trimestre" cobre este mês e os 2 anteriores completos', () => {
    const j = janelaDe('trimestre', NOW);
    expect(j.inicio).toEqual(new Date(2026, 5, 1)); // junho
    expect(j.fim).toEqual(NOW);
  });

  it('"tudo" não tem limites', () => {
    const j = janelaDe('tudo', NOW);
    expect(j.inicio).toBeNull();
    expect(j.fim).toBeNull();
  });
});

describe('dentroDaJanela', () => {
  it('sem início nem fim (janela "tudo"), tudo está dentro', () => {
    expect(dentroDaJanela(undefined, { inicio: null, fim: null, descricao: '', curta: '' })).toBe(true);
  });

  it('data indefinida fica fora de uma janela com limites', () => {
    expect(dentroDaJanela(undefined, { inicio: new Date(2026, 0, 1), fim: null, descricao: '', curta: '' })).toBe(false);
  });

  it('respeita início e fim inclusive', () => {
    // `fim` como usado de verdade (janelaDe) é sempre um `endOfMonth`/`agora`,
    // não a meia-noite pura do último dia — replica isso aqui.
    const janela = { inicio: new Date(2026, 6, 1), fim: new Date(2026, 6, 31, 23, 59, 59, 999), descricao: '', curta: '' };
    expect(dentroDaJanela('2026-07-01T00:00:00', janela)).toBe(true);
    expect(dentroDaJanela('2026-07-31T23:00:00', janela)).toBe(true);
    expect(dentroDaJanela('2026-08-01T00:00:00', janela)).toBe(false);
  });
});

// `mesesComDados` recebe sempre datas completas (`EventoAgenda.date`, gerado
// por `.toISOString()`), nunca string de data pura tipo "yyyy-MM-dd" — usar
// isso no teste replicaria o próprio bug de fuso que o CLAUDE.md documenta
// (`new Date("2026-07-16")` interpretado em UTC desloca um dia em fuso
// negativo), não o comportamento real da função.
const isoAoMeioDia = (ano: number, mes: number, dia: number) => new Date(ano, mes, dia, 12).toISOString();

describe('mesesComDados', () => {
  it('lista os meses com registro dentro do ano pedido', () => {
    const meses = mesesComDados([isoAoMeioDia(2026, 0, 15), isoAoMeioDia(2026, 2, 10), isoAoMeioDia(2025, 11, 20)], 2026, NOW);
    expect(meses).toContain(0); // janeiro
    expect(meses).toContain(2); // março
    expect(meses).not.toContain(11); // dezembro é de 2025, não conta
  });

  it('sempre inclui o mês corrente quando o ano pedido é o ano atual', () => {
    const meses = mesesComDados([], 2026, NOW);
    expect(meses).toEqual([7]); // agosto
  });

  it('não inclui o mês corrente para um ano que não é o atual', () => {
    const meses = mesesComDados([isoAoMeioDia(2025, 1, 1)], 2025, NOW);
    expect(meses).toEqual([1]);
  });
});
