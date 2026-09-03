import { describe, expect, it } from 'vitest';
import { formatarCNPJ } from './price';

describe('formatarCNPJ', () => {
  it('formata 14 dígitos crus no padrão exigido pelo Price', () => {
    expect(formatarCNPJ('12345678000199')).toBe('12.345.678/0001-99');
  });

  it('já formatado corretamente, mantém (idempotente)', () => {
    expect(formatarCNPJ('12.345.678/0001-99')).toBe('12.345.678/0001-99');
  });

  it('formatação parcial/pontuação estranha: extrai os dígitos e reformata certo', () => {
    expect(formatarCNPJ('12.345.678/000199')).toBe('12.345.678/0001-99');
  });

  it('menos de 14 dígitos (cadastro incompleto): devolve como veio, não força máscara errada', () => {
    expect(formatarCNPJ('123456')).toBe('123456');
  });

  it('string vazia: devolve vazia', () => {
    expect(formatarCNPJ('')).toBe('');
  });
});
