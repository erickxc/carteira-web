import { describe, expect, it } from 'vitest';
import { corContrastante } from './cor';

describe('corContrastante', () => {
  it('usa texto preto sobre cores claras', () => {
    expect(corContrastante('#ffffff')).toBe('#000000');
    expect(corContrastante('#dabb6c')).toBe('#000000');
  });

  it('usa texto branco sobre cores escuras', () => {
    expect(corContrastante('#000000')).toBe('#ffffff');
    expect(corContrastante('#304373')).toBe('#ffffff');
    expect(corContrastante('#e0645c')).toBe('#ffffff');
  });

  it('aceita hex sem # e cai em preto se malformado (nunca invisível)', () => {
    expect(corContrastante('ffffff')).toBe('#000000');
    expect(corContrastante('não é cor')).toBe('#000000');
  });
});
