import { useState } from 'react';
import { useDebouncedValue } from './useDebouncedValue';

/**
 * Estado de um campo de busca textual com debounce — padrão repetido em toda
 * página com filtro de texto (ClientesPage, AcoesPage): o input precisa
 * responder na hora (`value`), mas o filtro só deve recalcular depois de
 * parar de digitar (`debounced`).
 */
export function useSearchFilter(initial = '', delay = 200) {
  const [value, setValue] = useState(initial);
  const debounced = useDebouncedValue(value, delay);
  return { value, debounced, setValue } as const;
}
