import { createRequire } from 'module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require2 = createRequire(import.meta.url);

/**
 * A cota da assinatura (janela 5h / limite 7d) NÃO é exposta pelo Claude Code
 * CLI — confirmado inspecionando `~/.claude/debug/<sessão>.txt` de uma
 * chamada real (`claude -p ... --debug`): nenhuma linha carrega essa
 * informação, o CLI só lê os headers da resposta pra decidir fast-mode e
 * descarta. Mas os headers EXISTEM na API de verdade — confirmado batendo
 * direto em `POST /v1/messages` com a mesma credencial OAuth do CLI:
 * `anthropic-ratelimit-unified-5h-utilization`, `-status`, `-reset`, e o
 * mesmo pra `7d`. Este módulo faz essa chamada mínima só pra ler os headers.
 *
 * Testes aqui usam `fetch` mockado — a chamada real já foi verificada
 * manualmente; não vale pagar por ela em CADA execução da suíte.
 */
let tmpDir: string;
let limiteConta: typeof import('./limiteConta.cjs');
let estado: typeof import('./estado.cjs');
const fetchOriginal = global.fetch;

function recarregar() {
  for (const m of ['../../config.cjs', './estado.cjs', './limiteConta.cjs']) {
    try { delete require2.cache[require2.resolve(m)]; } catch { /* não carregado */ }
  }
  estado = require2('./estado.cjs');
  limiteConta = require2('./limiteConta.cjs');
}

function respostaHeaders(pares: Record<string, string>) {
  return { get: (nome: string) => pares[nome] ?? null } as unknown as Headers;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carteira-limite-test-'));
  process.env.SQLITE_DIR = tmpDir;
  recarregar();
});

afterEach(() => {
  delete process.env.SQLITE_DIR;
  global.fetch = fetchOriginal;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('extrairJanela: parsing dos headers de rate-limit', () => {
  it('lê utilização, status e converte o reset unix pra ISO', () => {
    const headers = respostaHeaders({
      'anthropic-ratelimit-unified-5h-utilization': '0.09',
      'anthropic-ratelimit-unified-5h-status': 'allowed',
      'anthropic-ratelimit-unified-5h-reset': '1787946000',
    });
    expect(limiteConta.extrairJanela(headers, '5h')).toEqual({
      utilizacao: 0.09,
      status: 'allowed',
      resetaEm: new Date(1787946000 * 1000).toISOString(),
    });
  });

  it('devolve null quando o header de utilização não vem (endpoint sem rate-limit, ex.: count_tokens)', () => {
    expect(limiteConta.extrairJanela(respostaHeaders({}), '5h')).toBeNull();
  });

  it('não quebra sem o header de reset — utilização e status continuam válidos', () => {
    const headers = respostaHeaders({ 'anthropic-ratelimit-unified-7d-utilization': '0.99', 'anthropic-ratelimit-unified-7d-status': 'allowed_warning' });
    expect(limiteConta.extrairJanela(headers, '7d')).toEqual({ utilizacao: 0.99, status: 'allowed_warning', resetaEm: null });
  });
});

describe('consultarLimiteConta', () => {
  it('sem nenhuma credencial (nem token da GUI, nem login da máquina), não tenta rede', async () => {
    // Sem token salvo e sem arquivo real de credencial (SQLITE_DIR isolado não
    // afeta ~/.claude/.credentials.json — mockamos a leitura seria mais
    // correto, mas o teste real aqui é: se `tokenBearer()` devolve null,
    // `fetch` nunca é chamado.
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => { throw new Error('ENOENT'); });
    const chamouFetch = vi.fn();
    global.fetch = chamouFetch as unknown as typeof fetch;

    const r = await limiteConta.consultarLimiteConta({ forcar: true });
    expect(r).toEqual({ ok: false, motivo: 'sem-credencial' });
    expect(chamouFetch).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('com token salvo, monta a chamada com o bearer e o beta header de OAuth', async () => {
    estado.salvarToken('sk-ant-oat01-teste');
    limiteConta.limparCacheLimite();

    let chamadaVista: { url: string; opts: RequestInit } | null = null;
    global.fetch = (async (url: string, opts: RequestInit) => {
      chamadaVista = { url, opts };
      return {
        ok: true,
        headers: respostaHeaders({
          'anthropic-ratelimit-unified-5h-utilization': '0.5',
          'anthropic-ratelimit-unified-5h-status': 'allowed',
        }),
        text: async () => JSON.stringify({ usage: { input_tokens: 10, output_tokens: 1 } }),
      };
    }) as unknown as typeof fetch;

    const r = await limiteConta.consultarLimiteConta({ forcar: true });
    expect(r.ok).toBe(true);
    expect(r.cincoHoras).toEqual({ utilizacao: 0.5, status: 'allowed', resetaEm: null });
    expect(chamadaVista!.url).toBe('https://api.anthropic.com/v1/messages');
    const headers = chamadaVista!.opts.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-ant-oat01-teste');
    expect(headers['anthropic-beta']).toBe('oauth-2025-04-20');
  });

  it('cacheia por TTL — uma segunda chamada sem forçar não bate na rede de novo', async () => {
    estado.salvarToken('sk-ant-oat01-teste');
    limiteConta.limparCacheLimite();
    let chamadas = 0;
    global.fetch = (async () => {
      chamadas += 1;
      return { ok: true, headers: respostaHeaders({}), text: async () => '{}' };
    }) as unknown as typeof fetch;

    await limiteConta.consultarLimiteConta({});
    await limiteConta.consultarLimiteConta({});
    expect(chamadas).toBe(1);
  });

  it('API rejeitando (401/429/...) vira motivo legível, não exceção', async () => {
    estado.salvarToken('sk-ant-oat01-teste');
    limiteConta.limparCacheLimite();
    global.fetch = (async () => ({ ok: false, status: 429, headers: respostaHeaders({}), text: async () => 'rate limited' })) as unknown as typeof fetch;

    const r = await limiteConta.consultarLimiteConta({ forcar: true });
    expect(r).toMatchObject({ ok: false, motivo: 'api-429' });
  });

  it('falha de rede vira motivo "rede", não exceção não tratada', async () => {
    estado.salvarToken('sk-ant-oat01-teste');
    limiteConta.limparCacheLimite();
    global.fetch = (async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch;

    const r = await limiteConta.consultarLimiteConta({ forcar: true });
    expect(r).toMatchObject({ ok: false, motivo: 'rede' });
  });
});
