import type { AgilColuna } from '../types';

export interface HierarquiaColunas {
  /** Colunas de topo (sem pai), em ordem. */
  topo: AgilColuna[];
  /** Sub-colunas por id do pai, em ordem. */
  filhosPorPai: Map<string, AgilColuna[]>;
  /** Colunas-folha na ordem visual — as ÚNICAS que recebem tarefas. */
  folhas: AgilColuna[];
  /** id da folha → índice da coluna no grid (1-based, pronto para grid-column). */
  trackPorFolha: Map<string, number>;
  /** id da folha → rótulo legível ("Pai › Filho" quando é sub-coluna). */
  rotuloPorFolha: Map<string, string>;
}

/**
 * Monta a hierarquia de colunas de um board (2 níveis: topo + sub-colunas),
 * derivando a ordem visual das folhas e o índice de cada uma no grid.
 * Usado pelo board (layout) e pelo modal de tarefa (seleção de coluna válida) —
 * as duas visões precisam concordar sobre o que é folha.
 */
export function montarHierarquiaColunas(colunas: AgilColuna[]): HierarquiaColunas {
  const porOrdem = (a: AgilColuna, b: AgilColuna) => a.ordem - b.ordem;
  const topo = colunas.filter((c) => !c.parentId).sort(porOrdem);

  const filhosPorPai = new Map<string, AgilColuna[]>();
  colunas.forEach((c) => {
    if (!c.parentId) return;
    if (!filhosPorPai.has(c.parentId)) filhosPorPai.set(c.parentId, []);
    filhosPorPai.get(c.parentId)!.push(c);
  });
  filhosPorPai.forEach((lista) => lista.sort(porOrdem));

  const folhas: AgilColuna[] = [];
  const rotuloPorFolha = new Map<string, string>();
  topo.forEach((c) => {
    const filhos = filhosPorPai.get(c.id) ?? [];
    if (filhos.length === 0) {
      folhas.push(c);
      rotuloPorFolha.set(c.id, c.titulo);
    } else {
      filhos.forEach((f) => {
        folhas.push(f);
        rotuloPorFolha.set(f.id, `${c.titulo} › ${f.titulo}`);
      });
    }
  });

  const trackPorFolha = new Map(folhas.map((f, i) => [f.id, i + 1]));

  return { topo, filhosPorPai, folhas, trackPorFolha, rotuloPorFolha };
}
