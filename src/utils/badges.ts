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

/** Cor sólida (CSS var) correspondente à variante de `clienteStatusBadge` —
 *  usada em barras/gráficos de composição, onde a cor precisa ser um fill
 *  sólido, não a classe do badge (fundo pastel + texto). Sem borda: nunca
 *  combinar fundo pastel com borda da mesma cor (lê como "gerado por IA"). */
const COR_POR_VARIANTE_BADGE: Record<BadgeVariant, string> = {
  success: 'var(--success)',
  danger: 'var(--danger)',
  warning: 'var(--warning)',
  gratuidade: 'var(--gratuidade)',
  accent: 'var(--accent)',
  muted: 'var(--text-muted)',
  plain: 'var(--text-muted)',
};

export function clienteStatusCor(status: string): string {
  return COR_POR_VARIANTE_BADGE[clienteStatusBadge(status)];
}

export function eventoStatusBadge(status: string): BadgeVariant {
  const s = (status || '').toLowerCase();
  if (/(conclu|realiz|feito)/.test(s)) return 'success';
  if (/cancel/.test(s)) return 'danger';
  if (/(agend|pendent)/.test(s)) return 'accent';
  return 'muted';
}

/** Nível de risco do dossiê do monitorIA (`AnaliseIA.nivelRisco`) — cor e
 * rótulo únicos, pra não repetir a mesma tabela alto/médio/baixo → cor em
 * cada componente que mostra risco (já tinha acontecido: uma cópia em
 * `AnaliseIACard.tsx`, outra em `ClientesPage.tsx`, cada uma com sua própria
 * `Record<nivelRisco, ...>`). */
const RISCO_LABEL: Record<'alto' | 'medio' | 'baixo', string> = { alto: 'Risco alto', medio: 'Risco médio', baixo: 'Risco baixo' };
const RISCO_COR: Record<'alto' | 'medio' | 'baixo', string> = { alto: 'var(--danger)', medio: 'var(--warning)', baixo: 'var(--success)' };

export function riscoIALabel(nivelRisco: 'alto' | 'medio' | 'baixo' | undefined): string {
  return nivelRisco ? RISCO_LABEL[nivelRisco] : 'Sem dossiê';
}
export function riscoIACor(nivelRisco: 'alto' | 'medio' | 'baixo' | undefined): string {
  return nivelRisco ? RISCO_COR[nivelRisco] : 'var(--text-muted)';
}
