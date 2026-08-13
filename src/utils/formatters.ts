export function truthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return ['sim', 'true', '1', 'x'].includes(value.trim().toLowerCase());
  return false;
}

/** Cliente "ativo" na carteira: quem está com status "Ativo" OU "Gratuidade"
 * entra nas contas de cadência/Ações/Dashboard. Lista BRANCA (não lista negra
 * de palavras-chave) de propósito — status_cliente é configurável em
 * Configurações, então qualquer valor novo cadastrado ali (Suspenso,
 * Problemas Externos, ou o que vier depois) já fica fora por padrão, sem
 * precisar prever a palavra-chave. Já foi bug real: "Problemas Externos" não
 * batia com nenhuma palavra da lista negra antiga e continuava sendo
 * considerado ativo.
 * "Gratuidade" é caso especial: cliente inadimplente com gratuidade liberada
 * — continua sendo monitorado normalmente (não é como Suspenso), só com
 * destaque visual amarelo (ver isGratuidade em utils/badges.ts). */
// Lista BRANCA dos valores de `status` que ainda contam como "em atendimento"
// quando `estado` já diz "Ativo" — Suspenso/Atendido pelo Marco/Problemas
// Externos (e qualquer status novo cadastrado depois) ficam fora por padrão.
// Inclui "ativ" (prefixo) pro valor LEGADO "Ativo" — `deserializeCliente`
// (src/api/client.ts) sempre preenche `estado` com um fallback calculado a
// partir do `status` antigo quando a planilha não tem a coluna `estado`
// ainda, então `cliente.estado` nunca chega undefined aqui; sem "ativ" na
// whitelist, todo cliente legado (status="Ativo", nunca migrado pra
// "Regular") era excluído — bug real, quase zerou a carteira em produção.
// Bug original (antes desse ajuste) corrigido do mesmo jeito: "Atendido pelo
// Marco" com estado="Ativo" entrava como ativo normal só por checar estado.
const STATUS_EM_ATENDIMENTO = /^(ativo|regular|gratuidade)?$/i;

export function isClienteAtivo(cliente: { estado?: string; status?: string }): boolean {
  const status = (cliente.status || '').trim();
  if (cliente.estado) return /^ativo$/i.test(cliente.estado.trim()) && STATUS_EM_ATENDIMENTO.test(status);
  return /^(ativ|gratuidade)/i.test(status);
}

/** @deprecated use isClienteAtivo; mantido para compatibilidade. */
export function isStatusAtivo(status: string | undefined): boolean {
  return /^(ativ|gratuidade)/i.test((status || '').trim());
}
