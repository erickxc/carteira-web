import http from 'node:http';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Testa o servidor MCP como o Claude Code CLI o usa: processo separado,
 * JSON-RPC por linha no stdio, e um backend HTTP de mentira no lugar do
 * `/api/ia/interno/*`. Sem isso, um erro de protocolo (`initialize` mal
 * formado, notificação respondida indevidamente) só apareceria como "o CLI
 * não vê ferramenta nenhuma" em produção, sem pista de causa.
 */

const SEGREDO = 'segredo-de-teste';

let servidor: http.Server;
let porta: number;
let proc: ChildProcessWithoutNullStreams;
let chamadas: { rota: string; corpo: unknown; segredo?: string }[];

beforeEach(async () => {
  chamadas = [];
  servidor = http.createServer((req, res) => {
    let corpo = '';
    req.on('data', (d) => { corpo += d; });
    req.on('end', () => {
      chamadas.push({
        rota: req.url ?? '',
        corpo: corpo ? JSON.parse(corpo) : null,
        segredo: req.headers['x-carteira-ia-segredo'] as string,
      });
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/ia/interno/ferramentas') {
        res.end(JSON.stringify({
          ferramentas: [{
            name: 'buscar_clientes',
            description: 'Busca clientes na carteira.',
            parameters: { type: 'object', properties: { grupo: { type: 'string' } } },
          }],
        }));
      } else if (req.url === '/api/ia/interno/ferramenta') {
        const { nome } = JSON.parse(corpo);
        if (nome === 'explode') {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'falhou de propósito' }));
        } else {
          res.end(JSON.stringify({ resultado: { total: 2, clientes: ['Loja A', 'Loja B'] } }));
        }
      } else {
        res.statusCode = 404;
        res.end('{}');
      }
    });
  });
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
  porta = (servidor.address() as { port: number }).port;

  proc = spawn(process.execPath, [path.join(__dirname, 'mcpServidor.cjs')], {
    env: {
      ...process.env,
      CARTEIRA_IA_URL: `http://127.0.0.1:${porta}`,
      CARTEIRA_IA_SEGREDO: SEGREDO,
      CARTEIRA_IA_ORIGEM: 'teste',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  }) as ChildProcessWithoutNullStreams;
});

afterEach(async () => {
  proc.kill();
  await new Promise<void>((r) => servidor.close(() => r()));
});

/** Manda uma mensagem JSON-RPC e espera a resposta com o mesmo `id`. */
function chamar(msg: Record<string, unknown>, timeoutMs = 5000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const prazo = setTimeout(() => reject(new Error('sem resposta do servidor MCP')), timeoutMs);
    const aoReceber = (d: Buffer) => {
      buffer += d.toString();
      const linhas = buffer.split('\n');
      buffer = linhas.pop() ?? '';
      for (const linha of linhas) {
        if (!linha.trim()) continue;
        const resp = JSON.parse(linha);
        if (resp.id === msg.id) {
          clearTimeout(prazo);
          proc.stdout.off('data', aoReceber);
          resolve(resp);
        }
      }
    };
    proc.stdout.on('data', aoReceber);
    proc.stdin.write(`${JSON.stringify(msg)}\n`);
  });
}

describe('servidor MCP das ferramentas da carteira', () => {
  it('faz o handshake ecoando a versão de protocolo pedida pelo cliente', async () => {
    const resp = await chamar({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } });
    expect(resp.result).toMatchObject({
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
    });
  });

  it('lista as ferramentas do backend no formato MCP (inputSchema)', async () => {
    const resp = await chamar({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const { tools } = resp.result as { tools: { name: string; inputSchema: unknown }[] };
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('buscar_clientes');
    expect(tools[0].inputSchema).toEqual({ type: 'object', properties: { grupo: { type: 'string' } } });
    expect(chamalistagem().segredo).toBe(SEGREDO);
  });

  const chamalistagem = () => chamadas.find((c) => c.rota === '/api/ia/interno/ferramentas')!;

  it('executa a ferramenta pelo backend e devolve o resultado como texto', async () => {
    const resp = await chamar({
      jsonrpc: '2.0', id: 3, method: 'tools/call',
      params: { name: 'buscar_clientes', arguments: { grupo: 'Rede X' } },
    });
    const { content, isError } = resp.result as { content: { text: string }[]; isError?: boolean };
    expect(isError).toBeUndefined();
    expect(JSON.parse(content[0].text)).toEqual({ total: 2, clientes: ['Loja A', 'Loja B'] });

    const chamada = chamadas.find((c) => c.rota === '/api/ia/interno/ferramenta')!;
    expect(chamada.corpo).toEqual({ nome: 'buscar_clientes', argumentos: { grupo: 'Rede X' }, origem: 'teste', turnId: '', monitor: '' });
    expect(chamada.segredo).toBe(SEGREDO);
  });

  it('falha de ferramenta volta como isError, não como erro de JSON-RPC', async () => {
    // Importa porque o CLI trata os dois de formas diferentes: `isError` vira
    // resultado de ferramenta pro modelo (que pode se recuperar), erro de
    // JSON-RPC derruba a sessão MCP inteira.
    const resp = await chamar({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'explode', arguments: {} } });
    const { content, isError } = resp.result as { content: { text: string }[]; isError?: boolean };
    expect(resp.error).toBeUndefined();
    expect(isError).toBe(true);
    expect(content[0].text).toMatch(/explode/);
  });

  it('não responde notificação (mensagem sem id) e segue vivo', async () => {
    proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    const resp = await chamar({ jsonrpc: '2.0', id: 5, method: 'ping' });
    expect(resp.result).toEqual({});
  });

  it('responde erro padrão pra método desconhecido', async () => {
    const resp = await chamar({ jsonrpc: '2.0', id: 6, method: 'sampling/createMessage' });
    expect((resp.error as { code: number }).code).toBe(-32601);
  });

  it('devolve lista vazia pra resources/prompts em vez de derrubar o cliente', async () => {
    expect((await chamar({ jsonrpc: '2.0', id: 7, method: 'resources/list' })).result).toEqual({ resources: [] });
    expect((await chamar({ jsonrpc: '2.0', id: 8, method: 'prompts/list' })).result).toEqual({ prompts: [] });
  });
});
