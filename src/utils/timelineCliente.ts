import type { EventoAgenda, Lembrete } from '../types';

export type TimelineFiltro = 'tudo' | 'reunioes' | 'contatos' | 'relatorios' | 'lembretes';

export const TIMELINE_FILTROS: { valor: TimelineFiltro; label: string }[] = [
  { valor: 'tudo', label: 'Tudo' },
  { valor: 'reunioes', label: 'Reuniões' },
  { valor: 'contatos', label: 'Contatos' },
  { valor: 'relatorios', label: 'Relatórios' },
  { valor: 'lembretes', label: 'Lembretes' },
];

/** Item da linha do tempo — evento de agenda ou lembrete, unificados. */
export type TimelineItem =
  | { kind: 'evento'; id: string; quando: Date; evento: EventoAgenda; lembretes?: Lembrete[] }
  | { kind: 'lembrete'; id: string; quando: Date; lembrete: Lembrete };

/**
 * Tira da lista o lembrete cujo evento também está nela e o coloca dentro do
 * evento: senão cada reunião aparece duas vezes no histórico. Lembrete sem
 * evento na lista (fora da janela, fora do filtro, apagado) continua item
 * próprio — se fosse agrupado, sumiria junto com o evento. Por isso esta função
 * roda DEPOIS do filtro e da janela; no filtro "Lembretes" não há evento na
 * lista e nada é agrupado, que é o que se quer ali.
 */
export function agruparLembretes(itens: TimelineItem[]): TimelineItem[] {
  const eventos = new Set(itens.filter((i) => i.kind === 'evento').map((i) => i.id));
  const porEvento = new Map<string, Lembrete[]>();
  const restantes = itens.filter((i) => {
    if (i.kind !== 'lembrete' || !i.lembrete.eventId || !eventos.has(i.lembrete.eventId)) return true;
    porEvento.set(i.lembrete.eventId, [...(porEvento.get(i.lembrete.eventId) ?? []), i.lembrete]);
    return false;
  });
  return restantes.map((i) => (i.kind === 'evento' && porEvento.has(i.id) ? { ...i, lembretes: porEvento.get(i.id) } : i));
}
