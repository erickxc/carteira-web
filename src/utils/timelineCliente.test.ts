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

describe('agruparLembretes: bordas', () => {
  it('dois lembretes do mesmo evento entram os dois, na ordem da lista', () => {
    const r = agruparLembretes([lembrete('l2', 'e1'), evento('e1'), lembrete('l1', 'e1')]);
    expect(ids(r)).toEqual(['e1']);
    const e = r[0];
    expect(e.kind === 'evento' && e.lembretes?.map((l) => l.id)).toEqual(['l2', 'l1']);
  });

  it('cada lembrete vai para o seu evento, sem misturar', () => {
    const r = agruparLembretes([evento('e1'), evento('e2'), lembrete('l1', 'e1'), lembrete('l2', 'e2')]);
    expect(r.map((i) => (i.kind === 'evento' ? i.lembretes?.map((l) => l.id) : null))).toEqual([['l1'], ['l2']]);
  });

  it('o evento recebido não é alterado quando recebe lembrete', () => {
    const e1 = evento('e1');
    const r = agruparLembretes([e1, lembrete('l1', 'e1')]);
    expect(e1.kind === 'evento' && e1.lembretes).toBeUndefined();
    expect(r[0]).not.toBe(e1);
  });

  it('eventId igual ao id de outro LEMBRETE não agrupa: só evento recebe lembrete', () => {
    expect(ids(agruparLembretes([lembrete('x'), lembrete('l1', 'x')]))).toEqual(['x', 'l1']);
  });

  it('cópia de precificação do grupo tem outro id: lembrete do evento original continua item', () => {
    const copia = evento('orig@loja2');
    expect(ids(agruparLembretes([copia, lembrete('l1', 'orig')]))).toEqual(['orig@loja2', 'l1']);
  });

  it('nenhum lembrete some: total de lembretes antes e depois é o mesmo', () => {
    const r = agruparLembretes([evento('e1'), lembrete('a', 'e1'), lembrete('b', 'ausente'), lembrete('c'), lembrete('d', 'e1')]);
    const soltos = r.filter((i) => i.kind === 'lembrete').map((i) => i.id);
    const dentro = r.flatMap((i) => (i.kind === 'evento' ? (i.lembretes ?? []).map((l) => l.id) : []));
    expect([...soltos, ...dentro].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('lista vazia devolve lista vazia', () => {
    expect(agruparLembretes([])).toEqual([]);
  });
});
