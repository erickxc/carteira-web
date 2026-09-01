import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

/**
 * Mesmo padrão de `alvos.test.ts`: router num Express real, porta efêmera,
 * `fetch`. Só cobre `/atualizar-dossie/:clientId` de ponta a ponta — a rota
 * NÃO chama o provedor de IA de verdade em nenhum dos dois casos testados
 * (404 antes de chegar lá; "sem evento novo" retorna cedo dentro de
 * `gerarAnalisesPendentes`, ver `eventosParaAnalisar`). `/gerar-ata` sempre
 * chama o modelo — coberto em unidade por `geracaoAta.test.ts`, não aqui
 * (mesmo critério do resto do projeto: rotas que dependem de LLM de verdade
 * não têm teste de HTTP, só a função pura por trás).
 */

let oneDriveDir: string;
let sqliteDir: string;

const MODULOS = [
  '../config.cjs', '../dominio/repo.cjs', '../dbSqlite.cjs', '../db.cjs',
  '../ia/analisesAutomaticas.cjs', '../ia/geracaoAta.cjs', './analiseIA.cjs',
];

function fecharConexaoSqlite() {
  try { require('../dbSqlite.cjs')._fecharParaTestes(); } catch { /* não aberta ainda */ }
}

function limparCaches() {
  for (const m of MODULOS) {
    try { delete require.cache[require.resolve(m, { paths: [__dirname] })]; } catch { /* não carregado */ }
  }
}

beforeEach(() => {
  oneDriveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-analiseia-route-od-'));
  sqliteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-analiseia-route-sq-'));
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
  const router = require('./analiseIA.cjs');
  const app = express();
  app.use(express.json());
  app.use('/api/ia', router);
  return new Promise<{ url: string; fechar: () => void }>((resolve) => {
    const servidor = app.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address() as { port: number };
      resolve({ url: `http://127.0.0.1:${port}/api/ia`, fechar: () => servidor.close() });
    });
  });
}

function criarCliente(id: string, empresa: string) {
  const { repoPlanilha } = require('../dominio/repo.cjs');
  const repo = repoPlanilha();
  repo.save('Clientes', [...repo.get('Clientes'), { id, empresa, estado: 'Ativo', createdAt: new Date().toISOString() }]);
}

describe('POST /api/ia/atualizar-dossie/:clientId', () => {
  it('404 pra cliente inexistente', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      const res = await fetch(`${url}/atualizar-dossie/nao-existe`, { method: 'POST' });
      expect(res.status).toBe(404);
    } finally {
      fechar();
    }
  });

  it('cliente sem reunião relevante: processados 0, sem chamar o provedor de IA', async () => {
    criarCliente('c1', 'Empresa Teste');
    const { url, fechar } = await subirAppDeTeste();
    try {
      const res = await fetch(`${url}/atualizar-dossie/c1`, { method: 'POST' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ processados: 0 });
    } finally {
      fechar();
    }
  });
});
