// Porta do backend local aberto pelo .exe — precisa bater com server/config.cjs e launcher/config.cjs.
const PORTA_EXE = '3011';
const HOSTS_POR_IP = new Set(['127.0.0.1', 'localhost']);
const HOST_POR_NOME = 'carteira-2d.localhost';

const ENDERECO_POR_IP = `http://127.0.0.1:${PORTA_EXE}`;
/** Endereço mostrado a quem usa (popup de aviso). */
export const ENDERECO_POR_NOME = `http://${HOST_POR_NOME}:${PORTA_EXE}`;

/** Parâmetro do `#` da URL que carrega as preferências entre os dois endereços. */
export const PARAM_PREFS = 'migrar-prefs';
/** Chave do localStorage que pede o popup de aviso na próxima montagem do app. */
export const CHAVE_MOSTRAR_AVISO = 'carteira2d:mostrarAvisoEndereco';
/** "Não mostrar novamente": o .exe redireciona a cada abertura, então sem isto o aviso voltava sempre. */
export const CHAVE_AVISO_DISPENSADO = 'carteira2d:avisoEnderecoDispensado';

export type FormaDeAbrir = 'nome' | 'ip';

type Local = { hostname: string; port: string };

/** A página foi servida pelo backend do .exe? (não pelo Apache 8080 nem pelo Vite 5173) */
export function ehEnderecoDoExe(loc: Local): boolean {
  return loc.port === PORTA_EXE && (HOSTS_POR_IP.has(loc.hostname) || loc.hostname === HOST_POR_NOME);
}

export function estaNoEnderecoPorNome(loc: { hostname: string }): boolean {
  return loc.hostname === HOST_POR_NOME;
}

/** Pra onde a página deve ir, ou null se já está no endereço escolhido (ou fora do .exe). */
export function destinoDoEndereco(loc: Local, forma: FormaDeAbrir): string | null {
  if (!ehEnderecoDoExe(loc)) return null;
  const estaPorNome = estaNoEnderecoPorNome(loc);
  if (forma === 'nome' && !estaPorNome) return ENDERECO_POR_NOME;
  if (forma === 'ip' && estaPorNome) return ENDERECO_POR_IP;
  return null;
}

// base64url sobre UTF-8: `btoa` sozinho quebra com acento/emoji (conversa do monitorIA).
export function empacotarPrefs(prefs: Record<string, string>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(prefs));
  let binario = '';
  bytes.forEach((b) => { binario += String.fromCharCode(b); });
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function desempacotarPrefs(pacote: string): Record<string, string> {
  try {
    const binario = atob(pacote.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
    const obj: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
  } catch {
    return {};
  }
}

/** Só o que ainda não existe no destino: a migração nunca sobrescreve uma preferência. */
export function prefsParaGravar(vindas: Record<string, string>, jaExiste: (chave: string) => boolean): Record<string, string> {
  return Object.fromEntries(Object.entries(vindas).filter(([k]) => !jaExiste(k)));
}
