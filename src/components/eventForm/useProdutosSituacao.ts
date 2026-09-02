import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ModoProdutoSituacao, ProdutoSituacaoItem } from '../../types';

/**
 * Estado da tabela "Registro da Monitoria" (serviço Monitoria, dentro de uma
 * Reunião). Três modos de registro (pedido do usuário): só cliente final, só
 * produto, ou os dois juntos — o que faltava era justamente o modo "só
 * cliente" (antes o produto era obrigatório, então não dava pra registrar
 * "Comac encerrou operação" sem inventar um produto).
 */
export function useProdutosSituacao(initial: ProdutoSituacaoItem[] = []) {
  const [itens, setItens] = useState<ProdutoSituacaoItem[]>(initial);
  const [modo, setModo] = useState<ModoProdutoSituacao>('cliente_produto');
  const [produto, setProduto] = useState('');
  const [cliente, setCliente] = useState('');
  const [situacao, setSituacao] = useState('');

  const precisaProduto = modo !== 'cliente';
  const precisaCliente = modo !== 'produto';

  /** Falta algo pro modo escolhido? Usado pra desabilitar o botão de adicionar. */
  const incompleto = !situacao.trim()
    || (precisaProduto && !produto.trim())
    || (precisaCliente && !cliente.trim());

  function trocarModo(novo: ModoProdutoSituacao) {
    setModo(novo);
    // Limpa o campo que o modo novo não usa — senão um valor invisível seria
    // gravado junto (ex.: trocar pra "só produto" e o cliente digitado antes
    // continuar indo no item).
    if (novo === 'cliente') setProduto('');
    if (novo === 'produto') setCliente('');
  }

  function addItem() {
    if (incompleto) return;
    setItens((prev) => [...prev, {
      id: uuidv4(),
      produto: precisaProduto ? produto.trim() : undefined,
      cliente: precisaCliente ? cliente.trim() : undefined,
      situacao: situacao.trim(),
    }]);
    setProduto('');
    setCliente('');
    setSituacao('');
  }
  const removeItem = (id: string) => setItens((prev) => prev.filter((i) => i.id !== id));

  return {
    itens, setItens,
    modo, trocarModo, precisaProduto, precisaCliente, incompleto,
    produto, setProduto, cliente, setCliente, situacao, setSituacao,
    addItem, removeItem,
  };
}
