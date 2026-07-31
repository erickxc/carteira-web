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
export function isStatusAtivo(status: string | undefined): boolean {
  return /^(ativ|gratuidade)/i.test((status || '').trim());
}
