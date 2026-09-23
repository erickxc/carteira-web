import { describe, expect, it } from 'vitest';
import { tipoTransicao } from './tipoTransicao';

describe('tipoTransicao', () => {
  it('lista para detalhe é entrar', () => {
    expect(tipoTransicao('/clientes', '/clientes/abc')).toBe('entrar');
  });

  it('detalhe para lista é voltar', () => {
    expect(tipoTransicao('/clientes/abc', '/clientes')).toBe('voltar');
  });

  it('páginas irmãs da sidebar são lateral', () => {
    expect(tipoTransicao('/clientes', '/agenda')).toBe('lateral');
  });

  it('a raiz nunca é pai', () => {
    expect(tipoTransicao('/', '/clientes')).toBe('lateral');
    expect(tipoTransicao('/clientes', '/')).toBe('lateral');
  });

  it('prefixo de texto sem barra não conta como filho', () => {
    expect(tipoTransicao('/clientes', '/clientes-x')).toBe('lateral');
  });

  it('mesma rota é lateral', () => {
    expect(tipoTransicao('/agenda', '/agenda')).toBe('lateral');
  });

  it('barra final não muda o resultado', () => {
    expect(tipoTransicao('/clientes/', '/clientes/abc')).toBe('entrar');
  });
});
