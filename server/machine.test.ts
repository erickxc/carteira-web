import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-machine-test-'));
  process.env.SQLITE_DIR = tmpDir;
  const configPath = require.resolve('./config.cjs');
  const machinePath = require.resolve('./machine.cjs');
  delete require.cache[configPath];
  delete require.cache[machinePath];
});

afterEach(() => {
  delete process.env.SQLITE_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('machine: machineId', () => {
  it('gera um machineId novo e persiste em arquivo local (fora do OneDrive)', () => {
    const machine: typeof import('./machine.cjs') = require('./machine.cjs');
    expect(machine.machineId).toMatch(/^[0-9a-f-]{36}$/);
    expect(fs.readFileSync(machine.MACHINE_ID_FILE, 'utf8').trim()).toBe(machine.machineId);
  });

  it('reutiliza o machineId já persistido em vez de gerar um novo', () => {
    const machinePath = require.resolve('./machine.cjs');
    const primeiro: typeof import('./machine.cjs') = require('./machine.cjs');
    const id1 = primeiro.machineId;

    delete require.cache[machinePath];
    const segundo: typeof import('./machine.cjs') = require('./machine.cjs');
    expect(segundo.machineId).toBe(id1);
  });
});

describe('machine: proximoSeq', () => {
  it('é monotônico e persiste entre reloads do módulo', () => {
    const machinePath = require.resolve('./machine.cjs');
    const primeiro: typeof import('./machine.cjs') = require('./machine.cjs');
    expect(primeiro.proximoSeq()).toBe(1);
    expect(primeiro.proximoSeq()).toBe(2);

    delete require.cache[machinePath];
    const segundo: typeof import('./machine.cjs') = require('./machine.cjs');
    expect(segundo.proximoSeq()).toBe(3);
  });
});
