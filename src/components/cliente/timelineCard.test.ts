import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TimelineCard } from './TimelineCard';
import { agruparLembretes, type TimelineItem } from '../../utils/timelineCliente';
import type { Cliente, EventoAgenda, Lembrete } from '../../types';

const DATA_EVENTO = new Date(2026, 9, 30, 0, 0).toISOString();

const evento = {
  id: 'e1', subject: 'Reunião mensal', type: 'Reunião', status: 'Agendado', date: DATA_EVENTO, description: '', attachments: [],
} as unknown as EventoAgenda;

const lembrete = (id: string, title: string, status: Lembrete['status'], eventId?: string) => ({
  id, title, status, eventId, datetime: new Date(2026, 9, 29, 14, 30).toISOString(), description: 'detalhe do lembrete',
}) as Lembrete;

function renderizar(itens: TimelineItem[]) {
  return renderToStaticMarkup(createElement(TimelineCard, {
    cliente: { id: 'c1' } as Cliente,
    timeline: agruparLembretes(itens),
    filtro: 'tudo',
    onFiltroChange: () => {},
    onEditarEvento: () => {},
    expandida: false,
    onToggleExpandir: () => {},
    totalOcultos: 0,
    janelaDiasPassado: 30,
    janelaDiasFuturo: 10,
  }));
}

const itemEvento: TimelineItem = { kind: 'evento', id: 'e1', quando: new Date(DATA_EVENTO), evento };
const itemLembrete = (l: Lembrete): TimelineItem => ({ kind: 'lembrete', id: l.id, quando: new Date(l.datetime), lembrete: l });
const cards = (html: string) => (html.match(/timeline-rail-item/g) ?? []).length;

describe('TimelineCard: lembrete dentro do evento', () => {
  it('reunião com lembrete vira um card só, com sino, data/hora e status em texto', () => {
    const html = renderizar([itemEvento, itemLembrete(lembrete('l1', 'Ligar antes', 'ativo', 'e1'))]);
    expect(cards(html)).toBe(1);
    expect(html).toContain('lucide-bell');
    expect(html).toContain('29/10/2026 14:30');
    expect(html).toContain('Ligar antes');
    expect(html).toContain('<span>Ativo</span>');
  });

  it('uma linha por lembrete, com o status de cada um', () => {
    const html = renderizar([
      itemEvento,
      itemLembrete(lembrete('l1', 'Primeiro', 'ativo', 'e1')),
      itemLembrete(lembrete('l2', 'Segundo', 'concluido', 'e1')),
    ]);
    expect(cards(html)).toBe(1);
    expect(html.match(/lucide-bell/g)).toHaveLength(2);
    expect(html).toContain('<span>Concluído</span>');
  });

  it('lembrete de evento fora da lista continua card próprio, com a descrição', () => {
    const html = renderizar([itemEvento, itemLembrete(lembrete('l1', 'Órfão', 'ativo', 'fora'))]);
    expect(cards(html)).toBe(2);
    expect(html).toContain('Órfão');
    expect(html).toContain('detalhe do lembrete');
  });
});
