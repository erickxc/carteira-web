import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const ae: typeof import('./analiseEstrategica.cjs') = require('./analiseEstrategica.cjs');

const linha = (over: Record<string, unknown> = {}) => ({
  loja: 'loja_a', cliente: 'OFICINA X (CM)', produto: 'Kit Amortecedor',
  ano: 2026, mes: 1, receita: 1000, qtd: 10,
  ...over,
});

function agregadoDe(cruzamento: ReturnType<typeof linha>[], lojas: string[] = ['loja_a']) {
  return {
    lojas: lojas.map((loja) => ({ loja, receita: 1 })),
    produtos: [...new Set(cruzamento.map((l) => l.produto))].map((produto) => ({ loja: cruzamento[0].loja, produto })),
    clientes: [...new Set(cruzamento.map((l) => l.cliente))].map((cliente) => ({ loja: cruzamento[0].loja, cliente })),
    cruzamento,
    periodos: [...new Set(cruzamento.map((l) => `${l.ano}-${String(l.mes).padStart(2, '0')}`))].sort(),
  };
}

describe('analiseEstrategica: quedaPersistente', () => {
  it('detecta 3+ meses seguidos de queda que persiste até o mês mais recente fechado', () => {
    const meses = [10000, 8000, 6000, 4000]; // jan..abr, cada um menor que o anterior
    const cruz = meses.map((receita, i) => linha({ mes: i + 1, receita, qtd: receita / 100 }));
    const ag = agregadoDe(cruz);
    const r = ae.quedaPersistente(ag, ['loja_a'], { periodoParcial: '2026-05' });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      produto: 'Kit Amortecedor', periodosConsecutivos: 3,
      periodoAnterior: '2026-01', receitaPrecedente: 10000, receitaAtual: 4000, quedaEmReais: 6000,
    });
    expect(r[0].percentualQueda).toBeCloseTo(0.6, 5);
  });

  it('queda que já se recuperou no mês mais recente NÃO entra (precisa persistir)', () => {
    const cruz = [10000, 8000, 6000, 9000].map((receita, i) => linha({ mes: i + 1, receita }));
    expect(ae.quedaPersistente(agregadoDe(cruz), ['loja_a'], { periodoParcial: '2026-05' })).toEqual([]);
  });

  it('menos de 3 períodos consecutivos de queda não entra', () => {
    const cruz = [10000, 8000, 9000].map((receita, i) => linha({ mes: i + 1, receita }));
    expect(ae.quedaPersistente(agregadoDe(cruz), ['loja_a'], { periodoParcial: '2026-04' })).toEqual([]);
  });

  it('queda abaixo do piso de R$5.000 não entra', () => {
    const cruz = [3000, 2000, 1000, 500].map((receita, i) => linha({ mes: i + 1, receita }));
    expect(ae.quedaPersistente(agregadoDe(cruz), ['loja_a'], { periodoParcial: '2026-05' })).toEqual([]);
  });

  it('piso é configurável via opts.minQueda', () => {
    const cruz = [3000, 2000, 1000, 500].map((receita, i) => linha({ mes: i + 1, receita }));
    const r = ae.quedaPersistente(agregadoDe(cruz), ['loja_a'], { periodoParcial: '2026-05', minQueda: 1000 });
    expect(r).toHaveLength(1);
  });

  it('ordena pelo maior impacto financeiro (queda em R$)', () => {
    const cruzA = [10000, 6000, 4000, 2000].map((receita, i) => linha({ mes: i + 1, receita, produto: 'A' }));
    const cruzB = [50000, 40000, 30000, 20000].map((receita, i) => linha({ mes: i + 1, receita, produto: 'B' }));
    const r = ae.quedaPersistente(agregadoDe([...cruzA, ...cruzB]), ['loja_a'], { periodoParcial: '2026-05' });
    expect(r.map((x) => x.produto)).toEqual(['B', 'A']);
  });

  it('sem histórico suficiente (menos que minPeriodos+1 pontos), não quebra', () => {
    const cruz = [10000, 8000].map((receita, i) => linha({ mes: i + 1, receita }));
    expect(ae.quedaPersistente(agregadoDe(cruz), ['loja_a'], { periodoParcial: '2026-03' })).toEqual([]);
  });

  it('só considera produtos das lojas informadas', () => {
    const cruzA = [10000, 6000, 4000, 2000].map((receita, i) => linha({ mes: i + 1, receita, loja: 'loja_a' }));
    const cruzB = [10000, 6000, 4000, 2000].map((receita, i) => linha({ mes: i + 1, receita, loja: 'loja_b', produto: 'Outro' }));
    const ag = agregadoDe([...cruzA, ...cruzB], ['loja_a', 'loja_b']);
    const r = ae.quedaPersistente(ag, ['loja_a'], { periodoParcial: '2026-05' });
    expect(r.map((x) => x.produto)).toEqual(['Kit Amortecedor']);
  });

  it('mês parcial não entra na série nem conta como "atual"', () => {
    const cruz = [10000, 6000, 4000, 2000, 999999].map((receita, i) => linha({ mes: i + 1, receita }));
    const r = ae.quedaPersistente(agregadoDe(cruz), ['loja_a'], { periodoParcial: '2026-05' });
    expect(r[0].receitaAtual).toBe(2000); // não o valor absurdo do mês parcial
  });
});

describe('analiseEstrategica: erosaoClientes', () => {
  it('cliente que caiu 50%+ do próprio pico, com queda mínima em R$, entra', () => {
    const cruz = [
      linha({ mes: 1, receita: 20000 }), // pico
      linha({ mes: 2, receita: 15000 }),
      linha({ mes: 3, receita: 8000 }), // atual: caiu 60% do pico
    ];
    const r = ae.erosaoClientes(agregadoDe(cruz), ['loja_a'], { periodoParcial: '2026-04' });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ cliente: 'OFICINA X (CM)', periodoPico: '2026-01', receitaPico: 20000, receitaAtual: 8000, quedaEmReais: 12000, parouDeComprar: false });
  });

  it('cliente que zerou entra mesmo com queda percentual exatamente 100%', () => {
    const cruz = [linha({ mes: 1, receita: 10000 }), linha({ mes: 2, receita: 0, qtd: 0 })];
    const r = ae.erosaoClientes(agregadoDe(cruz), ['loja_a'], { periodoParcial: '2026-03' });
    expect(r[0].parouDeComprar).toBe(true);
    expect(r[0].percentualQueda).toBe(1);
  });

  it('cliente que voltou ao ritmo (pico é o próprio mês atual) NÃO entra', () => {
    const cruz = [linha({ mes: 1, receita: 5000 }), linha({ mes: 2, receita: 20000 })];
    expect(ae.erosaoClientes(agregadoDe(cruz), ['loja_a'], { periodoParcial: '2026-03' })).toEqual([]);
  });

  it('queda percentual abaixo de 50% (mas ainda com R$ significativo) não entra', () => {
    const cruz = [linha({ mes: 1, receita: 20000 }), linha({ mes: 2, receita: 15000 })]; // caiu só 25%
    expect(ae.erosaoClientes(agregadoDe(cruz), ['loja_a'], { periodoParcial: '2026-03' })).toEqual([]);
  });

  it('queda de 50%+ mas abaixo do piso de R$ não entra', () => {
    const cruz = [linha({ mes: 1, receita: 1000 }), linha({ mes: 2, receita: 400 })]; // caiu 60%, só R$600
    expect(ae.erosaoClientes(agregadoDe(cruz), ['loja_a'], { periodoParcial: '2026-03' })).toEqual([]);
  });

  it('ordena por maior queda em R$', () => {
    const cruzX = [linha({ cliente: 'X', mes: 1, receita: 100000 }), linha({ cliente: 'X', mes: 2, receita: 10000 })];
    const cruzY = [linha({ cliente: 'Y', mes: 1, receita: 20000 }), linha({ cliente: 'Y', mes: 2, receita: 5000 })];
    const r = ae.erosaoClientes(agregadoDe([...cruzX, ...cruzY]), ['loja_a'], { periodoParcial: '2026-03' });
    expect(r.map((x) => x.cliente)).toEqual(['X', 'Y']);
  });
});

describe('analiseEstrategica: semVenda', () => {
  it('cliente com receita atual <=5% do pico entra, mesmo sem piso em R$', () => {
    const cruz = [linha({ mes: 1, receita: 1000 }), linha({ mes: 2, receita: 40 })]; // sobrou 4%
    const r = ae.semVenda(agregadoDe(cruz), ['loja_a'], { periodoParcial: '2026-03' });
    expect(r).toHaveLength(1);
    expect(r[0].percentualQueda).toBeCloseTo(0.96, 5);
    expect(r[0].serieMensal).toEqual([{ periodo: '2026-01', receita: 1000 }, { periodo: '2026-02', receita: 40 }]);
  });

  it('cliente com 10% restante (abaixo do limiar de 95%) não entra', () => {
    const cruz = [linha({ mes: 1, receita: 1000 }), linha({ mes: 2, receita: 100 })];
    expect(ae.semVenda(agregadoDe(cruz), ['loja_a'], { periodoParcial: '2026-03' })).toEqual([]);
  });

  it('cliente que nunca comprou nada (pico zero) não entra — não é "parou"', () => {
    const cruz = [linha({ mes: 1, receita: 0, qtd: 0 })];
    expect(ae.semVenda(agregadoDe(cruz), ['loja_a'], { periodoParcial: '2026-02' })).toEqual([]);
  });

  it('funciona mesmo com baixo volume (sem piso em R$)', () => {
    const cruz = [linha({ mes: 1, receita: 50 }), linha({ mes: 2, receita: 1 })];
    const r = ae.semVenda(agregadoDe(cruz), ['loja_a'], { periodoParcial: '2026-03' });
    expect(r).toHaveLength(1);
  });
});

describe('analiseEstrategica: poderDeCompra', () => {
  it('potencial é a média dos 3 meses-calendário de MAIOR receita, não a média corrida', () => {
    // Um pico isolado de 100k não deve ser diluído pela média corrida de 6 meses.
    const receitas = [1000, 1000, 100000, 1000, 1000, 1000];
    const cruz = receitas.map((receita, i) => linha({ mes: i + 1, receita }));
    const r = ae.poderDeCompra(agregadoDe(cruz), ['loja_a'], { periodoParcial: '2026-07' });
    // top 3 = 100000,1000,1000 -> média 34000
    expect(r[0].poderDeCompra).toBeCloseTo(34000, 2);
  });

  it('receitaMediaRecente é a média dos últimos 3 meses FECHADOS', () => {
    const receitas = [5000, 5000, 5000, 5000, 1000, 1000, 1000];
    const cruz = receitas.map((receita, i) => linha({ mes: i + 1, receita }));
    const r = ae.poderDeCompra(agregadoDe(cruz), ['loja_a'], { periodoParcial: '2026-08' });
    expect(r[0].receitaMediaRecente).toBeCloseTo(1000, 2);
  });

  it('conta quantos dos últimos 3 meses tiveram queda de 60%+ frente ao potencial', () => {
    const receitas = [10000, 10000, 10000, 3000, 3000, 8000]; // potencial=10000; recentes: 3000,3000,8000
    const cruz = receitas.map((receita, i) => linha({ mes: i + 1, receita }));
    const r = ae.poderDeCompra(agregadoDe(cruz), ['loja_a'], { periodoParcial: '2026-07' });
    // 3000 e 3000 estão 70% abaixo (conta), 8000 está 20% abaixo (não conta)
    expect(r[0].mesesMuitoAbaixoDoPotencial).toBe(2);
  });

  it('sem histórico suficiente (menos que 3 meses fechados) não entra', () => {
    const cruz = [linha({ mes: 1, receita: 1000 }), linha({ mes: 2, receita: 1000 })];
    expect(ae.poderDeCompra(agregadoDe(cruz), ['loja_a'], { periodoParcial: '2026-03' })).toEqual([]);
  });

  it('ordena por maior poder de compra', () => {
    const cruzX = [1000, 1000, 1000].map((receita, i) => linha({ cliente: 'X', mes: i + 1, receita }));
    const cruzY = [9000, 9000, 9000].map((receita, i) => linha({ cliente: 'Y', mes: i + 1, receita }));
    const r = ae.poderDeCompra(agregadoDe([...cruzX, ...cruzY]), ['loja_a'], { periodoParcial: '2026-04' });
    expect(r.map((x) => x.cliente)).toEqual(['Y', 'X']);
  });
});
