export function truthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return ['sim', 'true', '1', 'x'].includes(value.trim().toLowerCase());
  return false;
}
