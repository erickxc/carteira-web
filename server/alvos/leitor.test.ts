import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// `server/` é CommonJS (sem build step) — ver comentário em dbSqlite.test.ts.
const require = createRequire(import.meta.url);

/**
 * Toda leitura aqui é sobre uma pasta TEMPORÁRIA montada pelo teste, nunca sobre
 * `ALVOS_DIR` real: `leitor.cjs` recebe a raiz por parâmetro exatamente para
 * isso. (Já aconteceu neste projeto um teste escrever no OneDrive de produção
 * por causa de caminho derivado de config — ver DOSSIES_DIR no CLAUDE.md.)
 */
const leitor: typeof import('./leitor.cjs') = require('./leitor.cjs');

let raiz: string;

const MOVIMENTO_HEADER = [
  'ID_LOJA', 'TIPO_MOVIMENTO', 'CODIGO_PRODUTO', 'CODIGO_REFERENCIA_PRODUTO',
  'DESCRICAO_PRODUTO', 'NOME_FABRICANTE', 'NOME_CLIENTE', 'NOME_VENDEDOR',
  'DATA_MOVIMENTO', 'DIA', 'MES', 'ANO', 'TOTAL', 'QUANTIDADE', 'CMV',
];
const PRODUTO_HEADER = [
  'ID_LOJA', 'CODIGO_INTERNO_PRODUTO', 'CODIGO_REFERENCIA_PRODUTO',
  'DESCRICAO_PRODUTO', 'DESCRICAO_HARMONIZADA', 'QUANTIDADE_ESTOQUE',
];

/** Linha no formato exato do arquivo de origem (nomes de coluna incluídos). */
function linhaMovimento(over: Record<string, unknown> = {}) {
  return {
    ID_LOJA: 'loja_a',
    TIPO_MOVIMENTO: 'VENDA',
    CODIGO_PRODUTO: '49953',
    CODIGO_REFERENCIA_PRODUTO: '15W40',
    DESCRICAO_PRODUTO: 'Lubrificante',
    NOME_FABRICANTE: 'HEXXLUB',
    NOME_CLIENTE: 'OFICINA X (CM)',
    NOME_VENDEDOR: 'João',
    DATA_MOVIMENTO: '2026-07-15',
    DIA: 15,
    MES: 7,
    ANO: 2026,
    TOTAL: '100,00',
    QUANTIDADE: 4,
    CMV: '60,00',
    ...over,
  };
}

function linhaProduto(over: Record<string, unknown> = {}) {
  return {
    ID_LOJA: 'loja_a',
    CODIGO_INTERNO_PRODUTO: '49953',
    CODIGO_REFERENCIA_PRODUTO: '15W40',
    DESCRICAO_PRODUTO: 'Lubrificante bruto',
    DESCRICAO_HARMONIZADA: 'Lubrificante',
    QUANTIDADE_ESTOQUE: 10,
    ...over,
  };
}

function paraCsv(header: string[], linhas: Record<string, unknown>[]) {
  const escapar = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const corpo = linhas.map((l) => header.map((c) => escapar(l[c])).join(';'));
  return [header.join(';'), ...corpo].join('\n');
}

function criarEmpresa(nome: string, opts: {
  movimento?: Record<string, unknown>[];
  produto?: Record<string, unknown>[];
  semArquivos?: boolean;
} = {}) {
  const dir = path.join(raiz, nome);
  fs.mkdirSync(dir, { recursive: true });
  if (opts.semArquivos) return dir;
  fs.writeFileSync(path.join(dir, `${nome}_MOVIMENTO_ATUAL.csv`), paraCsv(MOVIMENTO_HEADER, opts.movimento ?? [linhaMovimento()]));
  if (opts.produto) {
    fs.writeFileSync(path.join(dir, `${nome}_PRODUTO.csv`), paraCsv(PRODUTO_HEADER, opts.produto));
  }
  return dir;
}

beforeAll(() => {
  raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-alvos-test-'));
});

afterAll(() => {
  fs.rmSync(raiz, { recursive: true, force: true });
});

describe('leitor: localização de arquivos', () => {
  it('acha os 3 arquivos por padrão de nome, independente de caixa', () => {
    criarEmpresa('IBAD', { movimento: [linhaMovimento()], produto: [linhaProduto()] });
    const arquivos = leitor.arquivosDaEmpresa('IBAD', raiz);
    expect(arquivos.movimento).toMatch(/MOVIMENTO_ATUAL\.csv$/);
    expect(arquivos.produto).toMatch(/PRODUTO\.csv$/);
  });

  it('lista só pastas que têm o arquivo de movimento', () => {
    criarEmpresa('ComMovimento');
    criarEmpresa('SemArquivo', { semArquivos: true });
    const empresas = leitor.empresasDisponiveis(raiz);
    expect(empresas).toContain('ComMovimento');
    expect(empresas).not.toContain('SemArquivo');
  });

  it('empresasDisponiveis devolve vazio (não lança) quando a pasta não existe', () => {
    expect(leitor.empresasDisponiveis(path.join(raiz, 'inexistente'))).toEqual([]);
  });

  it('não deixa o nome da empresa escapar da raiz', () => {
    const arquivos = leitor.arquivosDaEmpresa('../../fora', raiz);
    expect(arquivos.movimento).toBeNull();
  });
});

describe('leitor: normalização de linha', () => {
  it('mês e ano já vêm numéricos, sem parsing de nome em português', () => {
    expect(leitor.normalizarLinha(linhaMovimento({ MES: 3 }), null)?.mes).toBe(3);
  });

  it('mês ausente/ilegível vira 0 sem descartar a venda', () => {
    const n = leitor.normalizarLinha(linhaMovimento({ MES: null }), null);
    expect(n?.mes).toBe(0);
    expect(n?.receita).toBe(100);
  });

  it('parseia decimal com vírgula, sem separador de milhar', () => {
    expect(leitor.normalizarLinha(linhaMovimento({ TOTAL: '1234,56' }), null)?.receita).toBe(1234.56);
    expect(leitor.normalizarLinha(linhaMovimento({ TOTAL: '-23,90' }), null)?.receita).toBe(-23.9);
  });

  it('cliente vazio recebe rótulo explícito', () => {
    expect(leitor.normalizarLinha(linhaMovimento({ NOME_CLIENTE: '   ' }), null)?.cliente).toBe('(sem cliente)');
  });

  it('descarta só linha sem loja ou sem ano', () => {
    expect(leitor.normalizarLinha(linhaMovimento({ ID_LOJA: '' }), null)).toBeNull();
    expect(leitor.normalizarLinha(linhaMovimento({ ANO: null }), null)).toBeNull();
    expect(leitor.normalizarLinha(linhaMovimento({ QUANTIDADE: null }), null)).not.toBeNull();
  });

  it('expõe vendedor e cmv', () => {
    const n = leitor.normalizarLinha(linhaMovimento({ NOME_VENDEDOR: 'Maria', CMV: '10,00' }), null);
    expect(n?.vendedor).toBe('Maria');
    expect(n?.cmv).toBe(10);
  });
});

describe('leitor: harmonização via catálogo de produto', () => {
  it('usa a descrição harmonizada quando (loja, código) está no catálogo', () => {
    const catalogo = leitor.lerCatalogoProduto(
      criarCatalogoTemp([linhaProduto({ DESCRICAO_HARMONIZADA: 'Lubrificante 15W40' })]),
    );
    const r = leitor.resolverProduto('loja_a', '49953', 'texto cru', catalogo);
    expect(r).toEqual({ produto: 'Lubrificante 15W40', harmonizado: true, estoque: 10 });
  });

  it('mesmo código em lojas diferentes não se confunde (chave é loja+código)', () => {
    const catalogo = leitor.lerCatalogoProduto(criarCatalogoTemp([
      linhaProduto({ ID_LOJA: 'loja_a', QUANTIDADE_ESTOQUE: 10 }),
      linhaProduto({ ID_LOJA: 'loja_b', QUANTIDADE_ESTOQUE: 999 }),
    ]));
    expect(leitor.resolverProduto('loja_a', '49953', '', catalogo).estoque).toBe(10);
    expect(leitor.resolverProduto('loja_b', '49953', '', catalogo).estoque).toBe(999);
  });

  it('cai no texto bruto (não harmonizado) quando código não está no catálogo', () => {
    const catalogo = leitor.lerCatalogoProduto(criarCatalogoTemp([linhaProduto()]));
    const r = leitor.resolverProduto('loja_a', 'inexistente', 'Vela Ignição', catalogo);
    expect(r).toEqual({ produto: 'Vela Ignição', harmonizado: false, estoque: 0 });
  });

  it('sem descrição bruta nem catálogo, usa rótulo explícito e ainda conta como produto real', () => {
    const r = leitor.resolverProduto('loja_a', 'x', '', null);
    expect(r.produto).toBe('AUSENTE DO MAPA');
    expect(r.harmonizado).toBe(false);
  });

  function criarCatalogoTemp(linhas: Record<string, unknown>[]) {
    const arq = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-catalogo-')), 'p.csv');
    fs.writeFileSync(arq, paraCsv(PRODUTO_HEADER, linhas));
    return arq;
  }
});

describe('leitor: agregação', () => {
  /**
   * O ponto central do módulo: no arquivo real, a mesma
   * (loja, cliente, produto, ano, mês) aparece dezenas ou centenas de vezes,
   * porque cada linha é uma VENDA. Somar é a única leitura correta — contar
   * linhas responderia "quantas vendas", não "quanto vendeu".
   */
  it('soma as vendas repetidas da mesma chave em vez de contar linhas', () => {
    const linhas = [
      linhaMovimento({ TOTAL: '99,60', QUANTIDADE: 4 }),
      linhaMovimento({ TOTAL: '74,70', QUANTIDADE: 3 }),
      linhaMovimento({ TOTAL: '49,80', QUANTIDADE: 2 }),
    ].map((l) => leitor.normalizarLinha(l, null));
    const ag = leitor.agregar(linhas);

    expect(ag.cruzamento).toHaveLength(1);
    expect(ag.cruzamento[0].receita).toBe(224.1);
    expect(ag.cruzamento[0].qtd).toBe(9);
    expect(ag.cruzamento[0].vendas).toBe(3);
    expect(ag.totalLinhas).toBe(3);
  });

  it('devolução com valores negativos neutraliza a venda, sem tratamento especial', () => {
    const linhas = [
      linhaMovimento({ TIPO_MOVIMENTO: 'VENDA', TOTAL: '100,00', QUANTIDADE: 4 }),
      linhaMovimento({ TIPO_MOVIMENTO: 'DEVOLUCAO', TOTAL: '-100,00', QUANTIDADE: -4 }),
    ].map((l) => leitor.normalizarLinha(l, null));
    const ag = leitor.agregar(linhas);
    expect(ag.cruzamento[0].receita).toBe(0);
    expect(ag.cruzamento[0].qtd).toBe(0);
  });

  it('separa por loja, cliente, produto, vendedor e mês', () => {
    const linhas = [
      linhaMovimento(),
      linhaMovimento({ ID_LOJA: 'loja_b' }),
      linhaMovimento({ NOME_CLIENTE: 'OFICINA Y (CM)' }),
      linhaMovimento({ DESCRICAO_PRODUTO: 'Vela Ignição', CODIGO_PRODUTO: 'x2' }),
      linhaMovimento({ NOME_VENDEDOR: 'Maria' }),
      linhaMovimento({ MES: 8 }),
    ].map((l) => leitor.normalizarLinha(l, null));
    const ag = leitor.agregar(linhas);

    expect(ag.lojas.map((l) => l.loja).sort()).toEqual(['loja_a', 'loja_b']);
    expect(ag.periodos).toEqual(['2026-07', '2026-08']);
    expect(ag.clientes.filter((c) => c.loja === 'loja_a').length).toBe(2);
    expect(ag.produtos.filter((p) => p.loja === 'loja_a').length).toBe(2);
    expect(new Set(ag.vendedores.map((v) => v.vendedor)).size).toBe(2);
    // "vendedor" não entra na chave do cruzamento (loja+cliente+produto+ano+mês)
    // de propósito, então a linha só-com-vendedor-diferente cai na mesma
    // chave da linha default: 6 linhas, 5 chaves distintas.
    expect(ag.cruzamento).toHaveLength(5);
  });

  it('ordena clientes e produtos por receita, do maior para o menor', () => {
    const ag = leitor.agregar([
      linhaMovimento({ NOME_CLIENTE: 'PEQUENO', TOTAL: '10,00' }),
      linhaMovimento({ NOME_CLIENTE: 'GRANDE', TOTAL: '1000,00' }),
    ].map((l) => leitor.normalizarLinha(l, null)));
    expect(ag.clientes.map((c) => c.cliente)).toEqual(['GRANDE', 'PEQUENO']);
  });

  it('lerEAgregar lê movimento + catálogo e informa quantas linhas foram descartadas', () => {
    criarEmpresa('ComRuim', {
      movimento: [linhaMovimento(), linhaMovimento({ ID_LOJA: '' })],
      produto: [linhaProduto()],
    });
    const ag = leitor.lerEAgregar('ComRuim', raiz);
    expect(ag.brutas).toBe(2);
    expect(ag.descartadas).toBe(1);
    expect(ag.totalLinhas).toBe(1);
    expect(ag.temCatalogoProduto).toBe(true);
  });

  it('funciona sem o arquivo de produto (harmonização cai pro texto bruto)', () => {
    criarEmpresa('SemCatalogo', { movimento: [linhaMovimento()] });
    const ag = leitor.lerEAgregar('SemCatalogo', raiz);
    expect(ag.temCatalogoProduto).toBe(false);
    expect(ag.totalLinhas).toBe(1);
  });

  it('lança erro explícito quando a empresa não tem arquivo de movimento', () => {
    criarEmpresa('SemNada', { semArquivos: true });
    expect(() => leitor.lerEAgregar('SemNada', raiz)).toThrow(/Arquivo de movimento não encontrado/);
  });
});
