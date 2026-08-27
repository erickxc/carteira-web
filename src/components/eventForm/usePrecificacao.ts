import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { MargemPrecificacao, PrecificacaoItem } from '../../types';

/** Estado dos marcadores de produto precificado (tipo de evento "Precificação"). */
export function usePrecificacao(initial: PrecificacaoItem[] = []) {
  const [itens, setItens] = useState<PrecificacaoItem[]>(initial);
  const [produto, setProduto] = useState('');
  const [margem, setMargem] = useState<MargemPrecificacao>('subiu');

  function addItem() {
    const p = produto.trim();
    if (!p) return;
    setItens((prev) => [...prev, { id: uuidv4(), produto: p, margem }]);
    setProduto('');
  }
  const removeItem = (id: string) => setItens((prev) => prev.filter((i) => i.id !== id));

  return { itens, setItens, produto, setProduto, margem, setMargem, addItem, removeItem };
}
