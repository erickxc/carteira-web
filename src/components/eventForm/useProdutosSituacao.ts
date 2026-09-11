import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { DirecaoSituacao, ModoProdutoSituacao, ProdutoSituacaoItem } from '../../types';

/**
 * Estado da tabela "Registro da Monitoria" (serviço Monitoria, dentro de uma
 * Reunião). Três modos de registro (pedido do usuário): só cliente final, só
 * produto, ou os dois juntos — o que faltava era justamente o modo "só
 * cliente" (antes o produto era obrigatório, então não dava pra registrar
 * "Comac encerrou operação" sem inventar um produto).
 */
export function useProdutosSituacao(initial: ProdutoSituacaoItem[] = [], modoInicial: ModoProdutoSituacao = 'cliente_produto') {
  const [itens, setItens] = useState<ProdutoSituacaoItem[]>(initial);
  const [modo, setModo] = useState<ModoProdutoSituacao>(modoInicial);
  const [produto, setProduto] = useState('');
  const [cliente, setCliente] = useState('');
  // Substituiu o texto livre de "situação": aumento/queda, obrigatório pra
  // liberar o botão de adicionar (mesma regra que o texto livre tinha antes).
  const [direcao, setDirecao] = useState<DirecaoSituacao | null>(null);
  const [observacao, setObservacao] = useState('');
  // Grupo referência (G1/G2/G3) é do CLIENTE FINAL — opcional, só existe
  // quando o modo inclui cliente. (Tag foi removida — pedido do usuário.)
  const [grupo, setGrupo] = useState('');

  const precisaProduto = modo !== 'cliente';
  const precisaCliente = modo !== 'produto';

  /** Falta algo pro modo escolhido? Usado pra desabilitar o botão de adicionar. */
  const incompleto = !direcao
    || (precisaProduto && !produto.trim())
    || (precisaCliente && !cliente.trim());

  function trocarModo(novo: ModoProdutoSituacao) {
    setModo(novo);
    // Limpa o campo que o modo novo não usa — senão um valor invisível seria
    // gravado junto (ex.: trocar pra "só produto" e o cliente digitado antes
    // continuar indo no item).
    if (novo === 'cliente') setProduto('');
    if (novo === 'produto') { setCliente(''); setGrupo(''); }
  }

  /**
   * Cliente/grupo NÃO são limpos aqui de propósito (pedido do usuário): o
   * grupo referência é do cliente, não do produto, e digitar o mesmo cliente
   * de novo pra cada produto que ele comprou/deixou de comprar era o
   * problema relatado ("não tem como eu ficar criando toda hora uma linha
   * nova"). Só produto/direção/observação (o que muda por PRODUTO) são
   * limpos — cliente/grupo ficam prontos pro próximo produto do MESMO
   * cliente. Trocar de cliente é só sobrescrever o campo (digitar outro nome).
   */
  function addItem() {
    if (incompleto) return;
    setItens((prev) => [...prev, {
      id: uuidv4(),
      produto: precisaProduto ? produto.trim() : undefined,
      cliente: precisaCliente ? cliente.trim() : undefined,
      direcao: direcao ?? undefined,
      observacao: observacao.trim() || undefined,
      grupo: precisaCliente && grupo ? grupo : undefined,
    }]);
    setProduto('');
    setDirecao(null);
    setObservacao('');
  }
  const removeItem = (id: string) => setItens((prev) => prev.filter((i) => i.id !== id));

  return {
    itens, setItens,
    modo, trocarModo, precisaProduto, precisaCliente, incompleto,
    produto, setProduto, cliente, setCliente, direcao, setDirecao, observacao, setObservacao, grupo, setGrupo,
    addItem, removeItem,
  };
}
