import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

let tmp: string;
let statusPath: string;
let cf: typeof import('./clientesFinais.cjs');

const TAGS_FIXTURE = [
  { id: 'alerta', rotulo: 'Alerta', ativa: true, entra_na_analise: true, cor: '#ec1818' },
  { id: 'inadimplente', rotulo: 'Inadimplente', ativa: true, entra_na_analise: true, cor: '#f43f5e' },
  { id: 'encerrou_operacao', rotulo: 'Encerrou operação', ativa: false, entra_na_analise: true, cor: '#64748b' },
];

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-clientesfinais-'));
  statusPath = path.join(tmp, 'cf.json');
  const tagsPath = path.join(tmp, 'tags.json');
  fs.writeFileSync(tagsPath, JSON.stringify(TAGS_FIXTURE), 'utf8');
  process.env.ALVOS_CLIENTES_FINAIS_PATH = statusPath;
  process.env.TAGS_CLIENTE_FINAL_PATH = tagsPath;
  delete require.cache[require.resolve('./clientesFinais.cjs')];
  delete require.cache[require.resolve('./tags.cjs')];
  delete require.cache[require.resolve('../config.cjs')];
  cf = require('./clientesFinais.cjs');
});

afterEach(() => {
  delete process.env.ALVOS_CLIENTES_FINAIS_PATH;
  delete process.env.TAGS_CLIENTE_FINAL_PATH;
  delete require.cache[require.resolve('./clientesFinais.cjs')];
  delete require.cache[require.resolve('./tags.cjs')];
  delete require.cache[require.resolve('../config.cjs')];
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('clientesFinais: tags (vocabulário compartilhado do Ecossistema)', () => {
  it('grava e lê tags de um cliente final', () => {
    cf.definir('c1', 'Widmen', { tags: ['inadimplente'] }, { atualizadoEm: '2026-09-01' });
    expect(cf.buscarFicha('c1', 'Widmen')).toMatchObject({ nome: 'Widmen', tags: ['inadimplente'], atualizadoEm: '2026-09-01' });
  });

  it('aceita mais de uma tag no mesmo cliente final', () => {
    cf.definir('c1', 'Widmen', { tags: ['inadimplente', 'alerta'] });
    expect(cf.buscarFicha('c1', 'Widmen')?.tags).toEqual(['inadimplente', 'alerta']);
  });

  it('recusa tag que não existe no tags.json', () => {
    expect(() => cf.definir('c1', 'Widmen', { tags: ['inventada'] })).toThrow(/Tag inválida/);
  });

  it('recusa tag desativada (ativa: false) — some da lista de opções', () => {
    expect(() => cf.definir('c1', 'Widmen', { tags: ['encerrou_operacao'] })).toThrow(/Tag inválida/);
  });

  it('busca por nome é normalizada (sem acento/maiúscula)', () => {
    cf.definir('c1', 'João Distribuidora', { tags: ['alerta'] });
    expect(cf.buscarFicha('c1', 'joao distribuidora')?.tags).toEqual(['alerta']);
  });
});

describe('clientesFinais: grupo (G1/G2/G3)', () => {
  it('grava grupo sem tag nenhuma', () => {
    cf.definir('c1', 'Cooperativa Regional', { grupo: 'G1 (Grupo 1)' });
    expect(cf.buscarFicha('c1', 'Cooperativa Regional')).toMatchObject({ grupo: 'G1 (Grupo 1)', tags: [] });
  });

  it('tags e grupo convivem, e um patch não apaga o outro', () => {
    cf.definir('c1', 'GSM Logística', { grupo: 'G1 (Grupo 1)' });
    cf.definir('c1', 'GSM Logística', { tags: ['alerta'] });
    expect(cf.buscarFicha('c1', 'GSM Logística')).toMatchObject({ grupo: 'G1 (Grupo 1)', tags: ['alerta'] });
  });

  it('grupo vazio limpa só o grupo', () => {
    cf.definir('c1', 'Comac', { grupo: 'G3 (Grupo 3)', tags: ['alerta'] });
    cf.definir('c1', 'Comac', { grupo: '' });
    expect(cf.buscarFicha('c1', 'Comac')).toMatchObject({ grupo: null, tags: ['alerta'] });
  });
});

describe('clientesFinais: escopo e limpeza', () => {
  it('mesmo nome em clientId diferente não conflita — escopo é por loja', () => {
    cf.definir('c1', 'Widmen', { tags: ['inadimplente'] });
    cf.definir('c2', 'Widmen', { tags: ['alerta'] });
    expect(cf.buscarFicha('c1', 'Widmen')?.tags).toEqual(['inadimplente']);
    expect(cf.buscarFicha('c2', 'Widmen')?.tags).toEqual(['alerta']);
  });

  it('ficha sem tag E sem grupo é removida (não deixa registro vazio)', () => {
    cf.definir('c1', 'Widmen', { tags: ['alerta'] });
    cf.definir('c1', 'Widmen', { tags: [] });
    expect(cf.buscarFicha('c1', 'Widmen')).toBeNull();
  });

  it('fichasDoCliente sem registro devolve lista vazia', () => {
    expect(cf.fichasDoCliente('cliente-sem-nada')).toEqual([]);
  });

  it('preserva fichas de outros clientes finais ao gravar uma nova', () => {
    cf.definir('c1', 'Widmen', { tags: ['alerta'] });
    cf.definir('c1', 'Outro Cliente', { grupo: 'G2 (Grupo 2)' });
    expect(cf.fichasDoCliente('c1')).toHaveLength(2);
  });
});
