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

describe('vencimentoCert: bordas', () => {
  it('a hora de "agora" não muda o dia: fim e começo do dia dão o mesmo nível', () => {
    for (const hora of [new Date(2026, 9, 30, 0, 0, 0), new Date(2026, 9, 30, 23, 59, 59)]) {
      expect(vencimentoCert('2026-10-29', hora).nivel).toBe('vencido');
      expect(vencimentoCert('2026-10-30', hora).nivel).toBe('perto');
      expect(vencimentoCert('2026-12-29', hora).nivel).toBe('perto');
      expect(vencimentoCert('2026-12-30', hora).nivel).toBe('ok');
    }
  });

  it('a data é a do calendário: não volta um dia no fuso do Brasil', () => {
    expect(vencimentoCert('2027-01-01', HOJE).texto).toBe('01/01/2027');
  });

  it('vazio, ausente e data impossível viram "sem", sem lançar', () => {
    for (const data of ['', undefined, '2026-02-31', '01/12/2026']) {
      expect(vencimentoCert(data, HOJE)).toEqual({ texto: '—', nivel: 'sem' });
    }
  });

  it('sem "hoje" informado usa a data atual (é assim que as telas chamam)', () => {
    expect(vencimentoCert('2000-01-01').nivel).toBe('vencido');
    expect(vencimentoCert('2999-01-01').nivel).toBe('ok');
  });
});
