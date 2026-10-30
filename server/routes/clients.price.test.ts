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

  it('rota antiga do Price lê login/senha do produto 2D Price', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      const criado = await (await fetch(url, { method: 'POST', ...jsonBody({
        empresa: 'Cliente P', produtos: [{ produto: '2D Price', fase: 'Ativo', faseDesde: '2026-10-30', motivoFase: 'm', login: 'L', senha: 'segP' }],
      }) })).json();
      const revelado = await (await fetch(`${url}/${criado.id}/price-credenciais/revelar`, { method: 'POST' })).json();
      expect(revelado).toEqual({ loginPrice: 'L', senhaPrice: 'segP' });
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

describe('clients: produtos (1.7)', () => {
  const produto = (nome: string, extra: Record<string, unknown> = {}) =>
    ({ produto: nome, fase: 'Ativo', faseDesde: '2026-10-30T00:00:00.000Z', motivoFase: 'cadastro', ...extra });

  it('nenhuma resposta (POST, GET, PUT, /bulk) contém senhaCifrada nem senhaPriceCifrada', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      const respostas: string[] = [];
      const resPost = await fetch(url, { method: 'POST', ...jsonBody({
        empresa: 'Cliente S',
        produtos: [produto('2D Price', { login: 'cnpj', senha: 'segredoPrice' }), produto('Apura', { login: 'u', senha: 'segredoApura' })],
      }) });
      const textoPost = await resPost.text();
      respostas.push(textoPost);
      const criado = JSON.parse(textoPost);
      const apura = criado.produtos.find((p: { produto: string }) => p.produto === 'Apura');
      expect(apura.temSenha).toBe(true);
      expect(criado.temSenhaPrice).toBe(true);

      respostas.push(await (await fetch(url)).text());
      respostas.push(await (await fetch(`${url}/${criado.id}`, { method: 'PUT', ...jsonBody({ observacao: 'x' }) })).text());
      respostas.push(await (await fetch(`${url}/bulk`, { method: 'POST', ...jsonBody([
        { id: 'b1', empresa: 'Bulk', produtos: [produto('2D Price', { senha: 'segredoBulk' })] },
      ]) })).text());

      for (const r of respostas) {
        expect(r).not.toContain('senhaCifrada');
        expect(r).not.toContain('senhaPriceCifrada');
        expect(r).not.toContain('segredo');
      }
      // A senha foi gravada cifrada, não perdida.
      const bruto = require('../dbSqlite.cjs').getSheetData('Clientes');
      const doBulk = bruto.find((c: { id: string }) => c.id === 'b1');
      expect(doBulk.produtos[0].senhaCifrada).toBeTruthy();
      expect(doBulk.produtos[0].senha).toBeUndefined();
    } finally {
      fechar();
    }
  });

  it('revelar credenciais de um produto devolve a senha decifrada; produto sem senha → 404', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      const criado = await (await fetch(url, { method: 'POST', ...jsonBody({
        empresa: 'Cliente R', produtos: [produto('Apura', { login: 'u@a', senha: 'senhaApura' }), produto('Plataforma 2D')],
      }) })).json();
      const ok = await fetch(`${url}/${criado.id}/produtos/${encodeURIComponent('Apura')}/credenciais/revelar`, { method: 'POST' });
      expect(ok.status).toBe(200);
      expect(await ok.json()).toEqual({ login: 'u@a', senha: 'senhaApura' });

      const sem = await fetch(`${url}/${criado.id}/produtos/${encodeURIComponent('Plataforma 2D')}/credenciais/revelar`, { method: 'POST' });
      expect(sem.status).toBe(404);
    } finally {
      fechar();
    }
  });

  it('PUT mudando fase sem motivo → 400 com a mensagem; trocar senha não apaga as outras', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      const criado = await (await fetch(url, { method: 'POST', ...jsonBody({
        empresa: 'Cliente F', produtos: [produto('Apura', { senha: 'a1' }), produto('2D Price', { senha: 'p1' })],
      }) })).json();
      const semMotivo = await fetch(`${url}/${criado.id}`, { method: 'PUT', ...jsonBody({
        produtos: [produto('Apura', { fase: 'Suspenso' }), produto('2D Price')],
      }) });
      expect(semMotivo.status).toBe(400);
      expect((await semMotivo.json()).error).toBe('Informe o motivo da mudança de fase.');

      // Tela manda os produtos como recebeu (sem senhaCifrada, com temSenha) e uma senha nova só no Apura.
      const lista = criado.produtos.map((p: { produto: string }) => (p.produto === 'Apura' ? { ...p, senha: 'a2' } : p));
      const ok = await fetch(`${url}/${criado.id}`, { method: 'PUT', ...jsonBody({ produtos: lista }) });
      expect(ok.status).toBe(200);
      const revelar = async (nome: string) =>
        (await (await fetch(`${url}/${criado.id}/produtos/${encodeURIComponent(nome)}/credenciais/revelar`, { method: 'POST' })).json()).senha;
      expect(await revelar('Apura')).toBe('a2');
      expect(await revelar('2D Price')).toBe('p1');
    } finally {
      fechar();
    }
  });

  it('cliente sem produtos (pré-migração): GET monta do legado e o banco segue sem a coluna', async () => {
    const { url, fechar } = await subirAppDeTeste();
    try {
      const criado = await (await fetch(url, { method: 'POST', ...jsonBody({
        empresa: 'Legado', servicos: ['Monitoria', 'Precificação'], servicosIndependentes: ['Monitoria'],
        linksServicos: { Monitoria: 'http://bi' }, loginPrice: 'lp', senhaPrice: 'sp',
      }) })).json();
      const lista = await (await fetch(url)).json();
      const c = lista.find((x: { id: string }) => x.id === criado.id);
      expect(c.produtos).toEqual([
        expect.objectContaining({ produto: 'Plataforma 2D', fase: 'Ativo', independente: true, link: 'http://bi', temSenha: false }),
        expect.objectContaining({ produto: '2D Price', fase: 'Ativo', login: 'lp', temSenha: true }),
      ]);
      await fetch(`${url}/${criado.id}`, { method: 'PUT', ...jsonBody({ observacao: 'outra coisa' }) });
      const bruto = require('../dbSqlite.cjs').getSheetData('Clientes').find((x: { id: string }) => x.id === criado.id);
      expect(bruto.produtos == null || bruto.produtos === '').toBe(true);
      expect(bruto.servicos).toEqual(['Monitoria', 'Precificação']);
    } finally {
      fechar();
    }
  });
});
