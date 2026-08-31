import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

/**
 * Mesmo padrão de `atualizacao.test.ts`: sobe o router num app Express de
 * verdade, numa porta efêmera, e usa `fetch`. Isola TODA a árvore de dados que
 * a rota toca — SQLite (Clientes/Agenda), Dados Alvos e os arquivos de vínculo
 * — para nunca ler nem escrever no que é real desta máquina.
 */

let oneDriveDir: string;
let sqliteDir: string;
let alvosDir: string;

const MODULOS = [
  '../config.cjs', '../dominio/repo.cjs', '../dbSqlite.cjs', '../db.cjs',
  '../alvos/leitor.cjs', '../alvos/cache.cjs', '../alvos/mapa.cjs', '../alvos/estado.cjs',
  '../alvos/entidades.cjs', '../alvos/movimento.cjs', '../alvos/acompanhamento.cjs',
  '../alvos/consulta.cjs', '../alvos/painel.cjs', './alvos.cjs',
];

/**
 * Fecha a conexão SQLite aberta (se houver) antes de trocar de diretório — sem
 * isso, `require.cache` some mas o handle do `better-sqlite3` continua vivo,
 * apontando pro arquivo do teste ANTERIOR: o próximo teste "cria" um cliente
 * que colide com o do teste passado (`UNIQUE constraint failed`). Mesmo motivo
 * documentado em `dbSqlite.test.ts`.
 */
function fecharConexaoSqlite() {
  try { require('../dbSqlite.cjs')._fecharParaTestes(); } catch { /* não aberta ainda */ }
}

function limparCaches() {
  for (const m of MODULOS) {
    try { delete require.cache[require.resolve(m, { paths: [__dirname] })]; } catch { /* não carregado */ }
  }
}

beforeEach(() => {
  oneDriveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-alvos-route-od-'));
  sqliteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-alvos-route-sq-'));
  alvosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-alvos-route-alvos-'));
  process.env.ONEDRIVE_ROOT = oneDriveDir;
  process.env.SQLITE_DIR = sqliteDir;
  process.env.ALVOS_DIR = alvosDir;
  limparCaches();
});

afterEach(() => {
  fecharConexaoSqlite();
  delete process.env.ONEDRIVE_ROOT;
  delete process.env.SQLITE_DIR;
  delete process.env.ALVOS_DIR;
  limparCaches();
  fs.rmSync(oneDriveDir, { recursive: true, force: true });
  fs.rmSync(sqliteDir, { recursive: true, force: true });
  fs.rmSync(alvosDir, { recursive: true, force: true });
});

function criarEmpresaDeTeste(nome: string) {
  const xlsx = require('xlsx');
  const { ALVOS_ARQUIVO } = require('../config.cjs');
  const linha = {
    ID_LOJA: 'loja_teste', NOME_CLIENTE: 'CONSUMIDOR TESTE (SA)', DESCRICAO_PRODUTO: 'Kit Amortecedor',
    ANO: 2026, 'MÊS': 'Julho', CODIGO_INTERNO_PRODUTO: '1', CODIGO_REFERENCIA_PRODUTO: 'X',
    NOME_FABRICANTE: 'FAB', 'Receita Acumulada 11 Meses': 1000, QTD: 10,
  };
  const dir = path.join(alvosDir, nome);
  fs.mkdirSync(dir, { recursive: true });
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet([linha]), 'Dados');
  xlsx.writeFile(wb, path.join(dir, ALVOS_ARQUIVO));
}

async function subirAppDeTeste() {
  const router = require('./alvos.cjs');
  const app = express();
  app.use(express.json());
  app.use('/api/alvos', router);
  return new Promise<{ url: string; fechar: () => void }>((resolve) => {
    const servidor = app.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address() as { port: number };
      resolve({ url: `http://127.0.0.1:${port}/api/alvos`, fechar: () => servidor.close() });
    });
  });
}

function criarCliente(id: string, empresa: string) {
  const { repoPlanilha } = require('../dominio/repo.cjs');
  const repo = repoPlanilha();
  repo.save('Clientes', [...repo.get('Clientes'), { id, empresa, estado: 'Ativo', createdAt: new Date().toISOString() }]);
}

describe('GET /api/alvos/cadastro', () => {
  it('carteira vazia devolve resumo zerado', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      const res = await fetch(`${url}/cadastro`);
      expect(await res.json()).toEqual({ resumo: { total: 0, ok: 0, sem_vinculo: 0, vinculo_quebrado: 0, semLocal: 0 }, linhas: [] });
    } finally { fechar(); }
  });

  it('cliente sem vínculo aparece na linha e no resumo', async () => {
    criarCliente('c1', 'Empresa Teste');
    const { url, fechar } = await subirAppDeTeste();
    try {
      const body = await (await fetch(`${url}/cadastro`)).json();
      expect(body.resumo).toMatchObject({ total: 1, sem_vinculo: 1 });
      expect(body.linhas[0]).toMatchObject({ clientId: 'c1', estadoAlvos: 'sem_vinculo' });
    } finally { fechar(); }
  });
});

describe('GET /api/alvos/alertas', () => {
  it('sem clientes, devolve lista vazia', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      expect(await (await fetch(`${url}/alertas`)).json()).toEqual([]);
    } finally { fechar(); }
  });
});

describe('GET /api/alvos/empresas', () => {
  it('lista só as pastas que têm o arquivo', async () => {
    criarEmpresaDeTeste('Empresa Teste');
    fs.mkdirSync(path.join(alvosDir, 'Pasta Vazia'));
    const { url, fechar } = await subirAppDeTeste();
    try {
      const lista = await (await fetch(`${url}/empresas`)).json();
      expect(lista).toContain('Empresa Teste');
      expect(lista).not.toContain('Pasta Vazia');
    } finally { fechar(); }
  });
});

describe('GET /api/alvos/sugestoes/:empresa', () => {
  it('404 pra empresa sem arquivo', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      expect((await fetch(`${url}/sugestoes/Nao Existe`)).status).toBe(404);
    } finally { fechar(); }
  });

  it('200 com candidatos pra empresa com arquivo', async () => {
    criarEmpresaDeTeste('Empresa Teste');
    criarCliente('c1', 'Empresa Teste');
    const { url, fechar } = await subirAppDeTeste();
    try {
      const res = await fetch(`${url}/sugestoes/${encodeURIComponent('Empresa Teste')}`);
      expect(res.status).toBe(200);
      const [loja] = await res.json();
      expect(loja.loja).toBe('loja_teste');
    } finally { fechar(); }
  });
});

describe('POST /api/alvos/vinculo', () => {
  it('400 sem empresa/loja', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      const res = await fetch(`${url}/vinculo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      expect(res.status).toBe(400);
    } finally { fechar(); }
  });

  it('404 pra clientId inexistente', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      const res = await fetch(`${url}/vinculo`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa: 'X', loja: 'loja_1', clientId: 'fantasma' }),
      });
      expect(res.status).toBe(404);
    } finally { fechar(); }
  });

  it('grava o vínculo e ele aparece em GET /vinculos e no /cadastro seguinte', async () => {
    criarEmpresaDeTeste('Empresa Teste');
    criarCliente('c1', 'Empresa Teste');
    const { url, fechar } = await subirAppDeTeste();
    try {
      const post = await fetch(`${url}/vinculo`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa: 'Empresa Teste', loja: 'loja_teste', clientId: 'c1' }),
      });
      expect(post.status).toBe(200);

      const vinculos = await (await fetch(`${url}/vinculos`)).json();
      expect(vinculos['Empresa Teste']).toEqual({ loja_teste: 'c1' });

      const cadastro = await (await fetch(`${url}/cadastro`)).json();
      expect(cadastro.linhas[0]).toMatchObject({ clientId: 'c1', estadoAlvos: 'ok' });
    } finally { fechar(); }
  });
});

describe('GET /api/alvos/catalogo/:clientId', () => {
  it('404 pra cliente inexistente', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      expect((await fetch(`${url}/catalogo/fantasma`)).status).toBe(404);
    } finally { fechar(); }
  });

  it('sem vínculo, disponivel false com motivo', async () => {
    criarCliente('c1', 'Empresa Teste');
    const { url, fechar } = await subirAppDeTeste();
    try {
      const body = await (await fetch(`${url}/catalogo/c1`)).json();
      expect(body).toMatchObject({ disponivel: false, estado: 'sem_vinculo' });
    } finally { fechar(); }
  });

  it('sem aquecer e cache frio, disponivel false por dados não carregados', async () => {
    criarEmpresaDeTeste('Empresa Teste');
    criarCliente('c1', 'Empresa Teste');
    const { vincular } = require('../alvos/mapa.cjs');
    vincular('Empresa Teste', 'loja_teste', 'c1');
    const { url, fechar } = await subirAppDeTeste();
    try {
      const body = await (await fetch(`${url}/catalogo/c1`)).json();
      expect(body.disponivel).toBe(false);
      expect(body.pendentes).toEqual(['Empresa Teste']);
    } finally { fechar(); }
  });

  it('com aquecer=1, lê o arquivo e devolve o catálogo', async () => {
    criarEmpresaDeTeste('Empresa Teste');
    criarCliente('c1', 'Empresa Teste');
    const { vincular } = require('../alvos/mapa.cjs');
    vincular('Empresa Teste', 'loja_teste', 'c1');
    const { url, fechar } = await subirAppDeTeste();
    try {
      const body = await (await fetch(`${url}/catalogo/c1?aquecer=1`)).json();
      expect(body.disponivel).toBe(true);
      expect(body.produtos).toEqual(['Kit Amortecedor']);
    } finally { fechar(); }
  });
});
