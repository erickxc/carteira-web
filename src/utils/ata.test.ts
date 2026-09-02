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
    const secao2 = texto.split('2. O QUE FOI TRATADO')[1].split('3. DECISÕES')[0];
    expect(secao2).toContain('Texto gerado pela IA a partir da transcrição.');
    // O resumo do monitor não entra mais aqui — ele virou o mini resumo da
    // seção 1 (antes "1. PAUTA"), então só não pode aparecer NESTA seção.
    expect(secao2).not.toContain('Conversamos sobre o estoque parado de amortecedores.');
  });

  it('seção 1 é um mini resumo (o do monitor), não a pauta', () => {
    const texto = gerarAta(evBase, {}, { oQueFoiTratado: 'Narrativa da IA.' });
    expect(texto).toContain('1. RESUMO');
    expect(texto).not.toContain('1. PAUTA');
    expect(texto).not.toContain('(sem pauta registrada)');
    const secao1 = texto.split('1. RESUMO')[1].split('2. O QUE FOI TRATADO')[0];
    expect(secao1).toContain('Conversamos sobre o estoque parado de amortecedores.');
  });

  it('sem resumo do monitor, o mini resumo usa a primeira linha da IA', () => {
    const texto = gerarAta({ ...evBase, resumo: '' }, {}, { oQueFoiTratado: 'Primeira linha.\nSegunda linha.' });
    const secao1 = texto.split('1. RESUMO')[1].split('2. O QUE FOI TRATADO')[0];
    expect(secao1).toContain('Primeira linha.');
    expect(secao1).not.toContain('Segunda linha.');
  });

  it('tarefa interna nos próximos passos leva o nome do monitor, não "[2D]"', () => {
    const texto = gerarAta(
      { ...evBase, monitores: ['Erick Cardoso'] },
      {},
      { proximosPassos: '[Negócios 2D] confirmar acesso ao Pregão' }
    );
    const secao4 = texto.split('4. PRÓXIMOS PASSOS')[1];
    // Tanto o pendente do checklist quanto a linha que a IA marcou como "2D"
    // passam a sair no nome do monitor.
    expect(secao4).toContain('[Erick Cardoso]      Falar sobre tabela de preços');
    expect(secao4).toContain('[Erick Cardoso] confirmar acesso ao Pregão');
    expect(secao4).not.toContain('[2D]');
    expect(secao4).not.toContain('[Negócios 2D]');
  });

  it('responsável de outra pessoa que a IA identificou é preservado', () => {
    const texto = gerarAta(
      { ...evBase, monitores: ['Erick Cardoso'] },
      {},
      { proximosPassos: '[Ivaldo Ítalo] subir alterações de preço' }
    );
    expect(texto).toContain('[Ivaldo Ítalo] subir alterações de preço');
  });

  it('sem monitor no evento, tarefa interna cai em "[2D]"', () => {
    const texto = gerarAta(evBase, {}, { proximosPassos: '[2D] confirmar acesso ao Pregão' });
    expect(texto.split('4. PRÓXIMOS PASSOS')[1]).toContain('[2D]');
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

  /**
   * Bug real: "[2D]" era prefixado em TODO próximo passo, inclusive quando a
   * IA já identificou o responsável de verdade na transcrição (o cliente, ou
   * um terceiro citado) — a ata atribuía à 2D tarefa que não era dela.
   */
  it('não duplica "[2D]" quando a IA já manda o responsável real na linha', () => {
    const texto = gerarAta(evBase, {}, { proximosPassos: '[Luiz Guilherme] acompanhar a Cooperativa em setembro\n[Daniel] verificar o registro de 45 bandejas' });
    expect(texto).toContain('[Luiz Guilherme] acompanhar a Cooperativa em setembro');
    expect(texto).toContain('[Daniel] verificar o registro de 45 bandejas');
    expect(texto).not.toContain('[2D]      [Luiz Guilherme]');
  });

  it('próximo passo da IA sem responsável identificado ainda cai no "[2D]" (linha sem colchete)', () => {
    const texto = gerarAta(evBase, {}, { proximosPassos: 'Enviar relatório do mês' });
    expect(texto).toContain('[2D]      Enviar relatório do mês');
  });
});

describe('gerarAta: Registro da Monitoria (produtosSituacao) vira seção própria', () => {
  it('sem registros, a seção não aparece', () => {
    const texto = gerarAta(evBase);
    expect(texto).not.toContain('REGISTRO DA MONITORIA');
  });

  it('registro com cliente + produto + tag', () => {
    const texto = gerarAta({
      ...evBase,
      produtosSituacao: [{ id: '1', cliente: 'GSM Logística', produto: 'Amortecedor', situacao: 'queda em agosto', tag: 'Alerta' }],
    });
    expect(texto).toContain('REGISTRO DA MONITORIA');
    expect(texto).toContain('— GSM Logística · Amortecedor: queda em agosto [Alerta]');
  });

  it('registro só de cliente final (sem produto) não imprime "undefined"', () => {
    const texto = gerarAta({
      ...evBase,
      produtosSituacao: [{ id: '1', cliente: 'Comac', situacao: 'encerrou operação' }],
    });
    expect(texto).toContain('— Comac: encerrou operação');
    expect(texto).not.toContain('undefined');
  });
});
