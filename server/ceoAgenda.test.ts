import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

let oneDriveDir: string;
let sqliteDir: string;

function limparCaches() {
  for (const m of ['./config.cjs', './modo.cjs', './ceoAgenda.cjs']) {
    try { delete require.cache[require.resolve(m, { paths: [__dirname] })]; } catch { /* não carregado ainda */ }
  }
}

beforeEach(() => {
  oneDriveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-onedrive-ceo-'));
  sqliteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-sqlite-ceo-'));
  process.env.ONEDRIVE_ROOT = oneDriveDir;
  process.env.SQLITE_DIR = sqliteDir;
  limparCaches();
});

afterEach(() => {
  delete process.env.ONEDRIVE_ROOT;
  delete process.env.SQLITE_DIR;
  delete process.env.APP_MODE;
  limparCaches();
  fs.rmSync(oneDriveDir, { recursive: true, force: true });
  fs.rmSync(sqliteDir, { recursive: true, force: true });
});

describe('ceoAgenda: getCache — Etapa 2 (server/client)', () => {
  it('em modo server, devolve o cache em memória (vazio antes de sincronizar, sem tocar arquivo)', () => {
    process.env.APP_MODE = 'server';
    limparCaches();
    const ceoAgenda: typeof import('./ceoAgenda.cjs') = require('./ceoAgenda.cjs');
    expect(ceoAgenda.getCache()).toEqual({ events: [], lastSync: null, lastError: null });
  });

  it('em modo client, lê o cache persistido em arquivo (DATA_DIR/ceo-agenda-cache.json) — não fica sempre vazio', () => {
    const { DATA_DIR } = require('./config.cjs') as typeof import('./config.cjs');
    const cacheFile = path.join(DATA_DIR, 'ceo-agenda-cache.json');
    const cacheEsperado = { events: [{ id: 'ceo-1', title: 'Reunião do Marco' }], lastSync: '2026-01-01T00:00:00.000Z', lastError: null };
    fs.writeFileSync(cacheFile, JSON.stringify(cacheEsperado));

    process.env.APP_MODE = 'client';
    limparCaches();
    const ceoAgenda: typeof import('./ceoAgenda.cjs') = require('./ceoAgenda.cjs');
    expect(ceoAgenda.getCache()).toEqual(cacheEsperado);
  });

  it('em modo client, sem arquivo de cache ainda publicado, devolve vazio (não lança erro)', () => {
    process.env.APP_MODE = 'client';
    limparCaches();
    const ceoAgenda: typeof import('./ceoAgenda.cjs') = require('./ceoAgenda.cjs');
    expect(ceoAgenda.getCache()).toEqual({ events: [], lastSync: null, lastError: null });
  });
});
