import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

let tmp: string;
let statusPath: string;
let cf: typeof import('./clientesFinais.cjs');

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-clientesfinais-'));
  statusPath = path.join(tmp, 'cf.json');
  process.env.ALVOS_CLIENTES_FINAIS_PATH = statusPath;
  delete require.cache[require.resolve('./clientesFinais.cjs')];
  cf = require('./clientesFinais.cjs');
});

afterEach(() => {
  delete process.env.ALVOS_CLIENTES_FINAIS_PATH;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('clientesFinais: definirStatus/statusDoCliente/buscarStatusUm', () => {
  it('grava e lê a situação de um cliente final', () => {
    cf.definirStatus('c1', 'Widmen', 'inadimplente', { atualizadoEm: '2026-09-01' });
    const registro = cf.buscarStatusUm('c1', 'Widmen');
    expect(registro).toMatchObject({ nome: 'Widmen', status: 'inadimplente', atualizadoEm: '2026-09-01' });
  });

  it('busca por nome é normalizada (sem acento/maiúscula)', () => {
    cf.definirStatus('c1', 'João Distribuidora', 'regular');
    expect(cf.buscarStatusUm('c1', 'joao distribuidora')).toMatchObject({ status: 'regular' });
  });

  it('mesmo nome em clientId diferente não conflita — escopo é por loja', () => {
    cf.definirStatus('c1', 'Widmen', 'inadimplente');
    cf.definirStatus('c2', 'Widmen', 'regular');
    expect(cf.buscarStatusUm('c1', 'Widmen')?.status).toBe('inadimplente');
    expect(cf.buscarStatusUm('c2', 'Widmen')?.status).toBe('regular');
  });

  it('status null remove o registro', () => {
    cf.definirStatus('c1', 'Widmen', 'inadimplente');
    cf.definirStatus('c1', 'Widmen', null);
    expect(cf.buscarStatusUm('c1', 'Widmen')).toBeNull();
  });

  it('regravar o mesmo cliente final substitui, não duplica', () => {
    cf.definirStatus('c1', 'Widmen', 'inadimplente');
    cf.definirStatus('c1', 'Widmen', 'regular');
    expect(cf.statusDoCliente('c1')).toHaveLength(1);
    expect(cf.statusDoCliente('c1')[0].status).toBe('regular');
  });

  it('status inválido lança erro com a lista de opções', () => {
    expect(() => cf.definirStatus('c1', 'Widmen', 'atrasado')).toThrow(/inadimplente, regular, situacao_externa/);
  });

  it('statusDoCliente sem registro devolve lista vazia', () => {
    expect(cf.statusDoCliente('cliente-sem-nada')).toEqual([]);
  });

  it('buscarStatusUm sem registro devolve null', () => {
    expect(cf.buscarStatusUm('c1', 'Ninguém')).toBeNull();
  });

  it('preserva registros de outros clientes finais ao gravar um novo', () => {
    cf.definirStatus('c1', 'Widmen', 'inadimplente');
    cf.definirStatus('c1', 'Outro Cliente', 'regular');
    expect(cf.statusDoCliente('c1')).toHaveLength(2);
  });
});
