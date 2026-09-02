import { describe, expect, it } from 'vitest';
import { repoMemoria } from '../dominio/repo.cjs';
import { conversar, FERRAMENTAS_POR_NOME } from './orquestrador.cjs';

function ollamaComRespostas(respostas: unknown[]) {
  let i = 0;
  return { gerarJSON: async () => ({}), chat: async () => respostas[i++] };
}

describe('orquestrador: conversar', () => {
  it('responde direto quando o modelo não pede nenhuma ferramenta', async () => {
    const repo = repoMemoria({ Clientes: [], AnalisesIA: [], AcoesIA: [] });
    const resposta = await conversar({
      mensagens: [{ role: 'user', content: 'oi' }],
      repo,
      ollama: ollamaComRespostas([{ role: 'assistant', content: 'Olá! Como posso ajudar?' }]),
    });
    expect(resposta).toBe('Olá! Como posso ajudar?');
  });

  it('executa a ferramenta pedida, registra em AcoesIA e devolve a resposta final', async () => {
    const repo = repoMemoria({
      Clientes: [{ id: 'c1', empresa: 'Empresa Teste', status: 'Regular', servicos: [] }],
      AnalisesIA: [{ id: 'a1', clientId: 'c1', nivelRisco: 'alto', resumo: '', fatores: [], sugestaoProximaPauta: 'Revisar contrato', ultimoEventoAnalisadoData: '', geradoEm: '' }],
      AcoesIA: [],
    });

    const resposta = await conversar({
      mensagens: [{ role: 'user', content: 'quais clientes estão em risco alto?' }],
      repo,
      ollama: ollamaComRespostas([
        {
          role: 'assistant',
          content: '',
          tool_calls: [{ function: { name: 'buscar_clientes', arguments: { nivelRisco: 'alto' } } }],
        },
        { role: 'assistant', content: 'Só a Empresa Teste está em risco alto.' },
      ]),
    });

    expect(resposta).toBe('Só a Empresa Teste está em risco alto.');
    const acoes = repo._dump().AcoesIA;
    expect(acoes).toHaveLength(1);
    expect(acoes[0]).toMatchObject({ ferramenta: 'buscar_clientes', origem: 'chat' });
  });

  /**
   * Bug real: `resultado = ferramenta.executar(...)` sem `await` — pra uma
   * ferramenta ASYNC (ex.: reanalisar_cliente, redigir_ata_reuniao), isso
   * gravava a Promise em vez do valor resolvido; `JSON.stringify` numa
   * Promise devolve `{}` (sem props próprias), então o resultado REAL da
   * ferramenta nunca chegava no histórico nem em `AcoesIA`. Corrigido com
   * `await` (funciona igual pra ferramenta sync — `await` num valor não-
   * Promise só devolve o próprio valor).
   */
  it('aguarda ferramenta ASYNC e devolve o resultado real, não uma Promise serializada como {}', async () => {
    const repo = repoMemoria({ Clientes: [], AnalisesIA: [], AcoesIA: [] });
    FERRAMENTAS_POR_NOME.set('ferramenta_async_de_teste', {
      name: 'ferramenta_async_de_teste',
      executar: async () => { await new Promise((r) => setTimeout(r, 5)); return { ok: true, valor: 42 }; },
    });
    try {
      const resposta = await conversar({
        mensagens: [{ role: 'user', content: 'testa' }],
        repo,
        ollama: ollamaComRespostas([
          { role: 'assistant', content: '', tool_calls: [{ function: { name: 'ferramenta_async_de_teste', arguments: {} } }] },
          { role: 'assistant', content: 'Pronto.' },
        ]),
      });
      expect(resposta).toBe('Pronto.');
      const acoes = repo._dump().AcoesIA;
      expect(acoes[0].resultado).toEqual({ ok: true, valor: 42 });
    } finally {
      FERRAMENTAS_POR_NOME.delete('ferramenta_async_de_teste');
    }
  });

  it('lança erro ao exceder o limite de iterações de ferramenta', async () => {
    const repo = repoMemoria({ Clientes: [], AnalisesIA: [], AcoesIA: [] });
    const chamadaInfinita = { role: 'assistant', content: '', tool_calls: [{ function: { name: 'gerar_relatorio_executivo', arguments: {} } }] };

    await expect(conversar({
      mensagens: [{ role: 'user', content: 'gera o relatório' }],
      repo,
      ollama: { gerarJSON: async () => ({}), chat: async () => chamadaInfinita },
    })).rejects.toThrow(/limite de chamadas de ferramenta/);
  });
});
