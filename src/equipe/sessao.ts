/**
 * Login por equipe — só para separar a VISUALIZAÇÃO (pedido do usuário, 30/10/2026:
 * "não precisa proteger"). Não é segurança: usuário e senha ficam no próprio bundle
 * e a API continua aberta na LAN. A sessão dura até clicar em "Sair".
 */
export type Equipe = 'negocios' | 'fiscal' | 'admin';

export const NOME_EQUIPE: Record<Equipe, string> = {
  negocios: 'Negócios',
  fiscal: 'Fiscal',
  admin: 'Gestão',
};

// Usuário = senha = nome da equipe (decisão do usuário).
const LOGINS: Record<string, Equipe> = { negocios: 'negocios', fiscal: 'fiscal', admin: 'admin' };

const CHAVE = 'sessao:equipe';

const normalizar = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Devolve a equipe se usuário e senha baterem; senão null. Aceita "Negócios" com acento/maiúscula. */
export function autenticar(usuario: string, senha: string): Equipe | null {
  const equipe = LOGINS[normalizar(usuario)];
  return equipe && senha.trim() === equipe ? equipe : null;
}

export function lerSessao(): Equipe | null {
  try {
    const v = window.localStorage.getItem(CHAVE);
    return v && Object.hasOwn(NOME_EQUIPE, v) ? (v as Equipe) : null;
  } catch {
    return null;
  }
}

export function salvarSessao(equipe: Equipe | null) {
  try {
    if (equipe) window.localStorage.setItem(CHAVE, equipe);
    else window.localStorage.removeItem(CHAVE);
  } catch { /* localStorage indisponível — a sessão só não persiste */ }
}
