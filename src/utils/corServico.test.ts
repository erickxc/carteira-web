import { describe, expect, it } from 'vitest';
import { corDoServico, corDoServicoBg, corDoServicoBorda } from './corServico';

describe('corDoServico', () => {
  it('usa a cor configurada quando presente', () => {
    expect(corDoServico('Monitoria', '#123456')).toBe('#123456');
  });

  it('sem cor configurada, cai num fallback estável (mesmo nome sempre a mesma cor)', () => {
    const a = corDoServico('OptiMarco');
    const b = corDoServico('OptiMarco');
    expect(a).toBe(b);
    expect(a).toMatch(/^var\(--tipo-reserva-\d\)$/);
  });

  it('nomes diferentes tendem a cair em cores diferentes da paleta', () => {
    expect(corDoServico('Monitoria')).not.toBe(corDoServico('Precificação'));
  });
});

describe('corDoServicoBg / corDoServicoBorda', () => {
  it('compõem color-mix a partir da cor resolvida', () => {
    expect(corDoServicoBg('Monitoria', '#dabb6c')).toBe('color-mix(in srgb, #dabb6c 16%, transparent)');
    expect(corDoServicoBorda('Monitoria', '#dabb6c')).toBe('color-mix(in srgb, #dabb6c 40%, transparent)');
  });

  it('funciona igual pro fallback (token var(--tipo-reserva-*))', () => {
    expect(corDoServicoBg('OptiMarco')).toMatch(/^color-mix\(in srgb, var\(--tipo-reserva-\d\) 16%, transparent\)$/);
  });
});
