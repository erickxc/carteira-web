import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

let oneDriveDir: string;
let sqliteDir: string;
let releasesDir: string;

function limparCaches() {
  for (const m of ['../config.cjs', './atualizacao.cjs']) {
    try { delete require.cache[require.resolve(m, { paths: [__dirname] })]; } catch { /* não carregado ainda */ }
  }
}

beforeEach(() => {
  oneDriveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-onedrive-atualizacao-'));
  sqliteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-sqlite-atualizacao-'));
  releasesDir = path.join(oneDriveDir, 'releases');
  fs.mkdirSync(releasesDir, { recursive: true });
  process.env.ONEDRIVE_ROOT = oneDriveDir;
  process.env.SQLITE_DIR = sqliteDir;
  process.env.BACKUP_ONEDRIVE_DIR = oneDriveDir;
  limparCaches();
});

afterEach(() => {
  delete process.env.ONEDRIVE_ROOT;
  delete process.env.SQLITE_DIR;
  delete process.env.BACKUP_ONEDRIVE_DIR;
  limparCaches();
  fs.rmSync(oneDriveDir, { recursive: true, force: true });
  fs.rmSync(sqliteDir, { recursive: true, force: true });
});

function versaoInstaladaReal(): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
  return pkg.version;
}

async function subirAppDeTeste() {
  const router = require('./atualizacao.cjs');
  const app = express();
  app.use('/api/atualizacao', router);
  return new Promise<{ url: string; fechar: () => void }>((resolve) => {
    const servidor = app.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address() as { port: number };
      resolve({ url: `http://127.0.0.1:${port}/api/atualizacao`, fechar: () => servidor.close() });
    });
  });
}

describe('GET /api/atualizacao/status', () => {
  it('sem release publicada: instalada = versão do package.json, disponivel = null, atualizada = true', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      const res = await fetch(`${url}/status`);
      const body = await res.json();
      expect(body).toEqual({
        instalada: versaoInstaladaReal(), disponivel: null, atualizada: true, publicadoEm: null, podeAplicar: false,
      });
    } finally {
      fechar();
    }
  });

  it('release publicada com versão MAIOR: atualizada = false', async () => {
    const instalada = versaoInstaladaReal();
    const [maj] = instalada.split('.').map(Number);
    const versaoMaior = `${maj + 1}.0.0`;
    fs.writeFileSync(path.join(releasesDir, 'latest.json'), JSON.stringify({
      versao: versaoMaior, arquivo: `carteira-v${versaoMaior}.zip`, publicadoEm: '2026-01-01T00:00:00.000Z',
    }));

    const { url, fechar } = await subirAppDeTeste();
    try {
      const res = await fetch(`${url}/status`);
      const body = await res.json();
      expect(body).toEqual({
        instalada, disponivel: versaoMaior, atualizada: false, publicadoEm: '2026-01-01T00:00:00.000Z', podeAplicar: false,
      });
    } finally {
      fechar();
    }
  });

  it('release publicada com a MESMA versão instalada: atualizada = true', async () => {
    const instalada = versaoInstaladaReal();
    fs.writeFileSync(path.join(releasesDir, 'latest.json'), JSON.stringify({
      versao: instalada, arquivo: `carteira-v${instalada}.zip`, publicadoEm: '2026-01-01T00:00:00.000Z',
    }));

    const { url, fechar } = await subirAppDeTeste();
    try {
      const res = await fetch(`${url}/status`);
      const body = await res.json();
      expect(body.atualizada).toBe(true);
    } finally {
      fechar();
    }
  });
});

describe('POST /api/atualizacao/aplicar', () => {
  afterEach(() => { delete process.env.CARTEIRA_LAUNCHER_EXE; });

  it('sem o .exe do launcher (dev/LAN): recusa com 400 e NÃO derruba o processo', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      const res = await fetch(`${url}/aplicar`, { method: 'POST' });
      expect(res.status).toBe(400);
    } finally {
      fechar();
    }
  });

  it('com .exe mas sem versão mais nova publicada: recusa com 409', async () => {
    process.env.CARTEIRA_LAUNCHER_EXE = 'C:\nao-existe\Carteira.exe';
    const instalada = versaoInstaladaReal();
    fs.writeFileSync(path.join(releasesDir, 'latest.json'), JSON.stringify({
      versao: instalada, arquivo: `carteira-v${instalada}.zip`, publicadoEm: '2026-01-01T00:00:00.000Z',
    }));

    const { url, fechar } = await subirAppDeTeste();
    try {
      const res = await fetch(`${url}/aplicar`, { method: 'POST' });
      expect(res.status).toBe(409);
    } finally {
      fechar();
    }
  });
});
