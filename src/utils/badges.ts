/**
 * Status agora são strings livres (vêm do CRUD de categorias), então a cor do
 * badge é inferida por palavra-chave em vez de um enum fixo. Valores
 * desconhecidos caem em 'badge-muted' (neutro) — nunca quebra.
 */
export function clienteStatusBadge(status: string): string {
  const s = (status || '').toLowerCase();
  if (/(ativ|normaliz|em dia)/.test(s)) return 'badge-success';
  if (/(suspens|inadimpl|cancel|encerr)/.test(s)) return 'badge-danger';
  if (/(an[aá]lise|aten|pendent|risco)/.test(s)) return 'badge-warning';
  return 'badge-muted';
}

export function eventoStatusBadge(status: string): string {
  const s = (status || '').toLowerCase();
  if (/(conclu|realiz|feito)/.test(s)) return 'badge-success';
  if (/cancel/.test(s)) return 'badge-danger';
  if (/(agend|pendent)/.test(s)) return 'badge-accent';
  return 'badge-muted';
}
