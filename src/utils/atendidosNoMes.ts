import { isSameMonth, parseISO } from 'date-fns';
import { ehEntrega } from './cadenciaServico';
import type { Cliente, EventoAgenda } from '../types';

/** Quantos clientes ativos (distintos: grupo conta uma vez, igual ao card "Clientes ativos")
 *  tiveram entrega que JÁ aconteceu no mês de `periodo`. */
export function contarAtendidosNoMes(ativos: Cliente[], agenda: EventoAgenda[], periodo: Date, agora: Date): number {
  const chavePorCliente = new Map(ativos.map((c) => [c.id, c.grupo ? `g:${c.grupo}` : `c:${c.id}`]));
  const atendidos = new Set<string>();
  for (const e of agenda) {
    const chave = chavePorCliente.get(e.clientId);
    if (!chave || !ehEntrega(e)) continue;
    const data = parseISO(e.date);
    if (isSameMonth(data, periodo) && data <= agora) atendidos.add(chave);
  }
  return atendidos.size;
}
