import { renomearProduto } from 'carteira-shared/produtos.cjs';
import type { Cliente, ProdutoHistoricoItem, StatusHistoricoItem } from '../types';

/** Agrupa por chave mantendo a ordem de chegada. */
function agrupar<T>(itens: T[], chave: (i: T) => string): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const i of itens) {
    const k = chave(i);
    const lista = mapa.get(k);
    if (lista) lista.push(i); else mapa.set(k, [i]);
  }
  return mapa;
}

/** Última linha com `mudouEm <= limite`, ou null. */
function vigenteEm<T extends { mudouEm: string }>(linhas: T[], limite: number): T | null {
  let vigente: T | null = null;
  for (const h of linhas) {
    const t = new Date(h.mudouEm).getTime();
    if (t <= limite && (!vigente || t > new Date(vigente.mudouEm).getTime())) vigente = h;
  }
  return vigente;
}

/**
 * Produtos do cliente como estavam em `limite` (log ProdutosHistorico):
 * `servicos` = os Ativos naquela data; `produtos` com a fase/desde da época
 * (o relógio "nunca atendido" parte do `faseDesde` do produto Ativo).
 * Sem linha no log, o cliente fica com os produtos de hoje.
 */
function comProdutosEm(c: Cliente, linhas: ProdutoHistoricoItem[] | undefined, limite: number): Cliente {
  if (!linhas) return c;
  const naData = new Map<string, ProdutoHistoricoItem>();
  for (const [produto, doProduto] of agrupar(linhas, (h) => renomearProduto(h.produto))) {
    const v = vigenteEm(doProduto, limite);
    if (v) naData.set(produto, v);
  }
  const servicos = [...naData].filter(([, v]) => v.fase === 'Ativo').map(([produto]) => produto);
  const produtos = c.produtos?.map((p) => {
    const v = naData.get(renomearProduto(p.produto));
    return v ? { ...p, fase: v.fase, faseDesde: v.mudouEm } : p;
  });
  return { ...c, servicos, ...(produtos ? { produtos } : {}) };
}

/**
 * A carteira como estava em `dataRef`: cada cliente com o status/estado/pausa
 * vigentes naquela data (última linha do log com `mudouEm <= dataRef`).
 * - Cliente com linhas, mas todas depois de `dataRef`: ainda não existia → fora.
 * - Cliente sem linha nenhuma (log ainda não o alcançou): fica como está hoje,
 *   melhor que sumir da conta.
 * Com `produtosHistorico`, refaz também os produtos Ativos na data — cancelar
 * um produto hoje não o tira dos meses em que estava Ativo.
 */
export function clientesEm(
  clientes: Cliente[],
  historico: StatusHistoricoItem[],
  dataRef: Date,
  produtosHistorico?: ProdutoHistoricoItem[],
): Cliente[] {
  const limite = dataRef.getTime();
  const porCliente = agrupar(historico, (h) => h.clientId);
  const produtosPorCliente = agrupar(produtosHistorico ?? [], (h) => h.clientId);

  const resultado: Cliente[] = [];
  for (const c of clientes) {
    const linhas = porCliente.get(c.id);
    let naData: Cliente | null = c;
    if (linhas) {
      const vigente = vigenteEm(linhas, limite);
      naData = vigente
        ? { ...c, status: vigente.status, estado: vigente.estado as Cliente['estado'], pausadoAte: vigente.pausadoAte || undefined }
        : null;
    }
    if (naData) resultado.push(comProdutosEm(naData, produtosPorCliente.get(c.id), limite));
  }
  return resultado;
}
