import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// A captura acontece na máquina onde o backend roda: pelo Apache (outra
// máquina na LAN) gravaria o áudio errado. Requisição com X-Forwarded-For = 403.
let servidor: Server;
let base = '';

beforeAll(async () => {
  const { criarRouterReuniao } = require('./reuniao.cjs');
  const app = express();
  app.use(express.json());
  app.use('/api/reuniao', criarRouterReuniao({ repo: { get: () => [] }, limparAoIniciar: false }));
  await new Promise<void>((ok) => { servidor = app.listen(0, '127.0.0.1', () => ok()); });
  const porta = (servidor.address() as { port: number }).port;
  base = `http://127.0.0.1:${porta}/api/reuniao`;
});
afterAll(() => servidor?.close());

describe('rotas da reunião', () => {
  it('recusa requisição vinda do Apache', async () => {
    const r = await fetch(`${base}/estado`, { headers: { 'x-forwarded-for': '192.168.0.10' } });
    expect(r.status).toBe(403);
  });

  it('estado sem sessão', async () => {
    expect(await (await fetch(`${base}/estado`)).json()).toEqual({ ativa: false, fase: null });
  });

  it('iniciar sem eventId é 400 (sem arquivo de simulação é captura ao vivo, não erro)', async () => {
    const r = await fetch(`${base}/iniciar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    expect(r.status).toBe(400);
  });

  it('evento inexistente é 404', async () => {
    const r = await fetch(`${base}/iniciar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: 'nao', simularArquivo: 'a.mp4' }) });
    expect(r.status).toBe(404);
  });

  it('encerrar sem sessão é 409', async () => {
    expect((await fetch(`${base}/encerrar`, { method: 'POST' })).status).toBe(409);
  });
});
