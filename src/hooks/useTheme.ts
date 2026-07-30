import { useEffect, useState } from 'react';

export type Tema = 'claro' | 'escuro';
const KEY = 'tema';

function inicial(): Tema {
  try {
    return localStorage.getItem(KEY) === 'claro' ? 'claro' : 'escuro';
  } catch {
    return 'escuro';
  }
}

/**
 * Tema claro/escuro persistido em localStorage. Aplica `data-theme` em <html>
 * (light/dark) — os tokens do index.css (`:root[data-theme="light"]`) fazem o
 * resto. Padrão: escuro (identidade atual). O flash inicial já é evitado pelo
 * script inline no index.html; este hook mantém em sincronia após o mount.
 */
export function useTheme() {
  const [tema, setTema] = useState<Tema>(inicial);

  useEffect(() => {
    document.documentElement.dataset.theme = tema === 'claro' ? 'light' : 'dark';
    try {
      localStorage.setItem(KEY, tema);
    } catch {
      /* ignore */
    }
  }, [tema]);

  return { tema, setTema };
}
