import { createRequire } from 'module';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

function carregarModo() {
  const modoPath = require.resolve('./modo.cjs');
  delete require.cache[modoPath];
  return require('./modo.cjs') as typeof import('./modo.cjs');
}

describe('modo: APP_MODE', () => {
  afterEach(() => {
    delete process.env.APP_MODE;
    delete process.env.CARTEIRA_HOSTNAME_SERVIDOR;
  });

  it('sem APP_MODE, decide pelo hostname: "server" só na máquina configurada como servidor', () => {
    process.env.CARTEIRA_HOSTNAME_SERVIDOR = os.hostname();
    const modo = carregarModo();
    expect(modo.APP_MODE).toBe('server');
    expect(modo.isServer).toBe(true);
    expect(modo.isClient).toBe(false);
  });

  it('sem APP_MODE, hostname diferente do configurado como servidor vira "client"', () => {
    process.env.CARTEIRA_HOSTNAME_SERVIDOR = 'uma-maquina-que-nao-existe-de-verdade';
    const modo = carregarModo();
    expect(modo.APP_MODE).toBe('client');
    expect(modo.isClient).toBe(true);
    expect(modo.isServer).toBe(false);
  });

  it('a comparação de hostname ignora maiúsculas/minúsculas', () => {
    process.env.CARTEIRA_HOSTNAME_SERVIDOR = os.hostname().toUpperCase();
    expect(carregarModo().APP_MODE).toBe('server');
  });

  it('APP_MODE=client força modo cliente mesmo na máquina servidor', () => {
    process.env.CARTEIRA_HOSTNAME_SERVIDOR = os.hostname();
    process.env.APP_MODE = 'client';
    const modo = carregarModo();
    expect(modo.APP_MODE).toBe('client');
    expect(modo.isClient).toBe(true);
  });

  it('APP_MODE=server força modo servidor mesmo numa máquina que não é a servidora', () => {
    process.env.CARTEIRA_HOSTNAME_SERVIDOR = 'uma-maquina-que-nao-existe-de-verdade';
    process.env.APP_MODE = 'server';
    expect(carregarModo().APP_MODE).toBe('server');
  });

  it('qualquer outro valor de APP_MODE cai no default por hostname (nunca client por engano)', () => {
    process.env.CARTEIRA_HOSTNAME_SERVIDOR = os.hostname();
    process.env.APP_MODE = 'Client';
    expect(carregarModo().APP_MODE).toBe('server');
    process.env.APP_MODE = 'servidor';
    expect(carregarModo().APP_MODE).toBe('server');
  });
});
