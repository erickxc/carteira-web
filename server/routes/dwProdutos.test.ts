import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

/**
 * Rota do retrato "No DW agora". Isola ONEDRIVE_ROOT/SQLITE_DIR, força o modo
 * e as credenciais do DW por env (env do processo vence o `.env`), e troca o
 * cliente do DW por um falso no `require.cache` — o DW real nunca é tocado.
 */
const MODULOS = ['../config.cjs', '../modo.cjs', '../dw/retratoProdutos.cjs', '../dw/dwPlataforma.cjs', './dwProdutos.cjs'];
const VARS_DW = ['DW_PLATAFORMA_HOST', 'DW_PLATAFORMA_PORT', 'DW_PLATAFORMA_DATABASE', 'DW_PLATAFORMA_USER', 'DW_PLATAFORMA_PASSWORD'];
const resolver = (m: string) => require.resolve(m, { paths: [__dirname] });
const limparCaches = () => {
  for (const m of MODULOS) {
    try { delete require.cache[resolver(m)]; } catch { /* não carregado */ }
  }
};

let oneDriveDir: string;
let sqliteDir: string;
let envAntes: Record<string, string | undefined>;

beforeEach(() => {
  envAntes = Object.fromEntries(['APP_MODE', ...VARS_DW].map((k) => [k, process.env[k]]));
  oneDriveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-dwprod-od-'));
  sqliteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-dwprod-sq-'));
  process.env.ONEDRIVE_ROOT = oneDriveDir;
  process.env.SQLITE_DIR = sqliteDir;
  limparCaches();
});

afterEach(() => {
  for (const [k, v] of Object.entries(envAntes)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  delete process.env.ONEDRIVE_ROOT;
  delete process.env.SQLITE_DIR;
  limparCaches();
  fs.rmSync(oneDriveDir, { recursive: true, force: true });
  fs.rmSync(sqliteDir, { recursive: true, force: true });
});

function configurar({ modo, dw, buscar }: { modo: 'server' | 'client'; dw: boolean; buscar?: () => Promise<unknown[]> }) {
  process.env.APP_MODE = modo;
  const valores = ['127.0.0.1', '1', 'falso', 'falso', 'falso'];
  // String vazia (e não delete): impede o `.env` real de preencher a chave.
  VARS_DW.forEach((k, i) => { process.env[k] = dw ? valores[i] : ''; });
  const chamadas = { n: 0 };
  const caminho = resolver('../dw/dwPlataforma.cjs');
  require.cache[caminho] = {
    id: caminho, filename: caminho, loaded: true,
    exports: { buscarProdutosParametroBi: async () => { chamadas.n++; return buscar ? buscar() : []; } },
  } as unknown as NodeJS.Module;
  return chamadas;
}

async function subir() {
  const app = express();
  app.use('/api/dw-produtos', require('./dwProdutos.cjs'));
  return new Promise<{ url: string; fechar: () => void }>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number };
      resolve({ url: `http://127.0.0.1:${port}/api/dw-produtos`, fechar: () => s.close() });
    });
  });
}

const arquivo = () => path.join(oneDriveDir, 'dados', 'dw-produtos.json');

describe('GET /api/dw-produtos', () => {
  it('sem retrato gravado devolve null', async () => {
    configurar({ modo: 'client', dw: false });
    const { url, fechar } = await subir();
    try {
      const res = await fetch(url);
      expect(res.status).toBe(200);
      expect(await res.json()).toBeNull();
    } finally { fechar(); }
  });

  it('máquina client lê o arquivo gravado pela servidora', async () => {
    configurar({ modo: 'client', dw: false });
    const retrato = { geradoEm: 'g', porCnpj: { '11111111000111': ['2D Price'] } };
    fs.mkdirSync(path.dirname(arquivo()), { recursive: true });
    fs.writeFileSync(arquivo(), JSON.stringify(retrato));
    const { url, fechar } = await subir();
    try {
      expect(await (await fetch(url)).json()).toEqual(retrato);
    } finally { fechar(); }
  });

  it('arquivo corrompido responde 500, não null', async () => {
    configurar({ modo: 'client', dw: false });
    fs.mkdirSync(path.dirname(arquivo()), { recursive: true });
    fs.writeFileSync(arquivo(), '{ meio arquivo');
    const { url, fechar } = await subir();
    try {
      expect((await fetch(url)).status).toBe(500);
    } finally { fechar(); }
  });
});

describe('POST /api/dw-produtos/atualizar', () => {
  it('modo client: 409 e não lê o DW nem grava', async () => {
    const chamadas = configurar({ modo: 'client', dw: true });
    const { url, fechar } = await subir();
    try {
      expect((await fetch(`${url}/atualizar`, { method: 'POST' })).status).toBe(409);
      expect(chamadas.n).toBe(0);
      expect(fs.existsSync(arquivo())).toBe(false);
    } finally { fechar(); }
  });

  it('servidora sem DW configurado: 409 e não lê o DW', async () => {
    const chamadas = configurar({ modo: 'server', dw: false });
    const { url, fechar } = await subir();
    try {
      expect((await fetch(`${url}/atualizar`, { method: 'POST' })).status).toBe(409);
      expect(chamadas.n).toBe(0);
    } finally { fechar(); }
  });

  it('servidora com DW: lê, grava e devolve o retrato', async () => {
    configurar({ modo: 'server', dw: true, buscar: async () => [{ cnpj: '11111111000111', precificar: 'S', monitoria: 'N' }] });
    const { url, fechar } = await subir();
    try {
      const res = await fetch(`${url}/atualizar`, { method: 'POST' });
      expect(res.status).toBe(200);
      const corpo = await res.json();
      expect(corpo.porCnpj).toEqual({ '11111111000111': ['2D Price'] });
      expect(JSON.parse(fs.readFileSync(arquivo(), 'utf-8'))).toEqual(corpo);
    } finally { fechar(); }
  });

  it('DW fora: 502 e o retrato anterior continua no GET', async () => {
    configurar({ modo: 'server', dw: true, buscar: async () => { throw new Error('conexão recusada'); } });
    const anterior = { geradoEm: 'ontem', porCnpj: { '1': ['Apura'] } };
    fs.mkdirSync(path.dirname(arquivo()), { recursive: true });
    fs.writeFileSync(arquivo(), JSON.stringify(anterior));
    const { url, fechar } = await subir();
    try {
      const res = await fetch(`${url}/atualizar`, { method: 'POST' });
      expect(res.status).toBe(502);
      expect((await res.json()).error).toMatch(/conexão recusada/);
      expect(await (await fetch(url)).json()).toEqual(anterior);
    } finally { fechar(); }
  });
});
