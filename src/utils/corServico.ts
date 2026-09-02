/**
 * Cor de referência por Serviço (indicador na tabela de Clientes e em
 * Configurações) — configurável em Configurações → Categorias → Serviço
 * (`Categoria.cor`, hex). Sem cor configurada, cai na MESMA paleta de reserva
 * já usada por `src/utils/tipoCor.ts` pros tipos de evento (`--tipo-reserva-1..4`,
 * tons dessaturados da marca, theme-aware) — pedido explícito do usuário:
 * nada de paleta arco-íris genérica ("cara de IA"), reusa o que já foi
 * desenhado a dedo pro resto do app. A cor aparece como PONTO colorido ao
 * lado de texto neutro, nunca como fundo/borda de badge (mesmo motivo).
 */
const PALETA_RESERVA = ['var(--tipo-reserva-1)', 'var(--tipo-reserva-2)', 'var(--tipo-reserva-3)', 'var(--tipo-reserva-4)'];

function hash(texto: string): number {
  let h = 0;
  for (let i = 0; i < texto.length; i++) h = (h * 31 + texto.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** `corConfigurada` (de `Categoria.cor`) tem prioridade; sem ela, uma cor
 *  estável (mesmo serviço sempre cai na mesma cor) da paleta de reserva. */
export function corDoServico(nome: string, corConfigurada?: string | null): string {
  if (corConfigurada) return corConfigurada;
  if (!nome) return PALETA_RESERVA[0];
  return PALETA_RESERVA[hash(nome) % PALETA_RESERVA.length];
}
