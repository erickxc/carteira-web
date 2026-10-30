import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

let oneDriveDir: string;
let sqliteDir: string;

const MODULOS = ['../config.cjs', '../dominio/repo.cjs', '../dbSqlite.cjs', '../db.cjs', './categorias.cjs'];

function fecharConexaoSqlite() {
  try { require('../dbSqlite.cjs')._fecharParaTestes(); } catch { /* não aberta ainda */ }
}

function limparCaches() {
  for (const m of MODULOS) {
    try { delete require.cache[require.resolve(m, { paths: [__dirname] })]; } catch { /* não carregado */ }
  }
}

beforeEach(() => {
  oneDriveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-categorias-route-od-'));
  sqliteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-categorias-route-sq-'));
  process.env.ONEDRIVE_ROOT = oneDriveDir;
  process.env.SQLITE_DIR = sqliteDir;
  limparCaches();
});

afterEach(() => {
  fecharConexaoSqlite();
  delete process.env.ONEDRIVE_ROOT;
  delete process.env.SQLITE_DIR;
  limparCaches();
  fs.rmSync(oneDriveDir, { recursive: true, force: true });
  fs.rmSync(sqliteDir, { recursive: true, force: true });
});

async function subirAppDeTeste() {
  const router = require('./categorias.cjs');
  const app = express();
  app.use(express.json());
  app.use('/api/categorias', router);
  return new Promise<{ url: string; fechar: () => void }>((resolve) => {
    const servidor = app.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address() as { port: number };
      resolve({ url: `http://127.0.0.1:${port}/api/categorias`, fechar: () => servidor.close() });
    });
  });
}

describe('POST /api/categorias — tipoLink/urlAplicacao de um serviço', () => {
  it('cria um serviço tipo powerbi', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'servico', valor: 'OptiMarco', tipoLink: 'powerbi' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tipoLink).toBe('powerbi');
      expect(body.urlAplicacao).toBeUndefined();
    } finally {
      fechar();
    }
  });

  it('cria um serviço tipo aplicacao com URL', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'servico', valor: 'AutoTech', tipoLink: 'aplicacao', urlAplicacao: 'https://autotech.example.com' }),
      });
      const body = await res.json();
      expect(body.tipoLink).toBe('aplicacao');
      expect(body.urlAplicacao).toBe('https://autotech.example.com');
    } finally {
      fechar();
    }
  });

  it('400 pra tipoLink inválido', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'servico', valor: 'X', tipoLink: 'nuvem' }),
      });
      expect(res.status).toBe(400);
    } finally {
      fechar();
    }
  });

  it('sem tipoLink, cria normalmente (comportamento de hoje preservado)', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'servico', valor: 'Monitoria Extra' }),
      });
      const body = await res.json();
      expect(body.tipoLink).toBeUndefined();
    } finally {
      fechar();
    }
  });
});

describe('PUT /api/categorias/:id — limpa tipoLink com null', () => {
  it('grava e depois limpa tipoLink/urlAplicacao', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      const criado = await (await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'servico', valor: 'Raptor', tipoLink: 'aplicacao', urlAplicacao: 'https://raptor.example.com' }),
      })).json();

      const atualizado = await (await fetch(`${url}/${criado.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor: 'Raptor', tipoLink: null, urlAplicacao: null }),
      })).json();

      expect(atualizado.tipoLink).toBeNull();
      expect(atualizado.urlAplicacao).toBeNull();
    } finally {
      fechar();
    }
  });
});

describe('reordenar produtos (setas de Configurações)', () => {
  const put = (url: string, id: string, corpo: object) =>
    fetch(`${url}/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const post = async (url: string, valor: string, extra: object = {}) =>
    (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo: 'servico', valor, ...extra }) })).json();

  it('`ordem` regravada persiste (inclusive 0) e não apaga cor nem valor', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      const a = await post(url, 'Apura', { cor: '#112233' });
      const b = await post(url, 'Raptor');
      // Como `mover`: PUT { valor, ordem }, um por item.
      await Promise.all([put(url, a.id, { valor: a.valor, ordem: 1 }), put(url, b.id, { valor: b.valor, ordem: 0 })]);
      const lista = await (await fetch(url)).json();
      const ordenada = lista.sort((x: { ordem: number }, y: { ordem: number }) => x.ordem - y.ordem);
      expect(ordenada.map((c: { valor: string }) => c.valor)).toEqual(['Raptor', 'Apura']);
      expect(ordenada[0].ordem).toBe(0);
      expect(ordenada[1].cor).toBe('#112233');
    } finally {
      fechar();
    }
  });

  it('categoria criada depois de uma exclusão pode repetir `ordem` — por isso a lista inteira é regravada', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      const a = await post(url, 'Apura');
      await post(url, 'Raptor');
      await fetch(`${url}/${a.id}`, { method: 'DELETE' });
      const c = await post(url, 'Controladoria');
      const lista = await (await fetch(url)).json();
      expect(lista.find((x: { valor: string }) => x.valor === 'Raptor').ordem).toBe(c.ordem);
    } finally {
      fechar();
    }
  });
});

describe('seed de produtos', () => {
  it('base nova nasce com a lista oficial, na ordem oficial; base existente não muda', () => {
    const { initDbSqlite, getSheetData, saveSheetData } = require('../dbSqlite.cjs');
    const { PRODUTOS_OFICIAIS } = require('../../shared/produtos.cjs');
    initDbSqlite();
    const servicos = () => getSheetData('Categorias').filter((c: { tipo: string }) => c.tipo === 'servico')
      .sort((a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem).map((c: { valor: string }) => c.valor);
    expect(servicos()).toEqual(PRODUTOS_OFICIAIS);

    saveSheetData('Categorias', [{ id: '1', tipo: 'servico', valor: 'Monitoria', ordem: 0, createdAt: '' }]);
    initDbSqlite();
    expect(servicos()).toEqual(['Monitoria']);
  });
});
