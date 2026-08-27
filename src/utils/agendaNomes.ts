import type { Cliente, EventoAgenda } from '../types';

/**
 * Resolve o nome do cliente de cada evento a partir do `clientId`.
 *
 * `EventoAgenda.clientName` é desnormalizado: fica gravado na linha do evento
 * como estava no momento da criação, e nada o ressincroniza quando o cliente é
 * renomeado depois. Na base real isso deixava 15 de 302 eventos exibindo nome
 * antigo (ex.: "Altese" para o cliente hoje chamado "Altese - Recreio + Barra"),
 * o que num grupo com várias lojas esconde de qual loja o evento é.
 *
 * O `clientId` é a fonte de verdade. O valor gravado permanece como fallback
 * para eventos que legitimamente não têm cliente ("Evento Avulso", `clientId`
 * vazio) ou cujo cliente foi removido — nesses casos não há nome a resolver.
 *
 * Devolve o MESMO objeto de evento quando não há nada a corrigir, para não
 * invalidar memos/renders desnecessariamente.
 */
export function resolverNomesClientes(agenda: EventoAgenda[], clientes: Cliente[]): EventoAgenda[] {
  const nomePorId = new Map(clientes.map((c) => [c.id, c.empresa]));
  return agenda.map((ev) => {
    const nomeAtual = ev.clientId ? nomePorId.get(ev.clientId) : undefined;
    return nomeAtual && nomeAtual !== ev.clientName ? { ...ev, clientName: nomeAtual } : ev;
  });
}
