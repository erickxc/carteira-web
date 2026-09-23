import {
  CHAVE_MOSTRAR_AVISO, PARAM_PREFS, desempacotarPrefs, destinoDoEndereco, ehEnderecoDoExe, empacotarPrefs, estaNoEnderecoPorNome, prefsParaGravar,
} from './regras';

const TIMEOUT_MS = 1500;

function comTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => window.clearTimeout(timer));
}

function receberPrefsDaUrl(): void {
  const pacote = new URLSearchParams(window.location.hash.slice(1)).get(PARAM_PREFS);
  if (pacote === null) return;
  const gravar = prefsParaGravar(desempacotarPrefs(pacote), (k) => localStorage.getItem(k) !== null);
  Object.entries(gravar).forEach(([k, v]) => localStorage.setItem(k, v));
  if (estaNoEnderecoPorNome(window.location)) localStorage.setItem(CHAVE_MOSTRAR_AVISO, '1');
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

function todasAsPrefs(): Record<string, string> {
  const prefs: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k !== null && k !== CHAVE_MOSTRAR_AVISO) prefs[k] = localStorage.getItem(k) ?? '';
  }
  return prefs;
}

/** Roda antes do app montar. 'redirecionando' = não renderizar (a página vai trocar de endereço). */
export async function iniciarEnderecoLocal(): Promise<'seguir' | 'redirecionando'> {
  receberPrefsDaUrl();
  if (import.meta.env.DEV || !ehEnderecoDoExe(window.location)) return 'seguir';

  try {
    const resp = await comTimeout('/api/sistema/endereco');
    if (!resp.ok) return 'seguir';
    const { abrirPorNome } = (await resp.json()) as { abrirPorNome: boolean };
    const destino = destinoDoEndereco(window.location, abrirPorNome ? 'nome' : 'ip');
    if (!destino) return 'seguir';

    // Navegador que não entende *.localhost: fica no endereço atual em vez de cair numa tela de erro.
    await comTimeout(`${destino}/api/sistema/endereco`, { mode: 'no-cors' });

    const hash = `#${PARAM_PREFS}=${empacotarPrefs(todasAsPrefs())}`;
    window.location.replace(destino + window.location.pathname + window.location.search + hash);
    return 'redirecionando';
  } catch {
    return 'seguir';
  }
}
