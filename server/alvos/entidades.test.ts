import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const entidades: typeof import('./entidades.cjs') = require('./entidades.cjs');

/** Nomes reais do arquivo (mock e Motobras), incluindo os difíceis. */
const LISTAS = {
  produtos: ['Kit Amortecedor', 'Amortecedor Suspensão', 'Lubrificante', 'Pneu', 'Vela Ignição', 'NÃO HARMONIZADO'],
  clientes: ['EDUARDO MECANICO (CM)', 'CONSUMIDOR ITABORAI (SA)', 'MATOS & FILHAS AUTO CENTER LTDA (CQ)'],
};

describe('entidades: só o que existe no arquivo', () => {
  it('encontra produto citado na ata', () => {
    const r = entidades.extrairEntidades('Combinamos reduzir a margem do Kit Amortecedor.', LISTAS);
    expect(r).toEqual([{ nome: 'Kit Amortecedor', tipo: 'produto' }]);
  });

  it('ignora nome que não está na lista', () => {
    // "kit de amortecedores" é como a prosa escreve; o produto real é outro
    // texto. Aceitar mediria um produto inexistente e o zero resultante seria
    // lido como "não movimentou".
    expect(entidades.extrairEntidades('falamos do kit de amortecedores', LISTAS)).toEqual([]);
  });

  it('casa sem depender de acento ou caixa', () => {
    const r = entidades.extrairEntidades('subir preço da VELA IGNICAO', LISTAS);
    expect(r.map((e) => e.nome)).toEqual(['Vela Ignição']);
  });

  it('não casa nome dentro de outra palavra', () => {
    expect(entidades.extrairEntidades('mercado pneumático em alta', LISTAS)).toEqual([]);
  });

  it('prefere o nome mais longo quando os dois casam', () => {
    const r = entidades.extrairEntidades('foco no Kit Amortecedor este mês', LISTAS);
    expect(r.map((e) => e.nome)).toEqual(['Kit Amortecedor']);
  });

  it('mantém os dois quando são produtos distintos de fato', () => {
    const r = entidades.extrairEntidades('Kit Amortecedor e Amortecedor Suspensão caíram', LISTAS);
    expect(r.map((e) => e.nome).sort()).toEqual(['Amortecedor Suspensão', 'Kit Amortecedor']);
  });

  it('encontra cliente final com pontuação no nome', () => {
    const r = entidades.extrairEntidades('MATOS & FILHAS AUTO CENTER LTDA (CQ) parou de comprar', LISTAS);
    expect(r).toEqual([{ nome: 'MATOS & FILHAS AUTO CENTER LTDA (CQ)', tipo: 'cliente' }]);
  });

  it('trata NÃO HARMONIZADO como produto normal', () => {
    // Decisão do usuário: essa classe conta como produto real.
    const r = entidades.extrairEntidades('a fatia de NÃO HARMONIZADO segue alta', LISTAS);
    expect(r).toEqual([{ nome: 'NÃO HARMONIZADO', tipo: 'produto' }]);
  });

  it('texto vazio ou listas vazias não quebram', () => {
    expect(entidades.extrairEntidades('', LISTAS)).toEqual([]);
    expect(entidades.extrairEntidades('Kit Amortecedor', {})).toEqual([]);
  });

  it('ignora nome curto demais para ser identificável', () => {
    // "Kit" tem 3 caracteres e apareceria em qualquer ata que fale de kit de
    // qualquer coisa — casaria muito, identificaria nada.
    expect(entidades.extrairEntidades('vi o kit na prateleira', { produtos: ['Kit'] })).toEqual([]);
    // 4 caracteres já é aceito (é o limite): "Pneu" é nome real de produto.
    expect(entidades.extrairEntidades('o Pneu caiu', { produtos: ['Pneu'] }))
      .toEqual([{ nome: 'Pneu', tipo: 'produto' }]);
  });
});

describe('entidades: consolidação por evento', () => {
  const eventos = [
    { date: '2026-06-12', ata: 'Decidido reduzir margem do Kit Amortecedor.' },
    { date: '2026-07-10', ata: 'Reforçamos a ação no Kit Amortecedor e olhamos Lubrificante.' },
    { date: '2026-08-05', resumo: 'EDUARDO MECANICO (CM) sem compra no mês.' },
    { date: '2026-09-01', ata: '' },
  ];

  it('combinadoEm é a PRIMEIRA menção e reunioes lista todas', () => {
    const r = entidades.entidadesDosEventos(eventos, LISTAS);
    const kit = r.find((e) => e.nome === 'Kit Amortecedor');
    expect(kit?.combinadoEm).toBe('2026-06-12');
    expect(kit?.reunioes).toEqual(['2026-06-12', '2026-07-10']);
  });

  it('usa resumo quando não há ata', () => {
    const r = entidades.entidadesDosEventos(eventos, LISTAS);
    expect(r.find((e) => e.tipo === 'cliente')?.nome).toBe('EDUARDO MECANICO (CM)');
  });

  it('evento sem texto nenhum é ignorado sem erro', () => {
    expect(entidades.entidadesDosEventos([{ date: '2026-09-01' }], LISTAS)).toEqual([]);
  });

  it('ordena por data mesmo recebendo fora de ordem', () => {
    const invertido = [eventos[1], eventos[0]];
    const kit = entidades.entidadesDosEventos(invertido, LISTAS).find((e) => e.nome === 'Kit Amortecedor');
    expect(kit?.combinadoEm).toBe('2026-06-12');
  });

  it('evento sem data não entra (não há como medir movimento)', () => {
    expect(entidades.entidadesDosEventos([{ ata: 'Kit Amortecedor' }], LISTAS)).toEqual([]);
  });
});
