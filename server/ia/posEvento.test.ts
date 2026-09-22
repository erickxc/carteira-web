import { describe, expect, it } from 'vitest';
const { relevante } = require('./posEvento.cjs');

describe('posEvento: relevante', () => {
  it('dispara para status de desfecho normal (concluído/realizado/cancelado/reagendado)', () => {
    expect(relevante('Concluído')).toBe(true);
    expect(relevante('Realizado')).toBe(true);
    expect(relevante('Cancelado', 'Agendado')).toBe(true);
    expect(relevante('Reagendado', 'Agendado')).toBe(true);
  });

  it('não dispara para status irrelevante (Agendado, Pendente)', () => {
    expect(relevante('Agendado')).toBe(false);
    expect(relevante('Pendente')).toBe(false);
  });

  it('NÃO dispara ao cancelar uma reunião que estava Pendente — nunca aconteceu de verdade', () => {
    expect(relevante('Cancelado', 'Pendente')).toBe(false);
  });

  it('dispara ao cancelar a partir de qualquer outro status (não só Pendente é exceção)', () => {
    expect(relevante('Cancelado', 'Agendado')).toBe(true);
    expect(relevante('Cancelado', undefined)).toBe(true);
  });
});
