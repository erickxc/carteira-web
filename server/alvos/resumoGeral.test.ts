import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const resumoGeral: typeof import('./resumoGeral.cjs') = require('./resumoGeral.cjs');

const linha = (over: Record<string, unknown> = {}) => ({
  loja: 'loja_a', cliente: 'OFICINA X (CM)', produto: 'Kit Amortecedor',
  ano: 2026, mes: 7, receita: 1000, qtd: 10,
  ...over,
});

describe('resumoGeral: porPeriodo', () => {
  it('soma receita e qtd por período, e conta clientes finais distintos', () => {
    const s = resumoGeral.porPeriodo([
      linha(),
      linha({ cliente: 'OFICINA Y (CM)', receita: 500, qtd: 5 }),
      linha({ mes: 8, receita: 200, qtd: 2 }),
    ]);
    expect(s).toEqual([
      { periodo: '2026-07', receita: 1500, qtd: 15, totalClientes: 2 },
      { periodo: '2026-08', receita: 200, qtd: 2, totalClientes: 1 },
    ]);
  });

  it('mesmo cliente comprando 2x no mês conta 1 vez em totalClientes', () => {
    const s = resumoGeral.porPeriodo([linha({ receita: 100 }), linha({ receita: 200 })]);
    expect(s[0].totalClientes).toBe(1);
    expect(s[0].receita).toBe(300);
  });

  it('mês 0 (ausente na origem) não entra na série', () => {
    const s = resumoGeral.porPeriodo([linha({ mes: 0 }), linha({ mes: 7 })]);
    expect(s).toHaveLength(1);
    expect(s[0].periodo).toBe('2026-07');
  });

  it('filtra por lojas quando informado', () => {
    const dados = [linha({ loja: 'loja_a' }), linha({ loja: 'loja_b', receita: 9999 })];
    expect(resumoGeral.porPeriodo(dados, ['loja_a'])[0].receita).toBe(1000);
    expect(resumoGeral.porPeriodo(dados)[0].receita).toBe(10999);
  });

  it('sem lojas, agrega tudo (cliente unitário, todas as lojas são dele)', () => {
    const dados = [linha({ loja: 'loja_a' }), linha({ loja: 'loja_b' })];
    expect(resumoGeral.porPeriodo(dados).length).toBe(1);
    expect(resumoGeral.porPeriodo(dados)[0].receita).toBe(2000);
  });

  it('ordena por período crescente', () => {
    const s = resumoGeral.porPeriodo([linha({ ano: 2026, mes: 8 }), linha({ ano: 2025, mes: 12 }), linha({ ano: 2026, mes: 1 })]);
    expect(s.map((p) => p.periodo)).toEqual(['2025-12', '2026-01', '2026-08']);
  });
});

describe('resumoGeral: resumoGeral (totais + série)', () => {
  it('agrega totais e marca primeiro/último período', () => {
    const agregado = {
      cruzamento: [
        linha({ ano: 2026, mes: 6, receita: 1000, qtd: 10 }),
        linha({ ano: 2026, mes: 7, receita: 2000, qtd: 20, cliente: 'OFICINA Y (CM)' }),
      ],
    };
    const r = resumoGeral.resumoGeral(agregado);
    expect(r.totalReceita).toBe(3000);
    expect(r.totalQtd).toBe(30);
    expect(r.totalClientesDistintos).toBe(2);
    expect(r.primeiroPeriodo).toBe('2026-06');
    expect(r.ultimoPeriodo).toBe('2026-07');
    expect(r.serie).toHaveLength(2);
  });

  it('sem nenhuma venda com mês válido, devolve zeros e períodos null — não quebra', () => {
    const r = resumoGeral.resumoGeral({ cruzamento: [linha({ mes: 0 })] });
    expect(r.totalReceita).toBe(0);
    expect(r.primeiroPeriodo).toBeNull();
    expect(r.ultimoPeriodo).toBeNull();
  });

  it('cruzamento ausente não quebra (cliente sem dado nenhum)', () => {
    expect(resumoGeral.resumoGeral({})).toMatchObject({ totalReceita: 0, totalClientesDistintos: 0 });
  });

  it('respeita o filtro de lojas do cliente', () => {
    const agregado = {
      cruzamento: [
        linha({ loja: 'loja_a', receita: 1000 }),
        linha({ loja: 'loja_b', receita: 5000 }),
      ],
    };
    expect(resumoGeral.resumoGeral(agregado, ['loja_a']).totalReceita).toBe(1000);
  });
});
