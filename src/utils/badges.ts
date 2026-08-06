import type { BadgeVariant } from '../ui';

/**
 * Status agora são strings livres (vêm do CRUD de categorias), então a cor do
 * badge é inferida por palavra-chave em vez de um enum fixo. Valores
 * desconhecidos caem em 'muted' (neutro) — nunca quebra. Retornam a VARIANTE
 * do componente <Badge>, não uma classe CSS.
 */
export function clienteStatusBadge(status: string): BadgeVariant {
  const s = (status || '').toLowerCase();
  if (/gratuidade/.test(s)) return 'gratuidade';
  if (/marco/.test(s)) return 'accent';
  if (/(ativ|normaliz|em dia)/.test(s)) return 'success';
  if (/(suspens|inadimpl|cancel|encerr)/.test(s)) return 'danger';
  if (/(an[aá]lise|aten|pendent|risco)/.test(s)) return 'warning';
  return 'muted';
}

/** true quando o status do cliente é "Gratuidade" — usado pra pintar de
 * amarelo claro qualquer card/linha que represente esse cliente. */
export function isGratuidade(status: string | undefined): boolean {
  return /gratuidade/i.test((status || '').trim());
}

/** true quando o status do cliente é "Atendido pelo Marco" — cliente atendido
 * diretamente pelo Marco, fora do modelo de cadência (não é mais uma checkbox
 * paralela ao status: é o próprio status). Como `isStatusAtivo` só aceita
 * ativ/gratuidade, esse status já sai sozinho de qualquer fila/dashboard —
 * este helper é só para o destaque visual (badge "Marco" no card). */
export function isAtendidoMarco(status: string | undefined): boolean {
  return /marco/i.test((status || '').trim());
}

export function eventoStatusBadge(status: string): BadgeVariant {
  const s = (status || '').toLowerCase();
  if (/(conclu|realiz|feito)/.test(s)) return 'success';
  if (/cancel/.test(s)) return 'danger';
  if (/(agend|pendent)/.test(s)) return 'accent';
  return 'muted';
}
