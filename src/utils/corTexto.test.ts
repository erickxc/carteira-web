import { describe, expect, it } from 'vitest';
import { corDeTexto } from './corTexto';

describe('corDeTexto', () => {
  it('semântica viva vira a variante legível como texto', () => {
    expect(corDeTexto('var(--success)')).toBe('var(--success-fg)');
    expect(corDeTexto('var(--danger)')).toBe('var(--danger-fg)');
    expect(corDeTexto('var(--accent)')).toBe('var(--accent-fg)');
  });

  it('tipo e texto passam direto', () => {
    expect(corDeTexto('var(--tipo-contato)')).toBe('var(--tipo-contato)');
    expect(corDeTexto('var(--text-muted)')).toBe('var(--text-muted)');
  });

  it('cor de fundo/borda não vira texto invisível', () => {
    expect(corDeTexto('var(--card-hover)')).toBe('var(--text-primary)');
    expect(corDeTexto('#4285f4')).toBe('var(--text-primary)');
  });
});
