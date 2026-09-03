import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

let oneDriveDir: string;
let sqliteDir: string;

const MODULOS = [
  '../config.cjs', '../crypto.cjs', '../modo.cjs', '../machine.cjs', '../dominio/repo.cjs', '../dominio/clientes.cjs',
  '../dbSqlite.cjs', '../db.cjs', '../fila/caminhos.cjs', '../fila/pendentes.cjs', '../fila/escrever.cjs',
  '../fila/entidades.cjs', '../fila/mutacao.cjs', './clients.cjs',
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
  oneDriveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-clients-price-od-'));
  sqliteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-clients-price-sq-'));
  process.env.ONEDRIVE_ROOT = oneDriveDir;
  process.env.SQLITE_DIR = sqliteDir;
  process.env.PRICE_CREDENCIAIS_CHAVE = 'chave-de-teste-para-price';
  limparCaches();
});

afterEach(() => {
  fecharConexaoSqlite();
  delete process.env.ONEDRIVE_ROOT;
  delete process.env.SQLITE_DIR;
  delete process.env.PRICE_CREDENCIAIS_CHAVE;
  delete process.env.APP_MODE;
  limparCaches();
  fs.rmSync(oneDriveDir, { recursive: true, force: true });
  fs.rmSync(sqliteDir, { recursive: true, force: true });
});

async function subirAppDeTeste() {
  const router = require('./clients.cjs');
  const app = express();
  app.use(express.json());
  app.use('/api/clients', router);
  return new Promise<{ url: string; fechar: () => void }>((resolve) => {
    const servidor = app.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address() as { port: number };
      resolve({ url: `http://127.0.0.1:${port}/api/clients`, fechar: () => servidor.close() });
    });
  });
}

/** JSON helper com Content-Type, pra não repetir em toda chamada. */
const jsonBody = (body: unknown) => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('clients: login/senha do Price', () => {
  it('POST com senhaPrice: nunca devolve senhaPriceCifrada, só temSenhaPrice', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      const res = await fetch(url, { method: 'POST', ...jsonBody({ empresa: 'Cliente X', loginPrice: 'user@x.com', senhaPrice: 'segredo123' }) });
      const criado = await res.json();
      expect(criado.senhaPriceCifrada).toBeUndefined();
      expect(criado.senhaPrice).toBeUndefined();
      expect(criado.temSenhaPrice).toBe(true);
      expect(criado.loginPrice).toBe('user@x.com');
    } finally {
      fechar();
    }
  });

  it('GET / nunca inclui senhaPriceCifrada em nenhum cliente', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      await fetch(url, { method: 'POST', ...jsonBody({ empresa: 'Cliente Y', senhaPrice: 'outraSenha' }) });
      const lista = await (await fetch(url)).json();
      expect(lista.some((c: Record<string, unknown>) => 'senhaPriceCifrada' in c)).toBe(false);
      expect(lista.find((c: { empresa: string }) => c.empresa === 'Cliente Y').temSenhaPrice).toBe(true);
    } finally {
      fechar();
    }
  });

  it('editar outro campo do cadastro NÃO apaga a senha do Price já salva', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      const criado = await (await fetch(url, { method: 'POST', ...jsonBody({ empresa: 'Cliente Z', senhaPrice: 'senhaOriginal' }) })).json();
      const editado = await (await fetch(`${url}/${criado.id}`, { method: 'PUT', ...jsonBody({ empresa: 'Cliente Z', observacao: 'nota qualquer' }) })).json();
      expect(editado.temSenhaPrice).toBe(true);

      const revelado = await (await fetch(`${url}/${criado.id}/price-credenciais/revelar`, { method: 'POST' })).json();
      expect(revelado.senhaPrice).toBe('senhaOriginal');
    } finally {
      fechar();
    }
  });

  it('senhaPrice: null apaga a senha de propósito', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      const criado = await (await fetch(url, { method: 'POST', ...jsonBody({ empresa: 'Cliente W', senhaPrice: 'vaiSumir' }) })).json();
      const editado = await (await fetch(`${url}/${criado.id}`, { method: 'PUT', ...jsonBody({ empresa: 'Cliente W', senhaPrice: null }) })).json();
      expect(editado.temSenhaPrice).toBe(false);
    } finally {
      fechar();
    }
  });

  it('revelar devolve o texto puro correto (round-trip cifrar/decifrar de verdade)', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      const criado = await (await fetch(url, { method: 'POST', ...jsonBody({ empresa: 'Cliente Rev', loginPrice: 'login@rev.com', senhaPrice: 'S3nh@Forte!' }) })).json();
      const res = await fetch(`${url}/${criado.id}/price-credenciais/revelar`, { method: 'POST' });
      expect(res.status).toBe(200);
      const revelado = await res.json();
      expect(revelado).toEqual({ loginPrice: 'login@rev.com', senhaPrice: 'S3nh@Forte!' });
    } finally {
      fechar();
    }
  });

  it('revelar em cliente sem senha do Price devolve 404, não string vazia', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      const criado = await (await fetch(url, { method: 'POST', ...jsonBody({ empresa: 'Sem Price' }) })).json();
      const res = await fetch(`${url}/${criado.id}/price-credenciais/revelar`, { method: 'POST' });
      expect(res.status).toBe(404);
    } finally {
      fechar();
    }
  });

  it('APP_MODE=client: revelar credencial recém-cadastrada (ainda só na fila, não aplicada) funciona', async () => {
    // Bug real encontrado antes de liberar a feature Price pra máquinas
    // cliente: /revelar lia repo.get('Clientes') SEM aplicarOverlay (ao
    // contrário do GET /), então uma senha cadastrada agora — que em modo
    // cliente fica só na fila até o controller da máquina servidora aplicar
    // — não aparecia, e a rota respondia 404 mesmo tendo acabado de salvar.
    process.env.APP_MODE = 'client';
    limparCaches();
    const { url, fechar } = await subirAppDeTeste();
    try {
      const criado = await (await fetch(url, { method: 'POST', ...jsonBody({ empresa: 'Cliente Fila', loginPrice: 'login@fila.com', senhaPrice: 'senhaNaFila' }) })).json();
      expect(criado.temSenhaPrice).toBe(true);

      const res = await fetch(`${url}/${criado.id}/price-credenciais/revelar`, { method: 'POST' });
      expect(res.status).toBe(200);
      const revelado = await res.json();
      expect(revelado).toEqual({ loginPrice: 'login@fila.com', senhaPrice: 'senhaNaFila' });
    } finally {
      fechar();
    }
  });

  it('revelar em cliente inexistente devolve 404', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      const res = await fetch(`${url}/id-que-nao-existe/price-credenciais/revelar`, { method: 'POST' });
      expect(res.status).toBe(404);
    } finally {
      fechar();
    }
  });
});
