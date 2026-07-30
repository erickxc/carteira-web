import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { OrientacaoItem, PreAnalise } from '../../types';

/** Estado da pré-análise (preparação da reunião): orientações por cliente/produto. */
export function usePreAnalise(initial?: PreAnalise) {
  const [orientacoes, setOrientacoes] = useState<OrientacaoItem[]>(initial?.orientacoes ?? []);
  const [clientesGeral, setClientesGeral] = useState(initial?.clientesGeral ?? '');
  const [produtosGeral, setProdutosGeral] = useState(initial?.produtosGeral ?? '');

  const addOrientacao = () => setOrientacoes((prev) => [...prev, { id: uuidv4(), cliente: '', produto: '', orientacao: '' }]);
  const updOrientacao = (id: string, campo: keyof OrientacaoItem, valor: string) =>
    setOrientacoes((prev) => prev.map((o) => (o.id === id ? { ...o, [campo]: valor } : o)));
  const removeOrientacao = (id: string) => setOrientacoes((prev) => prev.filter((o) => o.id !== id));

  const preAnalise: PreAnalise = { orientacoes, clientesGeral, produtosGeral };

  return { orientacoes, clientesGeral, setClientesGeral, produtosGeral, setProdutosGeral, addOrientacao, updOrientacao, removeOrientacao, preAnalise };
}
