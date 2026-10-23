import { describe, expect, it } from 'vitest';
import { montarVocabulario, vocabularioDoEvento } from './vocabulario.cjs';
import { repoMemoria } from '../dominio/repo.cjs';

// A lista vai pro Whisper como `initial_prompt`/`hotwords`: é o que faz ele
// escrever "CMV" em vez de "sem me ver" e o nome certo do cliente.
describe('vocabulário da reunião', () => {
  it('cliente primeiro, depois 2D, depois catálogo, sem duplicar', () => {
    const v = montarVocabulario({
      cliente: { empresa: 'Pecita - Campo Grande', lojasCadastro: [{ nome: 'CAMPO GRANDE' }], contatos: [{ nome: 'Natália' }] },
      catalogo: { produtos: ['Kit Embreagem', 'cmv'], clientes: ['Wellestech'] },
      base: ['CMV', 'markup'],
    });
    expect(v).toBe('Pecita - Campo Grande, CAMPO GRANDE, Natália, CMV, markup, Kit Embreagem, Wellestech');
  });

  it('sem cliente usa só a base', () => {
    expect(montarVocabulario({ base: ['CMV'] })).toBe('CMV');
  });

  it('aceita lojas e contatos gravados como texto JSON', () => {
    const v = montarVocabulario({ cliente: { empresa: 'X', lojasCadastro: '[{"nome":"Loja A"}]', contatos: '[{"nome":"Ana"}]' }, base: [] });
    expect(v).toBe('X, Loja A, Ana');
  });

  it('corta em 800 caracteres sem partir termo', () => {
    const v = montarVocabulario({ base: Array.from({ length: 200 }, (_, i) => `termo${i}`) });
    expect(v.length).toBeLessThanOrEqual(800);
    expect(v.endsWith(',')).toBe(false);
    expect(v.split(', ').every((t) => /^termo\d+$/.test(t))).toBe(true);
  });

  it('evento de reunião interna (sem cliente) não lança', () => {
    const repo = repoMemoria({ Clientes: [] });
    expect(() => vocabularioDoEvento(repo, { id: 'e1', subject: 'Interna' })).not.toThrow();
  });
});
