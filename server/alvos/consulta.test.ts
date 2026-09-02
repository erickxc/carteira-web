import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

/**
 * A camada de cache é INJETADA (`opts.cache`): ler xlsx de verdade custa 20 s e
 * 1,5 GB, e o que está sob teste é a decisão de LER OU NÃO — não a leitura.
 *
 * Mock de módulo não serve aqui: `vi.doMock` não intercepta `require` de
 * CommonJS, e a primeira versão deste arquivo lia o arquivo real de produção
 * (25 s por rodada). Foi o que motivou a injeção.
 */
let tmp: string;
let consulta: typeof import('./consulta.cjs');
let leituras: string[];
let cacheValido: boolean;

/** Cache falso: registra o que foi lido e obedece `cacheValido`. */
const fake = () => ({
  agregadoDaEmpresa: (empresa: string) => { leituras.push(empresa); return AGREGADO; },
  estadoDoCache: () => ({ existe: true, valido: cacheValido }),
});

const VINCULOS = { 'Dados Mockados': { alianca_itaborai: 'c-itab', alianca_itaborai_CF: 'c-cabo' } };

const AGREGADO = {
  lojas: [{ loja: 'alianca_itaborai', receita: 10 }, { loja: 'alianca_itaborai_CF', receita: 5 }],
  produtos: [
    { loja: 'alianca_itaborai', produto: 'Lubrificante' },
    { loja: 'alianca_itaborai', produto: 'Kit Amortecedor' },
    { loja: 'alianca_itaborai_CF', produto: 'Pneu' },
  ],
  clientes: [
    { loja: 'alianca_itaborai', cliente: 'EDUARDO MECANICO (CM)' },
    { loja: 'alianca_itaborai_CF', cliente: 'OUTRO (CM)' },
  ],
  cruzamento: [],
  periodos: ['2026-07'],
};

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-consulta-'));
  process.env.ALVOS_VINCULOS_PATH = path.join(tmp, 'v.json');
  process.env.ALVOS_ACOMPANHAMENTO_PATH = path.join(tmp, 'ac.json');
  leituras = [];
  cacheValido = true;

  for (const m of ['./mapa.cjs', './estado.cjs', './acompanhamento.cjs', './consulta.cjs']) {
    delete require.cache[require.resolve(m)];
  }
  consulta = require('./consulta.cjs');
});

afterEach(() => {
  delete process.env.ALVOS_VINCULOS_PATH;
  delete process.env.ALVOS_ACOMPANHAMENTO_PATH;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('consulta: custo de leitura é decisão de quem chama', () => {
  it('com cache quente, responde sem pedir aquecimento', () => {
    const ctx = consulta.contextoDoCliente('c-itab', { vinculos: VINCULOS, cache: fake() });
    expect(leituras).toEqual(['Dados Mockados']);
    expect(ctx.pendentes).toEqual([]);
    expect(ctx.estado.estado).toBe('ok');
  });

  /** O modal de reunião não pode congelar 20 s esperando o xlsx. */
  it('cache frio sem aquecer NÃO lê o arquivo — a empresa vira pendente', () => {
    cacheValido = false;
    const ctx = consulta.contextoDoCliente('c-itab', { vinculos: VINCULOS, cache: fake() });
    expect(leituras).toEqual([]);
    expect(ctx.pendentes).toEqual(['Dados Mockados']);
  });

  it('cache frio com aquecer lê o arquivo', () => {
    cacheValido = false;
    const ctx = consulta.contextoDoCliente('c-itab', { vinculos: VINCULOS, aquecer: true, cache: fake() });
    expect(leituras).toEqual(['Dados Mockados']);
    expect(ctx.pendentes).toEqual([]);
  });

  /**
   * Sem ter lido o arquivo não se pode afirmar que a loja desapareceu — acusar
   * `vinculo_quebrado` aqui pararia a análise de um cliente correto.
   */
  it('empresa pendente não é acusada de vínculo quebrado', () => {
    cacheValido = false;
    const ctx = consulta.contextoDoCliente('c-itab', { vinculos: VINCULOS, cache: fake() });
    expect(ctx.estado.estado).toBe('ok');
    expect(ctx.estado.naoVerificadas).toBe(1);
  });

  it('cliente sem vínculo não gera leitura nenhuma', () => {
    const ctx = consulta.contextoDoCliente('c-sem-vinculo', { vinculos: VINCULOS, cache: fake() });
    expect(leituras).toEqual([]);
    expect(ctx.estado.estado).toBe('sem_vinculo');
  });
});

describe('consulta: catálogo do seletor', () => {
  it('traz só os produtos e clientes das lojas DAQUELE cliente', () => {
    const c = consulta.catalogoDoCliente('c-itab', { vinculos: VINCULOS, cache: fake() });
    expect(c.disponivel).toBe(true);
    expect(c.produtos).toEqual(['Kit Amortecedor', 'Lubrificante']);
    expect(c.clientes).toEqual(['EDUARDO MECANICO (CM)']);
  });

  it('a outra loja do mesmo grupo tem catálogo próprio', () => {
    const c = consulta.catalogoDoCliente('c-cabo', { vinculos: VINCULOS, cache: fake() });
    expect(c.produtos).toEqual(['Pneu']);
    expect(c.clientes).toEqual(['OUTRO (CM)']);
  });

  it('sem vínculo, catálogo indisponível com motivo — nunca lista vazia silenciosa', () => {
    const c = consulta.catalogoDoCliente('c-nada', { vinculos: VINCULOS, cache: fake() });
    expect(c.disponivel).toBe(false);
    expect(c.estado).toBe('sem_vinculo');
    expect(c.motivo).toMatch(/nenhuma loja/);
  });

  it('dados não carregados também é indisponível, com a pasta que falta', () => {
    cacheValido = false;
    const c = consulta.catalogoDoCliente('c-itab', { vinculos: VINCULOS, cache: fake() });
    expect(c.disponivel).toBe(false);
    expect(c.pendentes).toEqual(['Dados Mockados']);
    expect(c.motivo).toMatch(/não carregados/);
  });

  it('ordena alfabeticamente em pt-BR', () => {
    const c = consulta.catalogoDoCliente('c-itab', { vinculos: VINCULOS, cache: fake() });
    expect(c.produtos).toEqual([...c.produtos].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  });

  /**
   * "Não pode perder os clientes" (decisão do usuário): uma leitura boa grava o
   * espelho, e a leitura seguinte com cache FRIO ainda oferece os nomes — o
   * formulário nunca volta a ser texto às cegas. `disponivel` continua false
   * (nenhum cálculo deve usar o espelho, só o autocomplete).
   */
  it('cache frio cai no espelho persistido em vez de lista vazia', () => {
    const caminhoCatalogo = path.join(tmp, 'catalogo.json');

    const bom = consulta.catalogoDoCliente('c-itab', { vinculos: VINCULOS, cache: fake(), caminhoCatalogo });
    expect(bom.clientes).toEqual(['EDUARDO MECANICO (CM)']);

    cacheValido = false;
    const frio = consulta.catalogoDoCliente('c-itab', { vinculos: VINCULOS, cache: fake(), caminhoCatalogo });
    expect(frio.disponivel).toBe(false);
    expect(frio.doEspelho).toBe(true);
    expect(frio.clientes).toEqual(['EDUARDO MECANICO (CM)']);
    expect(frio.produtos).toEqual(['Kit Amortecedor', 'Lubrificante']);
  });
});

describe('consulta: fatos do cliente', () => {
  const cliente = { id: 'c-itab', empresa: 'Aliança - Itaboraí' };

  it('devolve estado e motivo em vez de métrica quando não pode analisar', () => {
    const r = consulta.fatosDoCliente({ id: 'c-nada', empresa: 'X' }, [], { vinculos: VINCULOS, cache: fake() });
    expect(r.estado).toBe('sem_vinculo');
    expect(r.acompanhamentos).toEqual([]);
  });

  it('dados não carregados vira estado próprio, não "sem vínculo"', () => {
    cacheValido = false;
    const r = consulta.fatosDoCliente(cliente, [], { vinculos: VINCULOS, cache: fake() });
    expect(r.estado).toBe('dados_nao_carregados');
  });

  it('com cache quente, roda o cálculo do escopo reunião', () => {
    const r = consulta.fatosDoCliente(cliente, [{ date: '2026-06-12', ata: 'Kit Amortecedor em pauta.' }], { vinculos: VINCULOS, cache: fake() });
    expect(r.estado).toBe('ok');
    expect(r.acompanhamentos.map((a: { nome: string }) => a.nome)).toEqual(['Kit Amortecedor']);
  });
});

describe('consulta: cliente com lojas em duas pastas', () => {
  const DUAS = { 'Pasta A': { loja_a: 'c-um' }, 'Pasta B': { loja_b: 'c-um' } };

  it('concatena o cruzamento em vez de usar só a primeira pasta', () => {
    const ctx = consulta.contextoDoCliente('c-um', { vinculos: DUAS, cache: fake() });
    expect(ctx.empresas).toEqual(['Pasta A', 'Pasta B']);
    const unificado = consulta.agregadoUnificado(ctx.agregados);
    expect(unificado.lojas).toHaveLength(4); // 2 lojas x 2 pastas (mock devolve o mesmo agregado)
  });

  it('uma pasta fria deixa o conjunto pendente — resposta parcial seria pior', () => {
    cacheValido = false;
    const ctx = consulta.contextoDoCliente('c-um', { vinculos: DUAS, cache: fake() });
    expect(ctx.pendentes).toEqual(['Pasta A', 'Pasta B']);
  });
});

describe('consulta: resumo geral do cliente (escopo 5.2)', () => {
  const cliente = { id: 'c-itab', empresa: 'Aliança - Itaboraí' };
  const COM_CRUZAMENTO = {
    ...AGREGADO,
    cruzamento: [
      { loja: 'alianca_itaborai', cliente: 'EDUARDO MECANICO (CM)', produto: 'Lubrificante', ano: 2026, mes: 6, receita: 1000, qtd: 10 },
      { loja: 'alianca_itaborai', cliente: 'OUTRO (CM)', produto: 'Kit Amortecedor', ano: 2026, mes: 7, receita: 2000, qtd: 20 },
      { loja: 'alianca_itaborai_CF', cliente: 'FORA (CM)', produto: 'Pneu', ano: 2026, mes: 7, receita: 9999, qtd: 99 },
    ],
  };

  it('estado != ok não calcula nada, devolve motivo', () => {
    const r = consulta.resumoGeralDoCliente({ id: 'c-nada', empresa: 'X' }, { vinculos: VINCULOS, cache: fake() });
    expect(r.estado).toBe('sem_vinculo');
    expect(r.serie).toEqual([]);
  });

  it('dados não carregados vira estado próprio', () => {
    cacheValido = false;
    const r = consulta.resumoGeralDoCliente(cliente, { vinculos: VINCULOS, cache: fake() });
    expect(r.estado).toBe('dados_nao_carregados');
  });

  it('com cache quente e cruzamento real, agrega só as lojas do cliente', () => {
    const fakeComDados = () => ({
      agregadoDaEmpresa: () => COM_CRUZAMENTO,
      estadoDoCache: () => ({ existe: true, valido: true }),
    });
    const r = consulta.resumoGeralDoCliente(cliente, { vinculos: VINCULOS, cache: fakeComDados() });
    expect(r.estado).toBe('ok');
    expect(r.totalReceita).toBe(3000); // 1000 + 2000, NÃO os 9999 da outra loja
    expect(r.totalClientesDistintos).toBe(2);
    expect(r.serie).toHaveLength(2);
    expect(r.primeiroPeriodo).toBe('2026-06');
    expect(r.ultimoPeriodo).toBe('2026-07');
  });
});

describe('consulta: análise estratégica do cliente (escopo 5.3)', () => {
  const cliente = { id: 'c-itab', empresa: 'Aliança - Itaboraí' };

  it('estado != ok não calcula nada, devolve as 4 listas vazias', () => {
    const r = consulta.analiseEstrategicaDoCliente({ id: 'c-nada', empresa: 'X' }, { vinculos: VINCULOS, cache: fake() });
    expect(r.estado).toBe('sem_vinculo');
    expect(r).toMatchObject({ quedaPersistente: [], erosaoClientes: [], semVenda: [], poderDeCompra: [] });
  });

  it('dados não carregados vira estado próprio', () => {
    cacheValido = false;
    const r = consulta.analiseEstrategicaDoCliente(cliente, { vinculos: VINCULOS, cache: fake() });
    expect(r.estado).toBe('dados_nao_carregados');
  });

  it('com cache quente, roda as 4 análises só nas lojas do cliente', () => {
    const cruzamento = [
      { loja: 'alianca_itaborai', cliente: 'EDUARDO MECANICO (CM)', produto: 'Kit Amortecedor', ano: 2026, mes: 1, receita: 20000, qtd: 20 },
      { loja: 'alianca_itaborai', cliente: 'EDUARDO MECANICO (CM)', produto: 'Kit Amortecedor', ano: 2026, mes: 2, receita: 4000, qtd: 4 },
      // outra loja do mesmo grupo — não pode entrar no resultado deste cliente
      { loja: 'alianca_itaborai_CF', cliente: 'FORA (CM)', produto: 'Pneu', ano: 2026, mes: 1, receita: 99999, qtd: 1 },
    ];
    const fakeComDados = () => ({
      agregadoDaEmpresa: () => ({ ...AGREGADO, cruzamento }),
      estadoDoCache: () => ({ existe: true, valido: true }),
    });
    const r = consulta.analiseEstrategicaDoCliente(cliente, { vinculos: VINCULOS, cache: fakeComDados(), periodoParcial: '2026-03' });
    expect(r.estado).toBe('ok');
    expect(r.erosaoClientes).toHaveLength(1);
    expect(r.erosaoClientes[0].cliente).toBe('EDUARDO MECANICO (CM)');
    expect(r.erosaoClientes[0].receitaPico).toBe(20000);
  });
});
