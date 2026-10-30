import { describe, expect, it } from 'vitest';
import { vencimentoCert } from './vencimentoCert';

// Meio-dia: a conta é por dia de calendário, a hora de "agora" não pode mudar o resultado.
const HOJE = new Date(2026, 9, 30, 12);

describe('vencimentoCert', () => {
  it('ontem está vencido, e a tela diz', () => {
    expect(vencimentoCert('2026-10-29', HOJE)).toEqual({ texto: '29/10/2026 vencido', nivel: 'vencido' });
  });

  it('hoje e daqui a 60 dias ainda são "perto"; 61 já é ok', () => {
    expect(vencimentoCert('2026-10-30', HOJE)).toEqual({ texto: '30/10/2026', nivel: 'perto' });
    expect(vencimentoCert('2026-12-29', HOJE)).toEqual({ texto: '29/12/2026', nivel: 'perto' });
    expect(vencimentoCert('2026-12-30', HOJE)).toEqual({ texto: '30/12/2026', nivel: 'ok' });
  });

  it('sem data, ou data que não se entende (não derruba a lista)', () => {
    expect(vencimentoCert(null, HOJE)).toEqual({ texto: '—', nivel: 'sem' });
    expect(vencimentoCert('lixo', HOJE)).toEqual({ texto: '—', nivel: 'sem' });
  });
});
