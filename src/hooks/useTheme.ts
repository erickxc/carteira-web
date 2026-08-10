import { useEffect, useRef, useState } from 'react';

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
  const primeiraAplicacao = useRef(true);

  useEffect(() => {
    const html = document.documentElement;
    // Crossfade só quando o usuário TROCA de tema. No primeiro efeito (mount) o
    // tema já foi aplicado pelo script inline do index.html — animar aqui faria
    // o app "acender" a cada carregamento de página.
    const animar = !primeiraAplicacao.current
      && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    primeiraAplicacao.current = false;

    let timer: number | undefined;
    if (animar) {
      html.classList.add('theme-switching');
      // Precisa passar da duração da transição no CSS (200ms), senão a classe
      // sai no meio do caminho e o resto da mudança de cor vira um corte seco.
      timer = window.setTimeout(() => html.classList.remove('theme-switching'), 260);
    }

    html.dataset.theme = tema === 'claro' ? 'light' : 'dark';
    try {
      localStorage.setItem(KEY, tema);
    } catch {
      /* ignore */
    }

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      // Desmontar no meio do crossfade deixaria a classe (e o `!important`)
      // grudada no <html> para sempre.
      if (animar) html.classList.remove('theme-switching');
    };
  }, [tema]);

  return { tema, setTema };
}
