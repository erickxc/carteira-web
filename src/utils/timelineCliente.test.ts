import { describe, expect, it } from 'vitest';
import { agruparLembretes, type TimelineItem } from './timelineCliente';
import type { EventoAgenda, Lembrete } from '../types';

const QUANDO = new Date(2026, 9, 30);

function evento(id: string, status = 'Agendado'): TimelineItem {
  return { kind: 'evento', id, quando: QUANDO, evento: { id, status } as EventoAgenda };
}

function lembrete(id: string, eventId?: string): TimelineItem {
  return { kind: 'lembrete', id, quando: QUANDO, lembrete: { id, eventId } as Lembrete };
}

const ids = (itens: TimelineItem[]) => itens.map((i) => i.id);

describe('agruparLembretes', () => {
  it('lembrete de evento presente sai da lista e entra no evento', () => {
    const r = agruparLembretes([evento('e1'), lembrete('l1', 'e1')]);
    expect(ids(r)).toEqual(['e1']);
    const e = r[0];
    expect(e.kind === 'evento' && e.lembretes?.map((l) => l.id)).toEqual(['l1']);
  });

  it('o lembrete entra no evento mesmo vindo antes dele na lista', () => {
    const r = agruparLembretes([lembrete('l1', 'e1'), evento('e1')]);
    expect(ids(r)).toEqual(['e1']);
  });

  it('evento cancelado continua na lista, então o lembrete fica dentro dele e não some', () => {
    const r = agruparLembretes([evento('e1', 'Cancelado'), lembrete('l1', 'e1')]);
    const e = r[0];
    expect(e.kind === 'evento' && e.lembretes?.map((l) => l.id)).toEqual(['l1']);
  });

  it('lembrete de evento ausente (fora da janela ou do filtro) continua item próprio', () => {
    expect(ids(agruparLembretes([lembrete('l1', 'fora'), evento('e1')]))).toEqual(['l1', 'e1']);
  });

  it('lembrete sem eventId continua item próprio', () => {
    expect(ids(agruparLembretes([evento('e1'), lembrete('l1')]))).toEqual(['e1', 'l1']);
  });

  it('só com lembretes (filtro "Lembretes") nada é agrupado', () => {
    expect(ids(agruparLembretes([lembrete('l1', 'e1'), lembrete('l2')]))).toEqual(['l1', 'l2']);
  });

  it('preserva a ordem dos itens restantes e não altera os itens recebidos', () => {
    const e2 = evento('e2');
    const r = agruparLembretes([lembrete('l1'), evento('e1'), lembrete('l2', 'e2'), e2, lembrete('l3')]);
    expect(ids(r)).toEqual(['l1', 'e1', 'e2', 'l3']);
    expect(e2.kind === 'evento' && e2.lembretes).toBeUndefined();
    const e1 = r[1];
    expect(e1.kind === 'evento' && e1.lembretes).toBeUndefined();
  });
});
