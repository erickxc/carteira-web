import { useCallback, useEffect, useRef, useState } from 'react';

/** Deve casar com a duração das animações `*-out` do index.css. */
const DURACAO_SAIDA_MS = 130;

function preferSemMovimento(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Fechamento com animação de saída para overlays (modal/popover).
 *
 * Renderização condicional pura (`{aberto && <Modal/>}`) desmonta o nó na hora,
 * então não existe estado em que a animação de saída possa rodar. Este hook
 * introduz esse estado: `fechando` liga a classe `.is-closing` (a animação
 * `*-out` do CSS roda) e só depois de `DURACAO_SAIDA_MS` o `onClose` do pai
 * desmonta de fato.
 *
 * Fechar programaticamente pelo pai (ex.: modal que fecha ao salvar) continua
 * desmontando direto, sem animação — é o comportamento esperado ali.
 */
export function useFecharAnimado(onClose: () => void) {
  const [fechando, setFechando] = useState(false);
  const timerRef = useRef<number | null>(null);

  // Limpa o timer se o componente sair antes dele disparar (ex.: pai desmontou
  // por outro caminho) — senão o onClose rodaria depois do unmount.
  useEffect(() => () => { if (timerRef.current !== null) window.clearTimeout(timerRef.current); }, []);

  const fechar = useCallback(() => {
    // Sem animação (preferência do usuário) não faz sentido atrasar o fechamento.
    if (preferSemMovimento()) { onClose(); return; }
    if (timerRef.current !== null) return; // já fechando: ignora clique/ESC repetido
    setFechando(true);
    timerRef.current = window.setTimeout(onClose, DURACAO_SAIDA_MS);
  }, [onClose]);

  return { fechando, fechar };
}
