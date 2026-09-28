import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

interface Pos { x: number; y: number; w: number; h: number }

/**
 * Fundo único que desliza até o item ativo de um seletor (abas, segmentos).
 * `seletor` acha o ativo dentro do container; o container precisa de
 * `position: relative`. Mede a cada render (barato, só atualiza se mudou) e
 * quando o container muda de tamanho.
 */
export function useIndicadorDeslizante<T extends HTMLElement>(seletor: string): [React.RefObject<T | null>, CSSProperties | null] {
  const ref = useRef<T>(null);
  const [pos, setPos] = useState<Pos | null>(null);

  const medir = useCallback(() => {
    const el = ref.current?.querySelector<HTMLElement>(seletor);
    const novo = el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null;
    setPos((atual) => (atual && novo && atual.x === novo.x && atual.y === novo.y && atual.w === novo.w && atual.h === novo.h ? atual : novo));
  }, [seletor]);

  useLayoutEffect(medir);
  useLayoutEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [medir]);

  return [ref, pos && { transform: `translate(${pos.x}px, ${pos.y}px)`, width: pos.w, height: pos.h }];
}
