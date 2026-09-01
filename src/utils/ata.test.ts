import { describe, expect, it } from 'vitest';
import { gerarAta } from './ata';

const evBase = {
  clientName: 'Empresa Teste',
  date: '2026-08-20T13:00:00.000Z',
  time: '10:00',
  duracao: 60,
  type: 'Reunião',
  subject: 'Revisão mensal',
  checklist: [
    { id: '1', text: 'Revisar estoque parado', done: true },
    { id: '2', text: 'Falar sobre tabela de preços', done: false },
  ],
  resumo: 'Conversamos sobre o estoque parado de amortecedores.',
};

describe('gerarAta: sem seções de IA (comportamento original preservado)', () => {
  it('usa o resumo e a heurística de decisão por regex nas seções 2/3', () => {
    const texto = gerarAta({ ...evBase, resumo: 'decisão: reduzir o pedido do mês.' });
    expect(texto).toContain('2. O QUE FOI TRATADO');
    expect(texto).toContain('decisão: reduzir o pedido do mês.');
    expect(texto).toContain('— decisão: reduzir o pedido do mês.'); // seção 3, via regex
  });

  it('próximos passos vêm só dos itens de pauta não cumpridos', () => {
    const texto = gerarAta(evBase);
    expect(texto).toContain('4. PRÓXIMOS PASSOS');
    expect(texto).toContain('Falar sobre tabela de preços');
  });
});

describe('gerarAta: com seções de IA', () => {
  it('substitui "o que foi tratado" pelo texto da IA', () => {
    const texto = gerarAta(evBase, {}, { oQueFoiTratado: 'Texto gerado pela IA a partir da transcrição.' });
    expect(texto).toContain('Texto gerado pela IA a partir da transcrição.');
    expect(texto).not.toContain('Conversamos sobre o estoque parado de amortecedores.');
  });

  it('usa as decisões da IA em vez da heurística por regex', () => {
    const texto = gerarAta(evBase, {}, { decisoes: 'Reduzir pedido do próximo mês\nTrocar fornecedor X' });
    expect(texto).toContain('— Reduzir pedido do próximo mês');
    expect(texto).toContain('— Trocar fornecedor X');
  });

  it('próximos passos da IA somam aos pendentes do checklist, não substituem', () => {
    const texto = gerarAta(evBase, {}, { proximosPassos: 'Enviar planilha de giro até sexta' });
    expect(texto).toContain('Falar sobre tabela de preços'); // pendente do checklist
    expect(texto).toContain('Enviar planilha de giro até sexta'); // extra da IA
  });

  it('seção de IA vazia/whitespace cai no comportamento determinístico normal', () => {
    const texto = gerarAta({ ...evBase, resumo: 'decisão: reduzir o pedido do mês.' }, {}, { decisoes: '   ' });
    expect(texto).toContain('— decisão: reduzir o pedido do mês.');
  });

  it('checklist 100% cumprido + sem extra da IA: próximos passos fica "(a preencher)"', () => {
    const texto = gerarAta({ ...evBase, checklist: [{ id: '1', text: 'Item concluído', done: true }] }, {}, {});
    const secao = texto.slice(texto.indexOf('4. PRÓXIMOS PASSOS'));
    expect(secao).toContain('(a preencher)');
  });
});
