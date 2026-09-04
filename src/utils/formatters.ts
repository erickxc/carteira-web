import { isClienteAtivo as isClienteAtivoMotor } from 'carteira-shared/cadenciaServico.cjs';

export function truthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return ['sim', 'true', '1', 'x'].includes(value.trim().toLowerCase());
  return false;
}

/** Cliente "ativo" na carteira — regra mora em `shared/cadenciaServico.cjs`
 * (compartilhada com o backend desde 04/09/2026; ver o comentário de topo
 * daquele arquivo pro histórico e o porquê de cada detalhe da regra:
 * lista BRANCA de status, caso especial "Gratuidade", fallback "ativ" pro
 * valor legado "Ativo"). Reexportado aqui porque é daqui que ~20 arquivos do
 * app já importam `isClienteAtivo`. */
export const isClienteAtivo = isClienteAtivoMotor;

/** @deprecated use isClienteAtivo; mantido para compatibilidade. */
export function isStatusAtivo(status: string | undefined): boolean {
  return /^(ativ|gratuidade)/i.test((status || '').trim());
}
