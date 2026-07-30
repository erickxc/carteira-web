import { useEffect, useRef, useState } from 'react';

/**
 * useState que persiste o valor no localStorage — os filtros escolhidos
 * sobrevivem à navegação entre páginas e a recarregar o navegador.
 * Use uma `key` estável e única por filtro (ex.: 'filtro:clientes:status').
 */
export function usePersistedState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const raw = window.localStorage.getItem(key);
      return raw != null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  // Evita reescrever no primeiro render (valor recém-lido) e ignora troca de key.
  const keyRef = useRef(key);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* localStorage cheio/indisponível — ignora, filtro só não persiste */
    }
    keyRef.current = key;
  }, [key, state]);

  return [state, setState];
}
