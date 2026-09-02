import { describe, expect, it } from 'vitest';
import { corDoServico } from './corServico';

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
