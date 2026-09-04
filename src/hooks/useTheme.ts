import { useEffect, useRef, useState } from 'react';

export type Tema = 'claro' | 'escuro';
const KEY = 'tema';
/** Acima da duração da transição em index.css (.theme-switching, 320ms) —
 *  tirar a classe antes dela terminar corta o resto da troca de cor num
 *  degrau seco, voltando ao "flash" que a classe existe pra evitar. */
const DURACAO_CROSSFADE_MS = 360;

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
 *
 * Crossfade só quando o usuário TROCA de tema, via classe `.theme-switching`
 * TEMPORÁRIA — nunca uma transição CSS permanente em tudo (testada e
 * descartada: atrasa hover de botão/popover/linha de tabela o tempo todo,
 * pra resolver um efeito que só deveria acontecer nesse instante de clique).
 */
export function useTheme() {
  const [tema, setTema] = useState<Tema>(inicial);
  const primeiraAplicacao = useRef(true);

  useEffect(() => {
    const html = document.documentElement;
    // No primeiro efeito (mount) o tema já foi aplicado pelo script inline do
    // index.html — animar aqui faria o app "acender" a cada carregamento de
    // página, não só numa troca de verdade.
    const animar = !primeiraAplicacao.current
      && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    primeiraAplicacao.current = false;

    let timer: number | undefined;
    if (animar) {
      html.classList.add('theme-switching');
      timer = window.setTimeout(() => html.classList.remove('theme-switching'), DURACAO_CROSSFADE_MS);
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
