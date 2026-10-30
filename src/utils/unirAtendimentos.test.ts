import { describe, expect, it } from 'vitest';
import { lojasDoAtendimento, planejarMudancas } from './unirAtendimentos';

// Caso real (30/10/2026): Altese — Penha com 4 lojas, Smart com 2, CD e EC soltas.
const LOJAS = [
  { loja: 'altese_vw', receita: 22, vinculado: 'penha' },
  { loja: 'altese_gm', receita: 18, vinculado: 'penha' },
  { loja: 'altese_smart', receita: 11, vinculado: 'smart' },
  { loja: 'altese_cd', receita: 14, vinculado: null },
];

describe('unir atendimentos', () => {
  it('parte das lojas que já são do atendimento', () => {
    expect([...lojasDoAtendimento(LOJAS, 'penha')]).toEqual(['altese_vw', 'altese_gm']);
  });

  it('sem mudança de marcação, nada a gravar', () => {
    expect(planejarMudancas(LOJAS, 'penha', lojasDoAtendimento(LOJAS, 'penha'))).toEqual([]);
  });

  it('marcar loja solta junta; marcar loja de outro atendimento MOVE; desmarcar solta', () => {
    const marcadas = new Set(['altese_vw', 'altese_smart', 'altese_cd']);
    expect(planejarMudancas(LOJAS, 'penha', marcadas)).toEqual([
      { loja: 'altese_gm', de: 'penha', para: null },
      { loja: 'altese_smart', de: 'smart', para: 'penha' },
      { loja: 'altese_cd', de: null, para: 'penha' },
    ]);
  });
});
