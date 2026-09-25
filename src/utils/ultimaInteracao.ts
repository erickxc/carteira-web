import * as motor from 'carteira-shared/cadenciaServico.cjs';
import type { Acao, EventoAgenda } from '../types';

/**
 * Última interação por cliente ("quando falamos com o cliente por último") —
 * motor mora em `shared/cadenciaServico.cjs`, compartilhado com o backend.
 * Só evento concluído (qualquer tipo) ou ação concluída; cancelado e
 * "Agendado" não contam.
 */
export function buildUltimaInteracaoMap(
  agenda: EventoAgenda[],
  acoes: Acao[],
  opts?: { now?: Date; isRelevant?: (clientId: string) => boolean }
): Map<string, Date> {
  return motor.buildUltimaInteracaoMap(agenda, acoes, opts);
}
