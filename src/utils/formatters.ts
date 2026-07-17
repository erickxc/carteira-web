export function truthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return ['sim', 'true', '1', 'x'].includes(value.trim().toLowerCase());
  return false;
}

/** Cliente "ativo" na carteira: exclui suspensos, inativos e quem deixou de comprar. */
export function isStatusAtivo(status: string | undefined): boolean {
  return !/(suspens|inativ|deixou|encerr|cancel)/i.test(status || '');
}
