import * as motor from '../../shared/cadenciaServico.cjs';
import type { Acao, EventoAgenda } from '../types';

/**
 * Última interação por cliente — motor mora em `shared/cadenciaServico.cjs`
 * (compartilhado com o backend desde 04/09/2026; ver o comentário de topo
 * daquele arquivo). Esta função já foi um `.cjs` separado no backend com uma
 * regra sutilmente DIFERENTE (excluía reunião Cancelada/Reagendada da
 * "última interação" — divergência real, silenciosa, encontrada só ao
 * unificar); a versão única adota este comportamento (conta Cancelado como
 * contato), que é o documentado com a razão de negócio.
 */
export function buildUltimaInteracaoMap(
  agenda: EventoAgenda[],
  acoes: Acao[],
  opts?: { now?: Date; isRelevant?: (clientId: string) => boolean }
): Map<string, Date> {
  return motor.buildUltimaInteracaoMap(agenda, acoes, opts);
}
