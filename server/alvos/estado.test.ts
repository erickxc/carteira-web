import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

let tmp: string;
let vinculosPath: string;
let estado: typeof import('./estado.cjs');
let mapa: typeof import('./mapa.cjs');

const VINCULOS = {
  'Dados Mockados': { alianca_itaborai: 'c-itab', alianca_itaborai_CF: 'c-cabo' },
};
const LOJAS = { 'Dados Mockados': ['alianca_itaborai', 'alianca_itaborai_CF'] };

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-alvos-estado-'));
  vinculosPath = path.join(tmp, 'v.json');
  process.env.ALVOS_VINCULOS_PATH = vinculosPath;
  for (const m of ['./mapa.cjs', './estado.cjs']) delete require.cache[require.resolve(m)];
  mapa = require('./mapa.cjs');
  estado = require('./estado.cjs');
});

afterEach(() => {
  delete process.env.ALVOS_VINCULOS_PATH;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('estado: quando o dossiê pode analisar métricas', () => {
  it('cliente vinculado a loja existente está ok', () => {
    const r = estado.estadoDoCliente('c-itab', { vinculos: VINCULOS, lojasPorEmpresa: LOJAS });
    expect(r.estado).toBe('ok');
    expect(r.analisarMetricas).toBe(true);
    expect(r.lojas).toEqual([{ empresa: 'Dados Mockados', loja: 'alianca_itaborai' }]);
  });

  it('cliente sem vínculo nenhum não analisa métricas', () => {
    const r = estado.estadoDoCliente('c-outro', { vinculos: VINCULOS, lojasPorEmpresa: LOJAS });
    expect(r.estado).toBe('sem_vinculo');
    expect(r.analisarMetricas).toBe(false);
    expect(r.motivo).toMatch(/nenhuma loja/);
  });

  /**
   * O caso que justifica revalidar a cada leitura: o arquivo é gerado por outro
   * sistema. Se o id da loja for renomeado lá, o vínculo antigo aponta para nada
   * — e o cálculo veria zero venda, fazendo o dossiê reportar "queda total".
   */
  it('loja que desapareceu do arquivo bloqueia a análise', () => {
    const r = estado.estadoDoCliente('c-cabo', {
      vinculos: VINCULOS,
      lojasPorEmpresa: { 'Dados Mockados': ['alianca_itaborai'] },
    });
    expect(r.estado).toBe('vinculo_quebrado');
    expect(r.analisarMetricas).toBe(false);
    expect(r.motivo).toMatch(/alianca_itaborai_CF/);
  });

  it('empresa não lida nesta chamada não é acusada de vínculo quebrado', () => {
    // `lojasPorEmpresa` vazio = ninguém leu o arquivo, não "o arquivo está
    // vazio". Acusar aqui pararia a análise de um cliente correto.
    const r = estado.estadoDoCliente('c-itab', { vinculos: VINCULOS, lojasPorEmpresa: {} });
    expect(r.estado).toBe('ok');
    expect(r.naoVerificadas).toBe(1);
  });

  it('cliente vinculado a duas lojas exige as duas existindo', () => {
    const duas = { 'Dados Mockados': { alianca_itaborai: 'c-um', alianca_itaborai_CF: 'c-um' } };
    expect(estado.estadoDoCliente('c-um', { vinculos: duas, lojasPorEmpresa: LOJAS }).estado).toBe('ok');
    expect(estado.estadoDoCliente('c-um', {
      vinculos: duas,
      lojasPorEmpresa: { 'Dados Mockados': ['alianca_itaborai'] },
    }).estado).toBe('vinculo_quebrado');
  });

  it('lê os vínculos do arquivo quando não recebe o mapa', () => {
    mapa.vincular('Dados Mockados', 'alianca_itaborai', 'c-itab', vinculosPath);
    const r = estado.estadoDoCliente('c-itab', { caminho: vinculosPath, lojasPorEmpresa: LOJAS });
    expect(r.estado).toBe('ok');
  });

  it('vínculo removido volta o cliente para sem_vinculo', () => {
    mapa.vincular('Dados Mockados', 'alianca_itaborai', 'c-itab', vinculosPath);
    mapa.vincular('Dados Mockados', 'alianca_itaborai', null, vinculosPath);
    expect(estado.estadoDoCliente('c-itab', { caminho: vinculosPath, lojasPorEmpresa: LOJAS }).estado)
      .toBe('sem_vinculo');
  });
});

describe('estado: visão da carteira (dashboard de cadastro)', () => {
  const CLIENTES = [
    { id: 'c-itab', empresa: 'Aliança - Itaboraí' },
    { id: 'c-cabo', empresa: 'Aliança - Cabo Frio' },
    { id: 'c-sem', empresa: 'Mineirão' },
  ];

  it('classifica cada cliente e conta por estado', () => {
    const estados = estado.estadoDaCarteira(CLIENTES, {
      vinculos: VINCULOS,
      lojasPorEmpresa: { 'Dados Mockados': ['alianca_itaborai'] },
    });
    expect(estados.map((e) => e.estado)).toEqual(['ok', 'vinculo_quebrado', 'sem_vinculo']);
    expect(estado.resumoDaCarteira(estados)).toEqual({ ok: 1, sem_vinculo: 1, vinculo_quebrado: 1 });
  });

  it('mantém o nome da empresa para a tela não precisar cruzar de novo', () => {
    const [primeiro] = estado.estadoDaCarteira(CLIENTES, { vinculos: VINCULOS, lojasPorEmpresa: LOJAS });
    expect(primeiro.empresa).toBe('Aliança - Itaboraí');
  });

  it('resumo de carteira vazia devolve zeros, não objeto vazio', () => {
    expect(estado.resumoDaCarteira([])).toEqual({ ok: 0, sem_vinculo: 0, vinculo_quebrado: 0 });
  });
});
