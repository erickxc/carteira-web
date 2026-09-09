const CHAVE_DESBLOQUEADAS = 'agil:areasDesbloqueadas';

function lerDesbloqueadas(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(CHAVE_DESBLOQUEADAS) ?? '[]'));
  } catch {
    return new Set();
  }
}

/** Desbloqueio dura a aba (sessionStorage) — PIN é barreira leve de UI, não
 *  segurança real (ver AgilWorkspace.senha em src/types/index.ts). */
export function desbloquearWorkspace(id: string) {
  const atual = lerDesbloqueadas();
  atual.add(id);
  try { sessionStorage.setItem(CHAVE_DESBLOQUEADAS, JSON.stringify([...atual])); } catch { /* sessionStorage indisponível — segue sem persistir */ }
}

export function workspaceDesbloqueada(id: string): boolean {
  return lerDesbloqueadas().has(id);
}
