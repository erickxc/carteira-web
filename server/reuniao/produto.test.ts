import { beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { rodarInvestigacao } = require('./produto.cjs');
const { pythonDoMotor } = require('./motor.cjs');

// Fixture pequeno, com números conhecidos (FIM = qua 21/10/2026; S1 = 12–18/10, S2 = 05–11/10).
const temDuckdb = (() => { try { execFileSync(pythonDoMotor(), ['-c', 'import duckdb'], { stdio: 'ignore' }); return true; } catch { return false; } })();

const GERAR = String.raw`
import duckdb, sys, datetime as dt
alvos, dw = sys.argv[1], sys.argv[2]
mov, prod, compras = [], [], []
def venda(loja, data, cliente, cod, qtd, preco, custo, tipo='VENDA', mov_='S'):
    d = dt.date.fromisoformat(data)
    mov.append((loja, tipo, d, d.day, d.month, d.year, f'{loja}{data}{cod}{len(mov)}', mov_, cliente, cod, float(qtd), float(qtd*preco), float(qtd*custo)))
meses = [(2025,11),(2025,12)] + [(2026,m) for m in range(1,10)]
for a, m in meses:
    venda('L1', f'{a}-{m:02d}-25', 'BALCAO', '1', 10, 150, 90)
    venda('L1', f'{a}-{m:02d}-25', 'BALCAO', '2', 2, 80, 50)
    venda('L1', f'{a}-{m:02d}-25', 'BALCAO', '3', 2, 80, 50)
for m in range(1, 7):
    venda('L1', f'2026-{m:02d}-10', 'OFICINA X', '1', 2, 150, 90)
venda('L1', '2026-09-08', 'BALCAO', '1', 10, 150, 90)        # set 1–21: 10 un
for d in ('2026-10-13', '2026-10-14', '2026-10-15'):
    venda('L1', d, 'BALCAO', '1', 2, 150, 90)                  # S1 L1: 6
venda('L1', '2026-10-06', 'BALCAO', '1', 3, 150, 90)           # S2 L1: 3
venda('L2', '2026-10-13', 'BALCAO', '1', 3, 150, 90)           # S1 L2: 3
venda('L2', '2026-10-06', 'BALCAO', '1', 3, 150, 90)           # S2 L2: 3
for c in ('2', '3'):
    venda('L1', '2026-10-13', 'BALCAO', c, 1, 80, 50); venda('L1', '2026-10-06', 'BALCAO', c, 1, 80, 50)
venda('L1', '2026-10-09', '', '1', -50, 90, 90, tipo='DEVOLUCAO', mov_='S')  # devolução ao fornecedor
duckdb.sql("CREATE TABLE m (ID_LOJA VARCHAR, TIPO_MOVIMENTO VARCHAR, DATA_MOVIMENTO DATE, DIA INT, MES INT, ANO INT, DOC VARCHAR, MOV VARCHAR, NOME_CLIENTE VARCHAR, CODIGO_PRODUTO VARCHAR, QUANTIDADE DOUBLE, TOTAL DOUBLE, CMV DOUBLE)")
duckdb.executemany("INSERT INTO m VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", mov)
duckdb.sql(f"COPY m TO '{alvos}/Teste_MOVIMENTO_ATUAL.parquet' (FORMAT parquet)")
p = [('L1','1','Bateria','HELIAR','100,00','90,00','150,00',40.0), ('L2','1','Bateria','HELIAR','100,00','90,00','150,00',1.0),
     ('L1','2','Amortecedor','COFAP','50,00','50,00','80,00',30.0), ('L1','3','Lubrificante','SHELL','50,00','50,00','80,00',30.0)]
duckdb.sql("CREATE TABLE p (ID_LOJA VARCHAR, CODIGO_INTERNO_PRODUTO VARCHAR, DESCRICAO_HARMONIZADA VARCHAR, NOME_FABRICANTE VARCHAR, ULTIMO_CUSTO VARCHAR, CUSTO_MEDIO_UNITARIO VARCHAR, PRECO_UNITARIO_PRODUTO VARCHAR, QUANTIDADE_ESTOQUE DOUBLE)")
duckdb.executemany("INSERT INTO p VALUES (?,?,?,?,?,?,?,?)", p)
duckdb.sql(f"COPY p TO '{alvos}/Teste_PRODUTO.parquet' (FORMAT parquet)")
duckdb.sql("CREATE TABLE c (ID_LOJA VARCHAR, TIPO_MOVIMENTO VARCHAR, MOV VARCHAR, DATA_MOVIMENTO VARCHAR, CODIGO_PRODUTO VARCHAR, QUANTIDADE VARCHAR, TOTAL VARCHAR)")
duckdb.executemany("INSERT INTO c VALUES (?,?,?,?,?,?,?)", [('L1','COMPRA','E','01/08/2026 00:00:00','1','10,00','900,00'), ('L1','COMPRA','E','01/10/2026 00:00:00','1','10,00','1000,00')])
duckdb.sql(f"COPY c TO '{dw}/Teste_MOVIMENTO_ATUAL.parquet' (FORMAT parquet)")
`;

type Linha = Record<string, unknown>;
type Resultado = Record<'vendaMesmoPeriodo' | 'porLoja' | 'transferencias' | 'clientesQueCairam' | 'custoCompras' | 'promocao', Linha[]> & { comprar: Linha };

describe.skipIf(!temDuckdb)('investigar produto (Python + DuckDB)', () => {
  let r: Resultado;
  let semDw: Resultado;
  beforeAll(async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'produto-'));
    const alvos = path.join(base, 'alvos'); const dw = path.join(base, 'dw');
    fs.mkdirSync(alvos); fs.mkdirSync(dw);
    const script = path.join(base, 'gerar.py'); fs.writeFileSync(script, GERAR);
    execFileSync(pythonDoMotor(), [script, alvos, dw]);
    const comum = { alvos, empresa: 'Teste', produto: 'Bateria', fim: '2026-10-21', reajustar: ['Lubrificante'] };
    r = await rodarInvestigacao({ ...comum, dw });
    semDw = await rodarInvestigacao({ ...comum, dw: path.join(base, 'nao-existe') });
  }, 60000);

  it('devolução ao fornecedor não entra como venda', () => {
    const out = r.vendaMesmoPeriodo.find((v: Linha) => v.loja === null);
    expect(out?.atual).toBe(15);
    expect(out?.anterior).toBe(10);
  });

  it('estoque x máximo do giro por loja', () => {
    const l1 = r.porLoja.find((l: Linha) => l.loja === 'L1');
    const l2 = r.porLoja.find((l: Linha) => l.loja === 'L2');
    expect(l1).toMatchObject({ estoque: 40, d15: 10, maximo: 12, excesso: 28, falta: 0, giro: '15 dias' });
    expect(l2).toMatchObject({ estoque: 1, d15: 6, maximo: 7, excesso: 0, falta: 6 });
    expect(l1?.ocorrenciaPct).toBe(100);
  });

  it('sugere transferir da loja com sobra para a que falta', () => {
    expect(r.transferencias).toEqual([{ cod: '1', fab: 'HELIAR', de: 'L1', para: 'L2', un: 6 }]);
    expect(r.comprar).toMatchObject({ skus: 0, un: 0 });
  });

  it('cliente que comprava todo mês e parou aparece', () => {
    expect(r.clientesQueCairam.map((c: Linha) => c.cliente)).toContain('OFICINA X');
  });

  it('custo da última compra x anteriores', () => {
    expect(r.custoCompras).toEqual([expect.objectContaining({ fab: 'HELIAR', varCustoPct: 11.1 })]);
  });

  it('promoção: excesso que vende, sem item a reajustar', () => {
    const nomes = r.promocao.map((p: Linha) => p.produto);
    expect(nomes).toContain('Amortecedor');
    expect(nomes).not.toContain('Lubrificante');
    expect(r.promocao.find((p: Linha) => p.produto === 'Amortecedor')).toMatchObject({ excessoUn: 27, margemPct: 37.5 });
  });

  it('sem pasta do DW: compras vazias, o resto funciona', () => {
    expect(semDw.custoCompras).toEqual([]);
    expect(semDw.porLoja).toHaveLength(2);
  });
});
