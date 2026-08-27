import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ProdutoSituacaoItem } from '../../types';

/** Estado da tabela "Produtos — Situação" (serviço Monitoria, dentro de uma Reunião). */
export function useProdutosSituacao(initial: ProdutoSituacaoItem[] = []) {
  const [itens, setItens] = useState<ProdutoSituacaoItem[]>(initial);
  const [produto, setProduto] = useState('');
  const [cliente, setCliente] = useState('');
  const [situacao, setSituacao] = useState('');

  function addItem() {
    const p = produto.trim();
    const s = situacao.trim();
    if (!p || !s) return;
    setItens((prev) => [...prev, { id: uuidv4(), produto: p, cliente: cliente.trim() || undefined, situacao: s }]);
    setProduto('');
    setCliente('');
    setSituacao('');
  }
  const removeItem = (id: string) => setItens((prev) => prev.filter((i) => i.id !== id));

  return { itens, setItens, produto, setProduto, cliente, setCliente, situacao, setSituacao, addItem, removeItem };
}
