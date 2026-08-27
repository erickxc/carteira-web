import { describe, expect, it } from 'vitest';
import { repoMemoria } from '../dominio/repo.cjs';
import { conversar } from './orquestrador.cjs';

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
