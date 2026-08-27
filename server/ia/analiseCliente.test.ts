import { describe, expect, it } from 'vitest';
import { gerarAnaliseIA } from './analiseCliente.cjs';

const cliente = { id: 'c1', empresa: 'Empresa Teste' };

function ollamaFake(resposta: unknown) {
  return { gerarJSON: async () => resposta, chat: async () => '' };
}

describe('analiseCliente: gerarAnaliseIA', () => {
  it('devolve os campos da resposta do modelo, já normalizados', async () => {
    const resultado = await gerarAnaliseIA({
      cliente,
      eventosNovos: [{ date: '2026-08-01', status: 'Concluído', ata: 'Cliente satisfeito.' }],
      dossieAnterior: '',
      ollama: ollamaFake({
        nivelRisco: 'medio',
        resumo: 'Cliente estável, com um ponto de atenção.',
        fatores: ['Atraso no envio de dados'],
        sugestaoProximaPauta: 'Revisar prazos de envio.',
        dossieAtualizado: 'Dossiê atualizado.',
      }),
    });

    expect(resultado).toEqual({
      nivelRisco: 'medio',
      resumo: 'Cliente estável, com um ponto de atenção.',
      fatores: ['Atraso no envio de dados'],
      sugestaoProximaPauta: 'Revisar prazos de envio.',
      dossieAtualizado: 'Dossiê atualizado.',
    });
  });

  it('cai para "baixo" quando o modelo devolve um nível de risco fora do enum esperado', async () => {
    const resultado = await gerarAnaliseIA({
      cliente,
      eventosNovos: [],
      dossieAnterior: '',
      ollama: ollamaFake({ nivelRisco: 'crítico', resumo: '', fatores: [], sugestaoProximaPauta: '' }),
    });
    expect(resultado.nivelRisco).toBe('baixo');
  });

  it('mantém o dossiê anterior quando o modelo não devolve um dossieAtualizado válido', async () => {
    const resultado = await gerarAnaliseIA({
      cliente,
      eventosNovos: [],
      dossieAnterior: 'Dossiê anterior mantido.',
      ollama: ollamaFake({ nivelRisco: 'baixo', resumo: '', fatores: [], sugestaoProximaPauta: '' }),
    });
    expect(resultado.dossieAtualizado).toBe('Dossiê anterior mantido.');
  });
});
