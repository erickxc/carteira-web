import { describe, expect, it } from 'vitest';
import { registrarUso } from './uso.cjs';
import { conversar, registrarAcao } from './orquestrador.cjs';
import { repoMemoria } from '../dominio/repo.cjs';

/**
 * Consumo de IA por pergunta. Não existe "quanto falta pra resetar a cota da
 * assinatura" (só aparece no site da Anthropic, atrelado à sessão do
 * navegador — confirmado inspecionando o log de debug do CLI, sem nenhum
 * cabeçalho de rate-limit nas chamadas dele). O que fica aqui é tokens/custo
 * REAIS de cada resposta, nos dois provedores.
 */
describe('registrarUso', () => {
  it('grava uma linha com os campos numéricos e o turnId', () => {
    const repo = repoMemoria({ UsoIA: [] });
    const linha = registrarUso(repo, {
      origem: 'chat', provedor: 'claude-cli', modelo: 'claude-opus-5', turnId: 't1',
      inputTokens: 10, outputTokens: 20, cacheCreationTokens: 5, cacheReadTokens: 0,
      custoUsd: 0.05, duracaoMs: 1200, numFerramentas: 2,
    });
    expect(repo.get('UsoIA')).toEqual([linha]);
    expect(linha.turnId).toBe('t1');
    expect(linha.custoUsd).toBe(0.05);
  });

  it('erro:true fica registrado (turno que falhou também conta como consumo)', () => {
    const repo = repoMemoria({ UsoIA: [] });
    registrarUso(repo, { origem: 'chat', provedor: 'ollama', turnId: 't2', duracaoMs: 300, erro: true });
    expect(repo.get('UsoIA')[0].erro).toBe(true);
  });
});

describe('orquestrador (ollama): uso e turnId por pergunta', () => {
  function ollamaComRespostas(respostas: unknown[]) {
    let i = 0;
    return {
      gerarJSON: async () => ({}),
      // Simula o Ollama de verdade preenchendo `coletarUso`, exatamente como
      // `ollamaClient.chat()` faz a partir de `prompt_eval_count`/`eval_count`.
      chat: async (_h: unknown, opts: { coletarUso?: Record<string, unknown> }) => {
        if (opts?.coletarUso) {
          opts.coletarUso.modelo = 'llama3.1:8b';
          opts.coletarUso.inputTokens = ((opts.coletarUso.inputTokens as number) || 0) + 11;
          opts.coletarUso.outputTokens = ((opts.coletarUso.outputTokens as number) || 0) + 7;
        }
        return respostas[i++];
      },
    };
  }

  it('resposta direta (sem ferramenta) grava um UsoIA com 0 ferramentas', async () => {
    const repo = repoMemoria({ Clientes: [], AnalisesIA: [], AcoesIA: [], UsoIA: [] });
    await conversar({
      mensagens: [{ role: 'user', content: 'oi' }],
      repo,
      ollama: ollamaComRespostas([{ role: 'assistant', content: 'Olá!' }]),
    });
    const [uso] = repo.get('UsoIA');
    expect(uso).toMatchObject({ provedor: 'ollama', modelo: 'llama3.1:8b', inputTokens: 11, outputTokens: 7, numFerramentas: 0, custoUsd: 0 });
    expect(uso.erro).toBe(false);
  });

  it('soma tokens das DUAS chamadas ao modelo quando há uma ferramenta no meio', async () => {
    const repo = repoMemoria({
      Clientes: [{ id: 'c1', empresa: 'Loja', status: 'Regular', servicos: [] }],
      AnalisesIA: [], AcoesIA: [], UsoIA: [],
    });
    await conversar({
      mensagens: [{ role: 'user', content: 'quem está em risco?' }],
      repo,
      ollama: ollamaComRespostas([
        { role: 'assistant', content: '', tool_calls: [{ function: { name: 'buscar_clientes', arguments: {} } }] },
        { role: 'assistant', content: 'Ninguém em risco alto.' },
      ]),
    });
    const [uso] = repo.get('UsoIA');
    // 2 chamadas ao "modelo" (1ª pediu ferramenta, 2ª respondeu) — 11+11 e 7+7.
    expect(uso.inputTokens).toBe(22);
    expect(uso.outputTokens).toBe(14);
    expect(uso.numFerramentas).toBe(1);
  });

  it('a chamada de ferramenta em AcoesIA carrega o MESMO turnId do UsoIA — é o que permite juntar os dois', async () => {
    const repo = repoMemoria({
      Clientes: [{ id: 'c1', empresa: 'Loja', status: 'Regular', servicos: [] }],
      AnalisesIA: [], AcoesIA: [], UsoIA: [],
    });
    await conversar({
      mensagens: [{ role: 'user', content: 'busca clientes' }],
      repo,
      ollama: ollamaComRespostas([
        { role: 'assistant', content: '', tool_calls: [{ function: { name: 'buscar_clientes', arguments: {} } }] },
        { role: 'assistant', content: 'Pronto.' },
      ]),
    });
    const [uso] = repo.get('UsoIA');
    const [acao] = repo.get('AcoesIA');
    expect(acao.turnId).toBe(uso.turnId);
    expect(uso.turnId).toBeTruthy();
  });

  it('excedeu o limite de iterações: grava UsoIA com erro:true antes de lançar', async () => {
    const repo = repoMemoria({ Clientes: [], AnalisesIA: [], AcoesIA: [], UsoIA: [] });
    const semParar = { function: { name: 'buscar_clientes', arguments: {} } };
    await expect(conversar({
      mensagens: [{ role: 'user', content: 'loop' }],
      repo,
      ollama: ollamaComRespostas(Array(10).fill({ role: 'assistant', content: '', tool_calls: [semParar] })),
    })).rejects.toThrow(/excedeu o limite/);
    const [uso] = repo.get('UsoIA');
    expect(uso.erro).toBe(true);
  });

  it('turnos diferentes (perguntas diferentes) não compartilham turnId', async () => {
    const repo = repoMemoria({ Clientes: [], AnalisesIA: [], AcoesIA: [], UsoIA: [] });
    const ollama = ollamaComRespostas([{ role: 'assistant', content: 'a' }, { role: 'assistant', content: 'b' }]);
    await conversar({ mensagens: [{ role: 'user', content: '1' }], repo, ollama });
    await conversar({ mensagens: [{ role: 'user', content: '2' }], repo, ollama });
    const [u1, u2] = repo.get('UsoIA');
    expect(u1.turnId).not.toBe(u2.turnId);
  });
});

describe('registrarAcao propaga turnId (usado pelos dois provedores)', () => {
  it('grava turnId quando informado, vazio quando não', () => {
    const repo = repoMemoria({ AcoesIA: [] });
    registrarAcao(repo, { ferramenta: 'buscar_clientes', argumentos: {}, resultado: [], origem: 'chat', turnId: 'abc' });
    registrarAcao(repo, { ferramenta: 'buscar_clientes', argumentos: {}, resultado: [], origem: 'chat' });
    const [comTurno, semTurno] = repo.get('AcoesIA');
    expect(comTurno.turnId).toBe('abc');
    expect(semTurno.turnId).toBe('');
  });
});
