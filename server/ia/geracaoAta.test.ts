import { describe, expect, it } from 'vitest';
import { gerarAtaIA, montarPromptAta } from './geracaoAta.cjs';

function llmFake(resposta: unknown) {
  return { gerarJSON: async () => resposta, chat: async () => '' };
}

describe('geracaoAta: gerarAtaIA', () => {
  it('devolve as 3 seções já normalizadas (trim, string)', async () => {
    const resultado = await gerarAtaIA({
      subject: 'Revisão de estoque',
      resumo: 'Conversamos sobre o estoque parado.',
      checklist: [{ text: 'Revisar estoque parado', done: true }],
      llm: llmFake({
        oQueFoiTratado: '  Foi discutido o estoque parado de amortecedores.  ',
        decisoes: 'Reduzir pedido do próximo mês\nRevisar fornecedor X',
        proximosPassos: 'Enviar planilha de giro até sexta',
      }),
    });

    expect(resultado).toEqual({
      oQueFoiTratado: 'Foi discutido o estoque parado de amortecedores.',
      decisoes: 'Reduzir pedido do próximo mês\nRevisar fornecedor X',
      proximosPassos: 'Enviar planilha de giro até sexta',
    });
  });

  it('devolve string vazia para seção que o modelo não retornou como string', async () => {
    const resultado = await gerarAtaIA({
      subject: 'Reunião de rotina',
      llm: llmFake({ oQueFoiTratado: 'Tudo em dia.', decisoes: null, proximosPassos: undefined }),
    });
    expect(resultado.decisoes).toBe('');
    expect(resultado.proximosPassos).toBe('');
  });

  it('trunca seção absurdamente longa em vez de deixar crescer sem limite', async () => {
    const textoGigante = 'x'.repeat(10_000);
    const resultado = await gerarAtaIA({
      subject: 'Teste',
      llm: llmFake({ oQueFoiTratado: textoGigante, decisoes: '', proximosPassos: '' }),
    });
    expect(resultado.oQueFoiTratado.length).toBeLessThanOrEqual(4000);
  });
});

describe('geracaoAta: montarPromptAta', () => {
  it('inclui a transcrição e instrui a priorizá-la sobre o resumo', () => {
    const prompt = montarPromptAta({
      subject: 'Reunião mensal',
      resumo: 'Resumo curto.',
      transcricao: 'Cliente disse que vai reduzir compra de pneus.',
    });
    expect(prompt).toContain('Cliente disse que vai reduzir compra de pneus.');
    expect(prompt).toMatch(/[Pp]riorize a TRANSCRIÇÃO/);
  });

  it('sinaliza transcrição não fornecida quando ausente, sem inventar conteúdo', () => {
    const prompt = montarPromptAta({ subject: 'Reunião mensal', resumo: 'Resumo curto.' });
    expect(prompt).toContain('(não fornecida)');
  });

  it('inclui a pauta (checklist) e os produtos/situação quando presentes', () => {
    const prompt = montarPromptAta({
      subject: 'Reunião mensal',
      checklist: [{ text: 'Tratar tabela de preços', done: false }],
      produtosSituacao: [{ produto: 'Kit Amortecedor', cliente: 'Widmen', situacao: 'zerou' }],
    });
    expect(prompt).toContain('Tratar tabela de preços');
    expect(prompt).toContain('Kit Amortecedor (Widmen): zerou');
  });

  it('cai no fallback description quando não há resumo', () => {
    const prompt = montarPromptAta({ subject: 'Reunião mensal', description: 'Descrição antiga do evento.' });
    expect(prompt).toContain('Descrição antiga do evento.');
  });
});
