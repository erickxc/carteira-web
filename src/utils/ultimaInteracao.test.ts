import { describe, expect, it } from 'vitest';
import { buildUltimaInteracaoMap } from './ultimaInteracao';
import type { EventoAgenda } from '../types';

const AGORA = new Date('2026-09-01T12:00:00.000Z');

function ev(over: Partial<EventoAgenda>): EventoAgenda {
  return {
    id: 'e1', clientId: 'c1', clientName: 'Empresa Teste', date: '2026-08-01T12:00:00.000Z',
    type: 'Reunião', subject: '', description: '', servicos: [], attachments: [],
    status: 'Concluído', monitores: [], createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

describe('buildUltimaInteracaoMap: cancelamento/reagendamento contam como contato', () => {
  it('reunião Cancelada conta como último contato (motivo é obrigatório, então houve contato)', () => {
    const m = buildUltimaInteracaoMap(
      [ev({ status: 'Cancelado', date: '2026-08-30T12:00:00.000Z', motivo: 'Cliente pediu para adiar.' })],
      [],
      { now: AGORA }
    );
    expect(m.get('c1')?.toISOString()).toBe('2026-08-30T12:00:00.000Z');
  });

  it('reunião Reagendada conta como último contato', () => {
    const m = buildUltimaInteracaoMap(
      [ev({ status: 'Reagendado', date: '2026-08-29T12:00:00.000Z', motivo: 'Sem verba este mês.' })],
      [],
      { now: AGORA }
    );
    expect(m.get('c1')?.toISOString()).toBe('2026-08-29T12:00:00.000Z');
  });

  it('cancelamento mais recente vence sobre reunião concluída mais antiga', () => {
    const m = buildUltimaInteracaoMap(
      [
        ev({ id: 'e1', status: 'Concluído', date: '2026-07-01T12:00:00.000Z' }),
        ev({ id: 'e2', status: 'Cancelado', date: '2026-08-30T12:00:00.000Z' }),
      ],
      [],
      { now: AGORA }
    );
    expect(m.get('c1')?.toISOString()).toBe('2026-08-30T12:00:00.000Z');
  });

  it('não conta evento cancelado com data futura (ainda não aconteceu/não é contato até agora)', () => {
    const m = buildUltimaInteracaoMap(
      [ev({ status: 'Cancelado', date: '2026-09-15T12:00:00.000Z' })],
      [],
      { now: AGORA }
    );
    expect(m.has('c1')).toBe(false);
  });
});
