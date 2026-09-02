import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

let tmp: string;
let arquivo: string;
let snap: typeof import('./catalogoSnapshot.cjs');

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-catalogo-snap-'));
  arquivo = path.join(tmp, 'catalogo.json');
  process.env.ALVOS_CATALOGO_PATH = arquivo;
  delete require.cache[require.resolve('./catalogoSnapshot.cjs')];
  delete require.cache[require.resolve('../config.cjs')];
  snap = require('./catalogoSnapshot.cjs');
});

afterEach(() => {
  delete process.env.ALVOS_CATALOGO_PATH;
  delete require.cache[require.resolve('./catalogoSnapshot.cjs')];
  delete require.cache[require.resolve('../config.cjs')];
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('catalogoSnapshot', () => {
  it('grava e lê produtos/clientes de um cliente', () => {
    snap.salvar('c1', { produtos: ['Kit Amortecedor'], clientes: ['GSM Logística'] }, { atualizadoEm: '2026-09-01T10:00:00.000Z' });
    expect(snap.doCliente('c1')).toEqual({
      produtos: ['Kit Amortecedor'],
      clientes: ['GSM Logística'],
      atualizadoEm: '2026-09-01T10:00:00.000Z',
    });
  });

  it('cliente sem espelho devolve listas vazias (não quebra)', () => {
    expect(snap.doCliente('nunca-gravado')).toEqual({ produtos: [], clientes: [], atualizadoEm: null });
  });

  /**
   * O ponto central do pedido do usuário: "não pode perder os clientes". Uma
   * leitura frustrada (cache frio, arquivo indisponível) chega aqui como listas
   * vazias — e não pode apagar o espelho bom que já existia.
   */
  it('gravação vazia NÃO apaga o espelho existente', () => {
    snap.salvar('c1', { produtos: ['Kit Amortecedor'], clientes: ['GSM Logística'] });
    snap.salvar('c1', { produtos: [], clientes: [] });
    expect(snap.doCliente('c1').clientes).toEqual(['GSM Logística']);
  });

  it('gravar um cliente não afeta o espelho de outro', () => {
    snap.salvar('c1', { produtos: ['A'], clientes: ['X'] });
    snap.salvar('c2', { produtos: ['B'], clientes: ['Y'] });
    expect(snap.doCliente('c1').produtos).toEqual(['A']);
    expect(snap.doCliente('c2').produtos).toEqual(['B']);
  });

  it('leitura nova substitui a antiga do MESMO cliente (nome removido na origem sai da sugestão)', () => {
    snap.salvar('c1', { produtos: ['A', 'B'], clientes: ['X'] });
    snap.salvar('c1', { produtos: ['A'], clientes: ['X'] });
    expect(snap.doCliente('c1').produtos).toEqual(['A']);
  });

  it('arquivo corrompido não derruba — devolve vazio', () => {
    fs.writeFileSync(arquivo, '{ isso não é json', 'utf8');
    expect(snap.carregar()).toEqual({});
    expect(snap.doCliente('c1').produtos).toEqual([]);
  });
});
