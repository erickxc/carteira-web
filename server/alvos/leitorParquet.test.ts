import { describe, expect, it } from 'vitest';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { arquivosDaEmpresa, lerEAgregar } = require('./leitor.cjs');

// Desde 22/10/2026 o Ecossistema grava os Dados Alvos só em parquet (as 45 empresas):
// o leitor que procurava só .csv deixava as telas e ferramentas de vendas sem dado.
// Fixture: 5 linhas (2 vendas e 1 devolução de cliente de bateria, 1 venda sem catálogo,
// 1 devolução AO FORNECEDOR de 50 baterias, que não pode virar venda negativa).
const RAIZ = path.join(__dirname, 'fixtures', 'parquet');

describe('Dados Alvos em parquet', () => {
  it('acha os arquivos .parquet da empresa', () => {
    const a = arquivosDaEmpresa('Teste', RAIZ);
    expect(path.basename(a.movimento)).toBe('Teste_MOVIMENTO_ATUAL.parquet');
    expect(path.basename(a.produto)).toBe('Teste_PRODUTO.parquet');
  });

  it('agrega igual ao CSV: harmoniza pelo catálogo e soma devolução de cliente', () => {
    const r = lerEAgregar('Teste', RAIZ);
    const bateria = r.produtos.find((p: { produto: string }) => p.produto === 'Bateria');
    expect(bateria).toMatchObject({ loja: 'L1', harmonizado: true, qtd: 2, receita: 600, cmv: 400 });
    expect(r.produtos.find((p: { produto: string }) => p.produto === 'PECA X')).toMatchObject({ harmonizado: false, qtd: 4, receita: 80 });
    expect(r.lojas).toEqual([expect.objectContaining({ loja: 'L1', receita: 680 })]);
    expect(r.clientes.map((c: { cliente: string }) => c.cliente)).toEqual(['OFICINA A', '(sem cliente)']);
    expect(r.periodos).toEqual(['2026-09']);
    expect(r.temCatalogoProduto).toBe(true);
  });

  it('devolução ao fornecedor (DEVOLUCAO com MOV = S) não entra como venda', () => {
    const r = lerEAgregar('Teste', RAIZ);
    expect(r.brutas).toBe(5);
    expect(r.devolucoesFornecedor).toBe(1);
    expect(r.descartadas).toBe(0);
    expect(r.totalLinhas).toBe(4);
  });
});
