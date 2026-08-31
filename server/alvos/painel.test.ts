import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

let tmp: string;
let painel: typeof import('./painel.cjs');
let cacheValido: boolean;

const VINCULOS = { 'Dados Mockados': { alianca_itaborai: 'c-itab' } };

const AGREGADO = {
  lojas: [{ loja: 'alianca_itaborai', receita: 10 }],
  produtos: [{ loja: 'alianca_itaborai', produto: 'Kit Amortecedor' }],
  clientes: [{ loja: 'alianca_itaborai', cliente: 'EDUARDO MECANICO (CM)' }],
  cruzamento: [
    { loja: 'alianca_itaborai', cliente: 'EDUARDO MECANICO (CM)', produto: 'Kit Amortecedor', ano: 2026, mes: 3, receita: 1000, qtd: 10 },
    { loja: 'alianca_itaborai', cliente: 'EDUARDO MECANICO (CM)', produto: 'Kit Amortecedor', ano: 2026, mes: 4, receita: 1000, qtd: 10 },
    { loja: 'alianca_itaborai', cliente: 'EDUARDO MECANICO (CM)', produto: 'Kit Amortecedor', ano: 2026, mes: 5, receita: 1000, qtd: 10 },
    { loja: 'alianca_itaborai', cliente: 'EDUARDO MECANICO (CM)', produto: 'Kit Amortecedor', ano: 2026, mes: 7, receita: 1000, qtd: 10 },
    { loja: 'alianca_itaborai', cliente: 'EDUARDO MECANICO (CM)', produto: 'Kit Amortecedor', ano: 2026, mes: 8, receita: 1000, qtd: 10 },
  ],
  periodos: ['2026-07'],
};

const fake = (leituras: string[] = []) => ({
  agregadoDaEmpresa: (empresa: string) => { leituras.push(empresa); return AGREGADO; },
  estadoDoCache: () => ({ existe: true, valido: cacheValido }),
});

/** Repo em memória (mesmo padrão de tools.test.ts). */
function repoMem(dados: Record<string, unknown[]>) {
  const tabelas: Record<string, unknown[]> = { ...dados };
  return {
    get: (nome: string) => tabelas[nome] || [],
    save: (nome: string, linhas: unknown[]) => { tabelas[nome] = linhas; },
  };
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-alvos-painel-'));
  process.env.ALVOS_VINCULOS_PATH = path.join(tmp, 'v.json');
  process.env.ALVOS_ACOMPANHAMENTO_PATH = path.join(tmp, 'ac.json');
  cacheValido = true;
  for (const m of ['./mapa.cjs', './estado.cjs', './acompanhamento.cjs', './consulta.cjs', './painel.cjs']) {
    delete require.cache[require.resolve(m)];
  }
  painel = require('./painel.cjs');
});

afterEach(() => {
  delete process.env.ALVOS_VINCULOS_PATH;
  delete process.env.ALVOS_ACOMPANHAMENTO_PATH;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('painel: linhasCadastro / resumoCadastro', () => {
  const clientes = [
    { id: 'c-itab', empresa: 'Aliança - Itaboraí', estado: 'Ativo', local: 'Autopeça' },
    { id: 'c-sem-vinculo', empresa: 'Mineirão', estado: 'Ativo', local: '' },
    { id: 'c-inativo', empresa: 'Fantasma', estado: 'Inativo' },
  ];

  it('classifica cada cliente ativo e ignora inativo', () => {
    const linhas = painel.linhasCadastro(clientes, { vinculos: VINCULOS, lojasPorEmpresa: { 'Dados Mockados': ['alianca_itaborai'] } });
    expect(linhas.map((l) => l.clientId)).toEqual(['c-itab', 'c-sem-vinculo']);
    expect(linhas.find((l) => l.clientId === 'c-itab')).toMatchObject({ estadoAlvos: 'ok', semLocal: false });
    expect(linhas.find((l) => l.clientId === 'c-sem-vinculo')).toMatchObject({ estadoAlvos: 'sem_vinculo', semLocal: true });
  });

  it('resumo conta por estado e por campo local vazio', () => {
    const linhas = painel.linhasCadastro(clientes, { vinculos: VINCULOS, lojasPorEmpresa: { 'Dados Mockados': ['alianca_itaborai'] } });
    expect(painel.resumoCadastro(linhas)).toEqual({ total: 2, ok: 1, sem_vinculo: 1, vinculo_quebrado: 0, semLocal: 1 });
  });

  it('carteira vazia devolve resumo zerado, não erro', () => {
    expect(painel.resumoCadastro([])).toEqual({ total: 0, ok: 0, sem_vinculo: 0, vinculo_quebrado: 0, semLocal: 0 });
  });
});

describe('painel: gerarAlertasAlvos', () => {
  const cliente = { id: 'c-itab', empresa: 'Aliança - Itaboraí', estado: 'Ativo', monitor: 'Erick Cardoso' };

  it('cliente sem vínculo não gera alerta de conversa (é pendência de cadastro)', () => {
    const repo = repoMem({ Clientes: [{ id: 'c-sem', empresa: 'X', estado: 'Ativo' }], Agenda: [] });
    expect(painel.gerarAlertasAlvos(repo, { vinculos: {}, cache: fake() })).toEqual([]);
  });

  it('vínculo quebrado gera alerta de alta severidade', () => {
    // A loja vinculada ("alianca_itaborai") não existe mais no arquivo — o
    // cache falso devolve um agregado sem ela, simulando a origem renomeando o
    // ID_LOJA. `lojasPorEmpresa` não é lido por `consulta.cjs` (ele deriva as
    // lojas do próprio agregado), por isso o cache é o jeito certo de simular.
    const semALoja = { ...AGREGADO, lojas: [{ loja: 'outra_loja', receita: 1 }] };
    const cacheSemALoja = { agregadoDaEmpresa: () => semALoja, estadoDoCache: () => ({ existe: true, valido: true }) };
    const repo = repoMem({ Clientes: [cliente], Agenda: [] });
    const alertas = painel.gerarAlertasAlvos(repo, { vinculos: VINCULOS, cache: cacheSemALoja });
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({ tipo: 'alvos_vinculo_quebrado', severidade: 'alta', clientId: 'c-itab' });
    expect(alertas[0].pergunta).toContain('Aliança - Itaboraí');
  });

  it('acompanhamento insistido sem retorno gera alerta', () => {
    const repo = repoMem({
      Clientes: [cliente],
      Agenda: [
        { id: 'e1', clientId: 'c-itab', date: '2026-06-12', ata: 'Combinado no Kit Amortecedor.' },
        { id: 'e2', clientId: 'c-itab', date: '2026-06-20', ata: 'Reforçado o Kit Amortecedor.' },
      ],
    });
    const alertas = painel.gerarAlertasAlvos(repo, { vinculos: VINCULOS, cache: fake() });
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({ tipo: 'alvos_acompanhamento', clientId: 'c-itab', monitor: 'Erick Cardoso' });
    expect(alertas[0].detalhe).toMatch(/Kit Amortecedor.*2 reuniões/);
    expect(alertas[0].pergunta).toContain('produto');
  });

  it('sem acompanhamento em alerta, lista vazia', () => {
    const repo = repoMem({ Clientes: [cliente], Agenda: [] });
    expect(painel.gerarAlertasAlvos(repo, { vinculos: VINCULOS, cache: fake() })).toEqual([]);
  });

  it('cliente inativo não entra em nenhuma checagem', () => {
    const repo = repoMem({
      Clientes: [{ ...cliente, estado: 'Inativo' }],
      Agenda: [
        { id: 'e1', clientId: 'c-itab', date: '2026-06-12', ata: 'Kit Amortecedor.' },
        { id: 'e2', clientId: 'c-itab', date: '2026-06-20', ata: 'Kit Amortecedor de novo.' },
      ],
    });
    expect(painel.gerarAlertasAlvos(repo, { vinculos: VINCULOS, cache: fake() })).toEqual([]);
  });

  it('dados não carregados (cache frio, sem aquecer) não gera alerta nesta rodada', () => {
    cacheValido = false;
    const repo = repoMem({
      Clientes: [cliente],
      Agenda: [
        { id: 'e1', clientId: 'c-itab', date: '2026-06-12', ata: 'Kit Amortecedor.' },
        { id: 'e2', clientId: 'c-itab', date: '2026-06-20', ata: 'Kit Amortecedor de novo.' },
      ],
    });
    expect(painel.gerarAlertasAlvos(repo, { vinculos: VINCULOS, cache: fake() })).toEqual([]);
  });

  it('respeita o teto máximo de alertas', () => {
    const clientes = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, empresa: `Empresa ${i}`, estado: 'Ativo' }));
    const vinculos = Object.fromEntries(clientes.map((c) => [`Pasta ${c.id}`, { loja_x: c.id }]));
    const agenda = clientes.flatMap((c) => [
      { id: `${c.id}-1`, clientId: c.id, date: '2026-06-12', ata: 'Kit Amortecedor.' },
      { id: `${c.id}-2`, clientId: c.id, date: '2026-06-20', ata: 'Kit Amortecedor de novo.' },
    ]);
    const repo = repoMem({ Clientes: clientes, Agenda: agenda });
    const alertas = painel.gerarAlertasAlvos(repo, { vinculos, cache: fake(), max: 3 });
    expect(alertas.length).toBeLessThanOrEqual(3);
  });
});

describe('painel: descreverRazao', () => {
  it('cobre as três razões com texto distinto', () => {
    expect(painel.descreverRazao({ nome: 'X', razao: 'abandonado_voltou_a_mover', reunioes: [] })).toMatch(/abandonado/);
    expect(painel.descreverRazao({ nome: 'X', razao: 'receita_e_qtd_divergem', reunioes: [] })).toMatch(/direções opostas/);
    expect(painel.descreverRazao({ nome: 'X', razao: 'insistido_sem_retorno', reunioes: [1, 2] })).toMatch(/2 reuniões/);
  });
});
