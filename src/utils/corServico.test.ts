import { describe, expect, it } from 'vitest';
import { corDoServico, hexParaRgb } from './corServico';

describe('corDoServico', () => {
  it('usa a cor configurada quando presente', () => {
    expect(corDoServico('Monitoria', '#123456')).toBe('#123456');
  });

  it('sem cor configurada, cai num fallback estável (mesmo nome sempre a mesma cor)', () => {
    const a = corDoServico('OptiMarco');
    const b = corDoServico('OptiMarco');
    expect(a).toBe(b);
    expect(a).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('nomes diferentes tendem a cair em cores diferentes da paleta', () => {
    expect(corDoServico('Monitoria')).not.toBe(corDoServico('Precificação'));
  });
});

describe('hexParaRgb', () => {
  it('converte hex pra "r, g, b"', () => {
    expect(hexParaRgb('#dabb6c')).toBe('218, 187, 108');
  });

  it('hex inválido cai num cinza neutro, não quebra', () => {
    expect(hexParaRgb('não-é-hex')).toBe('128, 128, 128');
  });
});
