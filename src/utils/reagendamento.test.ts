import { describe, expect, it } from 'vitest';
import { ehReuniao, ghostsByDay, ghostsRealocados, registrarRemarcacao } from './reagendamento';
import type { EventoAgenda } from '../types';

/** Evento mínimo válido, sobrescrevível por caso de teste. */
function evento(over: Partial<EventoAgenda> = {}): EventoAgenda {
  return {
    id: 'ev1', clientId: 'c1', clientName: 'Cliente Teste', type: 'Reunião',
    date: '2026-06-10T00:00:00.000Z', description: '', status: 'Agendado',
    servicos: [], monitores: [], checklist: [], attachments: [], createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  } as EventoAgenda;
}

describe('reagendamento: ehReuniao', () => {
  it('reconhece variações de "Reunião" case-insensitive', () => {
    expect(ehReuniao({ type: 'Reunião' })).toBe(true);
    expect(ehReuniao({ type: 'reunião' })).toBe(true);
    expect(ehReuniao({ type: 'REUNIAO' })).toBe(true);
  });

  it('não conta Contato/Relatório/Ligação como reunião', () => {
    expect(ehReuniao({ type: 'Contato' })).toBe(false);
    expect(ehReuniao({ type: 'Relatório' })).toBe(false);
    expect(ehReuniao({ type: 'Ligação' })).toBe(false);
  });
});

describe('reagendamento: registrarRemarcacao', () => {
  it('reunião mudando de dia soma 1 e empilha a data antiga', () => {
    const ev = evento({ date: '2026-06-10T00:00:00.000Z', reagendamentos: 1 });
    const patch = registrarRemarcacao(ev, '2026-06-15T00:00:00.000Z');
    expect(patch.reagendamentos).toBe(2);
    expect(patch.datasAnteriores).toEqual(['2026-06-10T00:00:00.000Z']);
  });

  it('preserva datasAnteriores já existentes, empilhando por cima', () => {
    const ev = evento({ date: '2026-06-15T00:00:00.000Z', datasAnteriores: ['2026-06-10T00:00:00.000Z'] });
    const patch = registrarRemarcacao(ev, '2026-06-20T00:00:00.000Z');
    expect(patch.datasAnteriores).toEqual(['2026-06-10T00:00:00.000Z', '2026-06-15T00:00:00.000Z']);
  });

  it('mudar só o horário no MESMO dia não conta como remarcação', () => {
    const ev = evento({ date: '2026-06-10T09:00:00.000Z', reagendamentos: 0 });
    const patch = registrarRemarcacao(ev, '2026-06-10T14:00:00.000Z');
    expect(patch).toEqual({});
  });

  it('sem nenhuma mudança de data, devolve {}', () => {
    const ev = evento({ date: '2026-06-10T00:00:00.000Z' });
    expect(registrarRemarcacao(ev, '2026-06-10T00:00:00.000Z')).toEqual({});
  });

  it('Contato/Relatório mudando de dia não conta — é ajuste de registro, não remarcação com o cliente', () => {
    const ev = evento({ type: 'Contato', date: '2026-06-10T00:00:00.000Z' });
    expect(registrarRemarcacao(ev, '2026-06-20T00:00:00.000Z')).toEqual({});
  });

  it('primeira remarcação (sem reagendamentos prévio) começa em 1', () => {
    const ev = evento({ date: '2026-06-10T00:00:00.000Z', reagendamentos: undefined });
    expect(registrarRemarcacao(ev, '2026-06-11T00:00:00.000Z').reagendamentos).toBe(1);
  });
});

describe('reagendamento: ghostsRealocados / ghostsByDay', () => {
  it('um evento sem datasAnteriores não gera fantasma nenhum', () => {
    expect(ghostsRealocados([evento()])).toEqual([]);
  });

  it('um evento com 2 datas antigas gera 2 fantasmas, cada um apontando pra data atual', () => {
    const ev = evento({
      date: '2026-06-20T00:00:00.000Z',
      datasAnteriores: ['2026-06-10T00:00:00.000Z', '2026-06-15T00:00:00.000Z'],
    });
    const ghosts = ghostsRealocados([ev]);
    expect(ghosts).toHaveLength(2);
    expect(ghosts.every((g) => g.novaData === '2026-06-20T00:00:00.000Z')).toBe(true);
    expect(ghosts.map((g) => g.diaAntigo)).toEqual(['2026-06-10T00:00:00.000Z', '2026-06-15T00:00:00.000Z']);
  });

  it('evento excluído (fora da lista) não deixa fantasma solto — não há registro fora do próprio evento', () => {
    // Garantido por construção: ghostsRealocados só itera a lista recebida.
    const ev = evento({ datasAnteriores: ['2026-06-10T00:00:00.000Z'] });
    expect(ghostsRealocados([])).toEqual([]);
    expect(ghostsRealocados([ev])).toHaveLength(1);
  });

  it('ghostsByDay agrupa pela data ANTIGA (dia), não pela data nova', () => {
    const ev1 = evento({ id: 'a', date: '2026-06-20T00:00:00.000Z', datasAnteriores: ['2026-06-10T08:00:00.000Z'] });
    const ev2 = evento({ id: 'b', date: '2026-06-21T00:00:00.000Z', datasAnteriores: ['2026-06-10T15:00:00.000Z'] });
    const map = ghostsByDay([ev1, ev2]);
    expect(map.get('2026-06-10')).toHaveLength(2);
    expect(map.has('2026-06-20')).toBe(false);
  });

  it('sem nenhum evento remarcado, o mapa vem vazio', () => {
    expect(ghostsByDay([evento(), evento({ id: 'ev2' })]).size).toBe(0);
  });
});
