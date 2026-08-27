import { describe, expect, it } from 'vitest';
import { separarBlocos } from './blocosMarkdown';

/**
 * Cobre a separação em blocos — a única parte com regra de verdade (o resto é
 * montar JSX). Roda em ambiente `node`, sem DOM.
 *
 * Motivo de existir: o chat imprimia a resposta como texto puro e o usuário
 * via `**Loja X**` e linhas de asterisco. Cada caso abaixo é um formato que os
 * modelos usados aqui realmente emitem.
 */
describe('separarBlocos', () => {
  it('agrupa bullets consecutivos numa lista só', () => {
    const blocos = separarBlocos('- Loja A\n- Loja B\n- Loja C');
    expect(blocos).toEqual([{ tipo: 'lista', ordenada: false, itens: ['Loja A', 'Loja B', 'Loja C'] }]);
  });

  it('separa lista numerada de lista com bullet', () => {
    const blocos = separarBlocos('1. primeiro\n2. segundo\n- outro');
    expect(blocos).toEqual([
      { tipo: 'lista', ordenada: true, itens: ['primeiro', 'segundo'] },
      { tipo: 'lista', ordenada: false, itens: ['outro'] },
    ]);
  });

  it('reconhece título markdown', () => {
    expect(separarBlocos('### Pontos de Atenção')).toEqual([{ tipo: 'titulo', texto: 'Pontos de Atenção' }]);
  });

  it('mantém linhas da mesma ideia num parágrafo só', () => {
    expect(separarBlocos('linha um\nlinha dois')).toEqual([{ tipo: 'paragrafo', linhas: ['linha um', 'linha dois'] }]);
  });

  it('linha vazia separa parágrafos', () => {
    expect(separarBlocos('um\n\ndois')).toEqual([
      { tipo: 'paragrafo', linhas: ['um'] },
      { tipo: 'paragrafo', linhas: ['dois'] },
    ]);
  });

  it('frase que começa com *negrito* não é confundida com bullet', () => {
    // Sem exigir espaço depois do `*`, isto viraria um item de lista com o
    // texto "*Atenção**: ..." — pior que o bug original.
    expect(separarBlocos('**Atenção**: cliente suspenso')).toEqual([
      { tipo: 'paragrafo', linhas: ['**Atenção**: cliente suspenso'] },
    ]);
  });

  it('aceita o bullet tipográfico que alguns modelos usam', () => {
    expect(separarBlocos('• item')).toEqual([{ tipo: 'lista', ordenada: false, itens: ['item'] }]);
  });

  it('texto vazio não gera bloco', () => {
    expect(separarBlocos('')).toEqual([]);
    expect(separarBlocos('\n\n')).toEqual([]);
  });

  it('resposta real do agente (dossiê) vira título + lista, sem asterisco solto', () => {
    const blocos = separarBlocos('### Perfil\nLoja de autopeças.\n\n### Pontos de Atenção\n- [12/08/2026] venda de lubrificante zerada\n- contato mudou');
    expect(blocos.map((b) => b.tipo)).toEqual(['titulo', 'paragrafo', 'titulo', 'lista']);
  });
});
