export type TipoTransicao = 'entrar' | 'voltar' | 'lateral';

function segmentos(rota: string): string[] {
  return rota.split('/').filter(Boolean);
}

function ehFilha(filha: string[], pai: string[]): boolean {
  // Raiz (Dashboard) nunca é pai: toda rota seria "filha" dela.
  if (pai.length === 0 || filha.length <= pai.length) return false;
  return pai.every((seg, i) => filha[i] === seg);
}

export function tipoTransicao(anterior: string, nova: string): TipoTransicao {
  const a = segmentos(anterior);
  const n = segmentos(nova);
  if (ehFilha(n, a)) return 'entrar';
  if (ehFilha(a, n)) return 'voltar';
  return 'lateral';
}
