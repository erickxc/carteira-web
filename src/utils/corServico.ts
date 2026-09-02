/**
 * Cor de referência por Serviço (badges da tabela de Clientes) — configurável
 * em Configurações → Categorias → Serviço (`Categoria.cor`, hex). Sem cor
 * configurada, cai na MESMA paleta de reserva já usada por `src/utils/tipoCor.ts`
 * pros tipos de evento (`--tipo-reserva-1..4`, tons dessaturados da marca,
 * theme-aware) — pedido explícito do usuário: nada de paleta arco-íris
 * genérica ("cara de IA"), reusa o que já foi desenhado a dedo pro resto do
 * app. `color-mix()` (não recomputar rgb manualmente) porque já funciona
 * tanto com os tokens `var(--tipo-reserva-*)` quanto com um hex literal —
 * mesma função serve pro fallback E pra cor custom escolhida em Configurações.
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

/** Fundo translúcido (16%, mesmo tom pastel de `tipoCor.corTipoBg`) pra usar
 *  atrás do badge do serviço. */
export function corDoServicoBg(nome: string, corConfigurada?: string | null): string {
  return `color-mix(in srgb, ${corDoServico(nome, corConfigurada)} 16%, transparent)`;
}

/** Borda um pouco mais opaca que o fundo — mesmo espírito visual dos badges
 *  semânticos (success/warning/danger) do resto do app. */
export function corDoServicoBorda(nome: string, corConfigurada?: string | null): string {
  return `color-mix(in srgb, ${corDoServico(nome, corConfigurada)} 40%, transparent)`;
}
