import type { BadgeVariant } from '../ui';

/**
 * Status agora são strings livres (vêm do CRUD de categorias), então a cor do
 * badge é inferida por palavra-chave em vez de um enum fixo. Valores
 * desconhecidos caem em 'muted' (neutro) — nunca quebra. Retornam a VARIANTE
 * do componente <Badge>, não uma classe CSS.
 */
export function clienteStatusBadge(status: string): BadgeVariant {
  const s = (status || '').toLowerCase();
  if (/(ativ|normaliz|em dia)/.test(s)) return 'success';
  if (/(suspens|inadimpl|cancel|encerr)/.test(s)) return 'danger';
  if (/(an[aá]lise|aten|pendent|risco)/.test(s)) return 'warning';
  return 'muted';
}

export function eventoStatusBadge(status: string): BadgeVariant {
  const s = (status || '').toLowerCase();
  if (/(conclu|realiz|feito)/.test(s)) return 'success';
  if (/cancel/.test(s)) return 'danger';
  if (/(agend|pendent)/.test(s)) return 'accent';
  return 'muted';
}
