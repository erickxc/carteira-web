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
  | { kind: 'evento'; id: string; quando: Date; evento: EventoAgenda }
  | { kind: 'lembrete'; id: string; quando: Date; lembrete: Lembrete };
