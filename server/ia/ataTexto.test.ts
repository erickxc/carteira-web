import { describe, expect, it } from 'vitest';
import { gerarAta } from './ataTexto.cjs';

const evBase = {
  clientName: 'Empresa Teste',
  date: '2026-08-20T13:00:00.000Z',
  time: '10:00',
  duracao: 60,
  type: 'Reunião',
  subject: 'Revisão mensal',
  checklist: [{ id: '1', text: 'Revisar estoque parado', done: true }],
  resumo: 'Conversamos sobre o estoque parado de amortecedores.',
};

/**
 * Cobertura mínima deste PORT (não um espelho completo de `src/utils/ata.test.ts`
 * — ver o comentário no topo de `ataTexto.cjs` sobre o risco de divergência):
 * trava aqui só o bug real que motivou a existência deste arquivo de teste,
 * pra não voltar despercebido numa próxima edição deste port.
 */
describe('ataTexto.cjs: seção 1 (RESUMO) não vira dump de export de transcrição', () => {
  // Caso REAL de produção (Renocar, 03/09/2026) — mesmo texto usado em
  // src/utils/ata.test.ts, encurtado aqui só o bastante pra passar do teto.
  const exportGemini = [
    'Renocar Auto Peças Ltda',
    'Qui., 04 de set. de 2026',
    '',
    'Resumo:',
    'A reunião revisou o desempenho comercial e ajustou margens de oito produtos automotivos.',
    '• Receita caiu 11% em agosto, mas cresceu 9% interanual',
    '\t',
    'Capítulos e tópicos:',
    'Desempenho comercial de agosto '.repeat(80),
    'Tarefas:',
    '* Marco: Divulgue a previsão de vendas para setembro',
  ].join('\n');

  it('extrai só o parágrafo do "Resumo:", não o export inteiro', () => {
    const texto = gerarAta({ ...evBase, resumo: exportGemini });
    expect(texto).toContain('A reunião revisou o desempenho comercial e ajustou margens de oito produtos automotivos.');
    expect(texto).not.toContain('Capítulos e tópicos:');
    expect(texto).not.toContain('Tarefas:');
  });

  it('resumo curto normal (o caso comum) continua idêntico — sem regressão', () => {
    const texto = gerarAta(evBase);
    expect(texto).toContain('Conversamos sobre o estoque parado de amortecedores.');
  });

  it('texto grande sem o formato reconhecido: corta e avisa onde ver o resto', () => {
    const texto = gerarAta({ ...evBase, resumo: 'Frase longa sem seções. '.repeat(50) });
    const secao1 = texto.split('1. RESUMO')[1].split('2. O QUE FOI TRATADO')[0];
    expect(secao1.length).toBeLessThan(700);
    expect(secao1).toContain('resumo completo no campo Resumo do evento');
  });
});
