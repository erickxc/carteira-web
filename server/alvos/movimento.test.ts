import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const mov: typeof import('./movimento.cjs') = require('./movimento.cjs');

/** Linha no formato do `cruzamento` do agregado. */
const linha = (over: Record<string, unknown> = {}) => ({
  loja: 'loja_a',
  cliente: 'OFICINA X (CM)',
  produto: 'Kit Amortecedor',
  ano: 2026,
  mes: 6,
  receita: 1000,
  qtd: 10,
  ...over,
});

/** Série sintética: 3 meses de base + N meses depois. */
function serie(valores: Array<[string, number, number]>) {
  return valores.map(([periodo, receita, qtd]) => ({ periodo, receita, qtd }));
}

describe('movimento: série mensal', () => {
  it('soma as linhas do mesmo mês e ordena por período', () => {
    const s = mov.serieMensal([
      linha({ mes: 7, receita: 100, qtd: 1 }),
      linha({ mes: 7, receita: 200, qtd: 2 }),
      linha({ mes: 6, receita: 50, qtd: 5 }),
    ]);
    expect(s).toEqual([
      { periodo: '2026-06', receita: 50, qtd: 5 },
      { periodo: '2026-07', receita: 300, qtd: 3 },
    ]);
  });

  it('filtra por loja, produto e cliente', () => {
    const dados = [
      linha(),
      linha({ loja: 'loja_b', receita: 999 }),
      linha({ produto: 'Pneu', receita: 888 }),
      linha({ cliente: 'OUTRA (CM)', receita: 777 }),
    ];
    expect(mov.serieMensal(dados, { lojas: ['loja_a'], produto: 'Kit Amortecedor' })
      .reduce((s, p) => s + p.receita, 0)).toBe(1000 + 777);
    expect(mov.serieMensal(dados, { lojas: ['loja_a'], cliente: 'OFICINA X (CM)' })
      .reduce((s, p) => s + p.receita, 0)).toBe(1000 + 888);
  });

  it('descarta linha com mês ausente (não cabe em série temporal)', () => {
    expect(mov.serieMensal([linha({ mes: 0 })])).toEqual([]);
  });
});

describe('movimento: veredicto', () => {
  // Base mar-mai = 1000/mês. Reunião em 2026-06-12.
  const base: Array<[string, number, number]> = [
    ['2026-03', 1000, 10], ['2026-04', 1000, 10], ['2026-05', 1000, 10],
  ];

  it('subiu acima do limiar = movimentou', () => {
    const r = mov.movimentoDesde(serie([...base, ['2026-07', 1500, 15], ['2026-08', 1400, 14]]), '2026-06-12', { periodoParcial: '2026-09' });
    expect(r.veredicto).toBe('movimentou');
    expect(r.receita.variacao).toBeCloseTo(0.45, 2);
  });

  it('caiu abaixo do limiar = piorou', () => {
    const r = mov.movimentoDesde(serie([...base, ['2026-07', 500, 5], ['2026-08', 600, 6]]), '2026-06-12', { periodoParcial: '2026-09' });
    expect(r.veredicto).toBe('piorou');
  });

  it('variação dentro de ±5% = não movimentou', () => {
    const r = mov.movimentoDesde(serie([...base, ['2026-07', 1020, 10], ['2026-08', 1010, 10]]), '2026-06-12', { periodoParcial: '2026-09' });
    expect(r.veredicto).toBe('nao_movimentou');
  });

  /**
   * A salvaguarda da decisão "manter o mês parcial": com apenas o mês em curso
   * depois da reunião, mês incompleto sempre parece queda. Aqui não pode virar
   * "piorou" — o dossiê afirmaria perda inexistente na frente do cliente.
   */
  it('só mês parcial depois da reunião = indicativo, nunca conclusão', () => {
    const r = mov.movimentoDesde(serie([...base, ['2026-07', 200, 2]]), '2026-06-12', { periodoParcial: '2026-07' });
    expect(r.veredicto).toBe('indicativo_parcial');
    expect(r.mesesDepoisFechados).toBe(0);
    expect(r.incluiMesParcial).toBe(true);
    // Os números continuam disponíveis — o usuário quer ver o mês corrente.
    expect(r.receita.atual).toBe(200);
  });

  it('mês parcial entra na média quando há mês fechado também', () => {
    const r = mov.movimentoDesde(serie([...base, ['2026-07', 1000, 10], ['2026-08', 500, 5]]), '2026-06-12', { periodoParcial: '2026-08' });
    expect(r.mesesDepoisFechados).toBe(1);
    expect(r.incluiMesParcial).toBe(true);
    expect(r.receita.atual).toBe(750);
    expect(r.veredicto).toBe('piorou');
  });

  it('o mês da própria reunião não entra em nenhuma ponta', () => {
    const r = mov.movimentoDesde(
      serie([...base, ['2026-06', 9999, 99], ['2026-07', 1000, 10], ['2026-08', 1000, 10]]),
      '2026-06-12',
      { periodoParcial: '2026-09' },
    );
    expect(r.mesesBase).toEqual(['2026-03', '2026-04', '2026-05']);
    expect(r.mesesDepois).toEqual(['2026-07', '2026-08']);
    expect(r.receita.base).toBe(1000);
  });

  it('usa no máximo 3 meses de base, os mais recentes', () => {
    const longa = serie([
      ['2025-12', 50, 1], ['2026-01', 50, 1], ['2026-02', 50, 1],
      ...base, ['2026-07', 1000, 10], ['2026-08', 1000, 10],
    ]);
    const r = mov.movimentoDesde(longa, '2026-06-12', { periodoParcial: '2026-09' });
    expect(r.mesesBase).toEqual(['2026-03', '2026-04', '2026-05']);
  });

  it('sem mês anterior à reunião = sem_base', () => {
    const r = mov.movimentoDesde(serie([['2026-07', 1000, 10]]), '2026-06-12', { periodoParcial: '2026-09' });
    expect(r.veredicto).toBe('sem_base');
  });

  it('sem mês posterior = sem_dados', () => {
    const r = mov.movimentoDesde(serie(base), '2026-06-12');
    expect(r.veredicto).toBe('sem_dados');
  });

  it('base zero não gera variação infinita', () => {
    const r = mov.movimentoDesde(
      serie([['2026-04', 0, 0], ['2026-05', 0, 0], ['2026-07', 800, 8], ['2026-08', 800, 8]]),
      '2026-06-12',
      { periodoParcial: '2026-09' },
    );
    expect(r.receita.variacao).toBeNull();
    expect(r.veredicto).toBe('movimentou');
  });

  /**
   * O segundo exemplo do usuário: cortaram a margem, receita e quantidade não
   * reagiram juntas. Receita e quantidade ficam separadas justamente para isso.
   */
  it('marca divergência entre receita e quantidade (sinal de preço)', () => {
    const r = mov.movimentoDesde(
      serie([...base, ['2026-07', 1000, 5], ['2026-08', 1050, 5]]),
      '2026-06-12',
      { periodoParcial: '2026-09' },
    );
    expect(r.qtd.variacao).toBeCloseTo(-0.5, 2);
    expect(r.divergeReceitaQtd).toBe(true);
  });

  it('série vazia ou data inválida devolve sem_dados em vez de quebrar', () => {
    expect(mov.movimentoDesde([], '2026-06-12').veredicto).toBe('sem_dados');
    expect(mov.movimentoDesde(serie(base), 'data ruim').veredicto).toBe('sem_dados');
  });

  it('periodoDaData aceita data pura sem deslocar mês por fuso', () => {
    // `new Date('2026-01-01')` é UTC e viraria dez/2025 em fuso negativo.
    expect(mov.periodoDaData('2026-01-01')).toBe('2026-01');
  });
});
