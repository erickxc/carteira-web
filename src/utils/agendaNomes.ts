import type { Cliente, EventoAgenda } from '../types';
import { ehToquePrice } from './cadenciaServico';

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
 * Precificação do grupo (ver `comPrecificacaoDoGrupo`) é atendimento do grupo,
 * então aparece com o nome do GRUPO ("Altese"), não da loja onde foi salva.
 *
 * Devolve o MESMO objeto de evento quando não há nada a corrigir, para não
 * invalidar memos/renders desnecessariamente.
 */
export function resolverNomesClientes(agenda: EventoAgenda[], clientes: Cliente[]): EventoAgenda[] {
  const nomePorId = new Map(clientes.map((c) => [c.id, c.empresa]));
  const grupoPorId = new Map(clientes.map((c) => [c.id, c.grupo?.trim() ?? '']));
  const lojasPorGrupo = new Map<string, number>();
  for (const g of grupoPorId.values()) if (g) lojasPorGrupo.set(g.toLowerCase(), (lojasPorGrupo.get(g.toLowerCase()) ?? 0) + 1);
  return agenda.map((ev) => {
    const grupo = ev.clientId ? grupoPorId.get(ev.clientId) : '';
    const doGrupo = !!grupo && (lojasPorGrupo.get(grupo.toLowerCase()) ?? 0) > 1 && ev.escopoPrice !== 'loja' && ehToquePrice(ev);
    const nomeAtual = doGrupo ? grupo : ev.clientId ? nomePorId.get(ev.clientId) : undefined;
    return nomeAtual && nomeAtual !== ev.clientName ? { ...ev, clientName: nomeAtual } : ev;
  });
}
