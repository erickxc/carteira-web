import { format, parseISO } from 'date-fns';
import type { EventoAgenda, EventoCeo } from '../types';

/** Classificação manhã/tarde de um evento — usada tanto pela visão Semana
 * (kanban) quanto por AgendaPage (moverKanban), única fonte de verdade. */
export function turnoDe(ev: EventoAgenda): 'manha' | 'tarde' {
  if (!ev.time) return 'manha';
  return Number(ev.time.slice(0, 2)) >= 12 ? 'tarde' : 'manha';
}

export function turnoDeCeo(ev: EventoCeo): 'manha' | 'tarde' {
  if (ev.allDay) return 'manha';
  return Number(format(parseISO(ev.start), 'HH')) >= 12 ? 'tarde' : 'manha';
}

/** Sala só faz sentido pra Reunião (EventFormModal só mostra o campo nesse
 *  tipo) — mas existe dado legado com `sala` preenchida em outros tipos (ex.:
 *  Relatório importado antes dessa regra). Única fonte de verdade pra exibir
 *  sala: fora de Reunião, ignora o valor gravado em vez de mostrar como se
 *  fizesse sentido. */
export function salaDoEvento(ev: EventoAgenda): string {
  return /reuni/i.test(ev.type) ? (ev.sala ?? '') : '';
}
