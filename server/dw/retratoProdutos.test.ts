import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

// Isola ONEDRIVE_ROOT e SQLITE_DIR e recarrega quem cacheia caminho — mesmo
// padrão de `server/routes/alvos.test.ts`. O DW é substituído.
const MODULOS = ['../config.cjs', './retratoProdutos.cjs'];
const limparCaches = () => {
  for (const m of MODULOS) {
    try { delete require.cache[require.resolve(m, { paths: [__dirname] })]; } catch { /* não carregado */ }
  }
};

let oneDriveDir: string;
let sqliteDir: string;

beforeEach(() => {
  oneDriveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-retrato-od-'));
  sqliteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-retrato-sq-'));
  process.env.ONEDRIVE_ROOT = oneDriveDir;
  process.env.SQLITE_DIR = sqliteDir;
  limparCaches();
});

afterEach(() => {
  delete process.env.ONEDRIVE_ROOT;
  delete process.env.SQLITE_DIR;
  limparCaches();
  fs.rmSync(oneDriveDir, { recursive: true, force: true });
  fs.rmSync(sqliteDir, { recursive: true, force: true });
});

const linha = (cnpj: string, marcadas: string[]) => {
  const cols = ['monitoria', 'controladoria', 'apura', 'alcance', 'nexus', 'optimarco', 'precificar'];
  return { cnpj, ...Object.fromEntries(cols.map((c) => [c, marcadas.includes(c) ? 'S' : 'N'])) };
};

const semFiscais = async () => ({ empresas: [], grupos: [], apura: [] });

describe('gerarRetrato', () => {
  it('grava dados/dw-produtos.json com os produtos marcados por CNPJ', async () => {
    const { gerarRetrato, lerRetrato } = require('./retratoProdutos.cjs');
    expect(lerRetrato()).toBeNull();

    const buscar = async () => [
      linha('11111111000111', ['monitoria', 'precificar']),
      linha('22222222000122', []),
      // CNPJ repetido no DW: qualquer linha marcada vale.
      linha('11111111000111', ['nexus']),
      linha('', ['apura']),
    ];
    const retrato = await gerarRetrato({ buscar, buscarFiscais: semFiscais, agora: '2026-10-30T07:30:00.000Z' });

    const esperado = {
      geradoEm: '2026-10-30T07:30:00.000Z',
      porCnpj: {
        '11111111000111': { produtos: ['Plataforma 2D', '2D Nexus', '2D Price'] },
        '22222222000122': { produtos: [] },
      },
    };
    expect(retrato).toEqual(esperado);
    const arquivo = path.join(oneDriveDir, 'dados', 'dw-produtos.json');
    expect(JSON.parse(fs.readFileSync(arquivo, 'utf-8'))).toEqual(esperado);
    expect(lerRetrato()).toEqual(esperado);
    // Sem sobra do tmp da escrita atômica.
    expect(fs.readdirSync(path.dirname(arquivo)).filter((f) => f.startsWith('dw-produtos'))).toEqual(['dw-produtos.json']);
  });

  it('falha do DW não apaga o retrato anterior', async () => {
    const { gerarRetrato, lerRetrato } = require('./retratoProdutos.cjs');
    await gerarRetrato({ buscar: async () => [linha('11111111000111', ['apura'])], buscarFiscais: semFiscais, agora: 'a' });
    await expect(gerarRetrato({ buscar: async () => { throw new Error('DW fora'); }, buscarFiscais: semFiscais })).rejects.toThrow('DW fora');
    expect(lerRetrato()).toEqual({ geradoEm: 'a', porCnpj: { '11111111000111': { produtos: ['Apura'] } } });
  });
});

describe('montarRetrato — bordas do DW', () => {
  it('aceita s minúsculo e espaços, ignora null/vazio/outros valores, CNPJ com máscara vira dígitos', () => {
    const { montarRetrato } = require('./retratoProdutos.cjs');
    const r = montarRetrato([
      { cnpj: '11.111.111/0001-11', monitoria: 's', apura: ' S ', nexus: null, alcance: '', optimarco: 'Sim', precificar: 'N' },
    ], 'g');
    expect(r.porCnpj).toEqual({ '11111111000111': { produtos: ['Plataforma 2D', 'Apura'] } });
  });

  it('ordem dos produtos segue o mapa de colunas, não a ordem das linhas repetidas', () => {
    const { montarRetrato } = require('./retratoProdutos.cjs');
    const r = montarRetrato([
      { cnpj: '1', precificar: 'S' },
      { cnpj: '1', monitoria: 'S' },
    ], 'g');
    expect(r.porCnpj['1'].produtos).toEqual(['Plataforma 2D', '2D Price']);
  });

  it('CNPJ repetido com a segunda linha toda N não apaga a marcação da primeira', () => {
    const { montarRetrato } = require('./retratoProdutos.cjs');
    const r = montarRetrato([linha('1', ['controladoria']), linha('1', [])], 'g');
    expect(r.porCnpj['1'].produtos).toEqual(['Controladoria']);
  });
});

const A = '11111111000111';
const A2 = '11111111000222';
const B = '22222222000122';

describe('montarRetrato — dados fiscais', () => {
  const empresas = [{ cnpj: '11.111.111/0001-11', certificado_validade: '2026-12-01', telefone: '21 3333', email: 'a@x.com' }];
  const grupos = [
    { raiz_cnpj: '11111111', codigo: 'altese', nome: 'Altese', ativo: true },
    { raiz_cnpj: '22222222', codigo: 'velho', nome: 'Velho', ativo: false },
  ];
  const apura = [
    { cnpj: A, ultimo_login_em: '2026-10-01T10:00:00.000Z', ativo: true },
    { cnpj: A, ultimo_login_em: '2026-10-28T10:00:00.000Z', ativo: true },
    { cnpj: A, ultimo_login_em: null, ativo: true },
    // Inativo não conta nem empurra o último acesso.
    { cnpj: A, ultimo_login_em: '2026-10-29T10:00:00.000Z', ativo: false },
    { cnpj: B, ultimo_login_em: null, ativo: true },
  ];

  it('junta empresa por CNPJ só dígitos ao lado dos produtos', () => {
    const { montarRetrato } = require('./retratoProdutos.cjs');
    const r = montarRetrato([linha(A, ['apura'])], 'g', { fiscais: { empresas, grupos: [], apura: [] } });
    expect(r.porCnpj[A]).toEqual({
      produtos: ['Apura'], certificadoValidade: '2026-12-01', telefone: '21 3333', email: 'a@x.com',
    });
  });

  it('grupo fiscal pela raiz de 8 dígitos vale pra toda loja da raiz; raiz inativa é ignorada', () => {
    const { montarRetrato } = require('./retratoProdutos.cjs');
    const r = montarRetrato([linha(A, []), linha(A2, []), linha(B, [])], 'g', { fiscais: { empresas: [], grupos, apura: [] } });
    expect(r.porCnpj[A].grupoFiscal).toEqual({ codigo: 'altese', nome: 'Altese' });
    expect(r.porCnpj[A2].grupoFiscal).toEqual({ codigo: 'altese', nome: 'Altese' });
    expect(r.porCnpj[B].grupoFiscal).toBeUndefined();
  });

  it('Apura = maior último login e contagem dos ativos; usuário que nunca entrou fica com null', () => {
    const { montarRetrato } = require('./retratoProdutos.cjs');
    const r = montarRetrato([], 'g', { fiscais: { empresas: [], grupos: [], apura } });
    expect(r.porCnpj[A].apura).toEqual({ usuarios: 3, ultimoAcesso: '2026-10-28T10:00:00.000Z' });
    expect(r.porCnpj[B].apura).toEqual({ usuarios: 1, ultimoAcesso: null });
  });

  it('Apura aceita Date (é como o pg devolve timestamptz) e grava ISO', () => {
    const { montarRetrato } = require('./retratoProdutos.cjs');
    const apuraDate = [{ cnpj: A, ultimo_login_em: new Date('2026-10-28T10:00:00.000Z'), ativo: true }];
    const r = montarRetrato([], 'g', { fiscais: { empresas: [], grupos: [], apura: apuraDate } });
    expect(r.porCnpj[A].apura.ultimoAcesso).toBe('2026-10-28T10:00:00.000Z');
  });

  it('só com usuário inativo não há bloco Apura', () => {
    const { montarRetrato } = require('./retratoProdutos.cjs');
    const inativo = [{ cnpj: A, ultimo_login_em: '2026-10-29T10:00:00.000Z', ativo: false }];
    const r = montarRetrato([linha(A, [])], 'g', { fiscais: { empresas: [], grupos: [], apura: inativo } });
    expect(r.porCnpj[A].apura).toBeUndefined();
  });

  it('loja fora do parametro_bi fica sem produtos — a ficha não pode acusar "não marcado"', () => {
    const { montarRetrato } = require('./retratoProdutos.cjs');
    const r = montarRetrato([], 'g', { fiscais: { empresas, grupos: [], apura: [] } });
    expect(r.porCnpj[A].produtos).toBeUndefined();
  });

  it('Receita nova null mantém a anterior; nova válida substitui', () => {
    const { montarRetrato } = require('./retratoProdutos.cjs');
    const velha = { situacao: 'ATIVA', desde: '2005-11-03', consultadoEm: 'antes' };
    const nova = { situacao: 'BAIXADA', desde: '2026-01-01', consultadoEm: 'agora' };
    const r = montarRetrato([linha(A, []), linha(B, [])], 'g', {
      receitaAnterior: { [A]: velha, [B]: velha },
      receitaNova: { [A]: null, [B]: nova },
    });
    expect(r.porCnpj[A].receita).toEqual(velha);
    expect(r.porCnpj[B].receita).toEqual(nova);
  });
});

describe('gerarRetrato — parte da Receita', () => {
  const buscar = async () => [linha(A, []), linha(B, [])];

  it('só consulta quando pedido: o ciclo diário mantém a situação já gravada', async () => {
    const { gerarRetrato } = require('./retratoProdutos.cjs');
    const consultar = async () => ({ situacao: 'ATIVA', desde: '2005-11-03' });
    const repo = { get: () => [{ lojasCadastro: [{ cnpj: A }] }] };
    await gerarRetrato({ buscar, buscarFiscais: semFiscais, consultarReceita: consultar, repo, pausaMs: 0, agora: 'domingo' });
    const r = await gerarRetrato({ buscar, buscarFiscais: semFiscais, agora: 'segunda' });
    expect(r.geradoEm).toBe('segunda');
    expect(r.porCnpj[A].receita).toEqual({ situacao: 'ATIVA', desde: '2005-11-03', consultadoEm: 'domingo' });
  });

  it('consulta só os CNPJs das lojas do cadastro, sem repetir nem CNPJ incompleto; falha mantém o anterior', async () => {
    const { gerarRetrato } = require('./retratoProdutos.cjs');
    const OUTRA = '33333333000133';
    const pedidos: string[] = [];
    const consultar = async (cnpj: string) => {
      pedidos.push(cnpj);
      return cnpj === A ? { situacao: 'ATIVA', desde: 'd' } : null;
    };
    const repo = { get: (aba: string) => (aba === 'Clientes' ? [
      { lojasCadastro: [{ cnpj: '11.111.111/0001-11' }, { cnpj: '123' }, {}] },
      { lojasCadastro: [{ cnpj: A }] },
      {},
      { lojasCadastro: [{ cnpj: OUTRA }] },
    ] : []) };
    const r1 = await gerarRetrato({ buscar, buscarFiscais: semFiscais, consultarReceita: consultar, repo, pausaMs: 0, agora: 'd1' });
    expect(pedidos).toEqual([A, OUTRA]);
    expect(r1.porCnpj[A].receita.consultadoEm).toBe('d1');
    // B não é loja do cadastro; OUTRA falhou e nem está no DW.
    expect(r1.porCnpj[B].receita).toBeUndefined();
    expect(r1.porCnpj[OUTRA]).toBeUndefined();

    const r2 = await gerarRetrato({ buscar, buscarFiscais: semFiscais, consultarReceita: async () => null, repo, pausaMs: 0, agora: 'd2' });
    expect(r2.porCnpj[A].receita.consultadoEm).toBe('d1');
  });

  it('retrato anterior corrompido não trava a rotina pra sempre', async () => {
    const { gerarRetrato, ARQUIVO } = require('./retratoProdutos.cjs');
    fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
    fs.writeFileSync(ARQUIVO, '{ meio arquivo');
    const r = await gerarRetrato({ buscar, buscarFiscais: semFiscais, agora: 'x' });
    expect(r.porCnpj[A]).toEqual({ produtos: [] });
  });
});

describe('buscarDadosFiscaisLojas — o que é pedido ao DW', () => {
  const resolver = (m: string) => require.resolve(m, { paths: [__dirname] });
  const VARS = ['DW_PLATAFORMA_HOST', 'DW_PLATAFORMA_PORT', 'DW_PLATAFORMA_DATABASE', 'DW_PLATAFORMA_USER', 'DW_PLATAFORMA_PASSWORD'];
  let envAntes: Record<string, string | undefined>;
  let pgAntes: NodeJS.Module | undefined;

  beforeEach(() => {
    envAntes = Object.fromEntries(VARS.map((k) => [k, process.env[k]]));
    VARS.forEach((k) => { process.env[k] = k.endsWith('PORT') ? '1' : 'falso'; });
    pgAntes = require.cache[resolver('pg')];
    delete require.cache[resolver('./dwPlataforma.cjs')];
    limparCaches();
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(envAntes)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    if (pgAntes) require.cache[resolver('pg')] = pgAntes; else delete require.cache[resolver('pg')];
    delete require.cache[resolver('./dwPlataforma.cjs')];
  });

  it('nenhuma consulta lê senha nem nome do certificado, nem usa SELECT *', async () => {
    // `pg` falso: o DW de verdade nunca é tocado, e o teste vê o SQL que sairia.
    const consultas: string[] = [];
    const caminho = resolver('pg');
    require.cache[caminho] = {
      id: caminho, filename: caminho, loaded: true,
      exports: { Pool: class { query(sql: string) { consultas.push(sql); return Promise.resolve({ rows: [] }); } } },
    } as unknown as NodeJS.Module;

    const { buscarDadosFiscaisLojas } = require('./dwPlataforma.cjs');
    const r = await buscarDadosFiscaisLojas();
    expect(r).toEqual({ empresas: [], grupos: [], apura: [] });
    expect(consultas).toHaveLength(3);
    for (const sql of consultas) {
      expect(sql.toLowerCase()).not.toContain('senha');
      expect(sql.toLowerCase()).not.toContain('certificado_nome');
      expect(sql).not.toContain('*');
    }
  });
});

describe('consultarSituacao (BrasilAPI)', () => {
  const resp = (status: number, corpo: unknown = {}) => ({ ok: status < 400, status, json: async () => corpo });

  it('manda User-Agent e devolve situação e data', async () => {
    const { consultarSituacao } = require('./receitaCnpj.cjs');
    const chamadas: [string, RequestInit][] = [];
    const r = await consultarSituacao(A, {
      buscar: async (url: string, init: RequestInit) => {
        chamadas.push([url, init]);
        return resp(200, { descricao_situacao_cadastral: 'ATIVA', data_situacao_cadastral: '2005-11-03' });
      },
    });
    expect(r).toEqual({ situacao: 'ATIVA', desde: '2005-11-03' });
    expect(chamadas[0][0]).toBe(`https://brasilapi.com.br/api/cnpj/v1/${A}`);
    expect((chamadas[0][1].headers as Record<string, string>)['User-Agent']).toBe('Mozilla/5.0 Carteira2D');
  });

  it('429 espera 5 s e tenta de novo; passa a responder → devolve', async () => {
    const { consultarSituacao } = require('./receitaCnpj.cjs');
    const esperas: number[] = [];
    let n = 0;
    const r = await consultarSituacao(A, {
      buscar: async () => (++n < 3 ? resp(429) : resp(200, { descricao_situacao_cadastral: 'ATIVA', data_situacao_cadastral: 'd' })),
      esperar: async (ms: number) => { esperas.push(ms); },
    });
    expect(r?.situacao).toBe('ATIVA');
    expect(esperas).toEqual([5000, 5000]);
  });

  it('429 em todas as 5 tentativas, erro HTTP, rede fora ou resposta sem situação → null', async () => {
    const { consultarSituacao } = require('./receitaCnpj.cjs');
    let n = 0;
    const sempre429 = async () => { n++; return resp(429); };
    expect(await consultarSituacao(A, { buscar: sempre429, esperar: async () => {} })).toBeNull();
    expect(n).toBe(5);
    expect(await consultarSituacao(A, { buscar: async () => resp(404) })).toBeNull();
    expect(await consultarSituacao(A, { buscar: async () => { throw new Error('rede'); } })).toBeNull();
    expect(await consultarSituacao(A, { buscar: async () => resp(200, {}) })).toBeNull();
  });
});
