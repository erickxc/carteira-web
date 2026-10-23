import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// O popup é uma página servida pelo backend desta máquina e aberta numa janela própria.
let servidor: Server;
let base = '';
let popups: { registrar: (p: unknown) => string; obter: (id: string) => Record<string, unknown> | undefined };

beforeAll(async () => {
  popups = require('./popup.cjs');
  const { criarRouterReuniao } = require('../routes/reuniao.cjs');
  const app = express();
  app.use(express.json());
  app.use('/api/reuniao', criarRouterReuniao({ repo: { get: () => [] }, limparAoIniciar: false }));
  await new Promise<void>((ok) => { servidor = app.listen(0, '127.0.0.1', () => ok()); });
  base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}/api/reuniao`;
});
afterAll(() => servidor?.close());

const exemplo = { tipo: 'venda', cliente: 'Pecita - Campo Grande', titulo: 'Bateria: a alta de margem passou do ponto',
  numeros: [{ valor: 'R$ 12,3 mil', rotulo: 'lucro em set', neg: true }], grafico: { tipo: 'venda', meses: [] },
  acao: { icone: 'ligar', titulo: 'Ligue para Roberto', sub: '3º maior cliente' } };

describe('popup servido pelo backend', () => {
  it('registra e devolve os dados pelo id', async () => {
    const id = popups.registrar(exemplo);
    expect(id).toMatch(/^[a-f0-9]{8}$/);
    const r = await fetch(`${base}/popup/${id}/dados`);
    expect(await r.json()).toMatchObject({ id, titulo: exemplo.titulo, feito: false });
  });

  it('a página carrega o desenho e os dados daquele popup', async () => {
    const id = popups.registrar(exemplo);
    const html = await (await fetch(`${base}/popup/${id}`)).text();
    expect(html).toContain('/api/reuniao/popup-render.js');
    expect(html).toContain(`/api/reuniao/popup/${id}/dados`);
    const js = await fetch(`${base}/popup-render.js`);
    expect(js.headers.get('content-type')).toMatch(/javascript/);
    expect(await js.text()).toContain('renderPopup');
  });

  it('"Feito" marca o popup', async () => {
    const id = popups.registrar(exemplo);
    expect((await fetch(`${base}/popup/${id}/feito`, { method: 'POST' })).status).toBe(200);
    expect(popups.obter(id)?.feito).toBe(true);
  });

  it('id desconhecido é 404', async () => {
    expect((await fetch(`${base}/popup/ffffffff/dados`)).status).toBe(404);
  });
});

describe('fila de popups: um por vez', () => {
  it('abre o primeiro e só abre o próximo quando o anterior fecha', async () => {
    const { EventEmitter } = await import('events');
    const janelas: InstanceType<typeof EventEmitter>[] = [];
    const abertos: string[] = [];
    const spawnar = (_cmd: string, args: string[]) => {
      abertos.push(args[args.indexOf('-Url') + 1].split('/').pop() as string);
      const j = Object.assign(new EventEmitter(), { unref() {} });
      janelas.push(j);
      return j;
    };
    const ids = ['a', 'b', 'c'].map((t) => popups.registrar({ ...exemplo, titulo: t }));
    (popups as unknown as { abrirFila: (ids: string[], o: object) => void }).abrirFila(ids, { spawnar, temWebView2: () => true });
    expect(abertos).toEqual([ids[0]]);
    janelas[0].emit('exit', 0);
    expect(abertos).toEqual([ids[0], ids[1]]);
    janelas[1].emit('exit', 0);
    janelas[2].emit('exit', 0);
    expect(abertos).toEqual(ids);
  });
});
