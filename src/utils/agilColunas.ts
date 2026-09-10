import type { AgilColuna, AgilTarefa } from '../types';

// Colunas são texto livre (sem enum fixo), então "concluída" é inferida por
// palavra-chave no título — mesmo padrão de status_cliente/status_evento
// (eventoStatusBadge/clienteStatusBadge). Nunca quebra com uma coluna que
// nomeia diferente, só deixa de reconhecer aquele caso específico.
export const colunaConcluida = (titulo?: string) => /conclu|feito|pronto|final|done|entregue/i.test(titulo || '');

/**
 * Regra de negócio: uma Iniciativa (tarefa do board fixo de Iniciativas) não
 * pode ser movida pra uma coluna concluída enquanto houver tarefa vinculada
 * (`AgilTarefa.iniciativaId === iniciativaId`) COM PRAZO (`dueAt`) numa
 * coluna que NÃO é concluída — só compromisso com data assumida conta como
 * bloqueio; card de backlog/informal sem prazo não impede a conclusão.
 * Devolve o título da primeira tarefa pendente encontrada (pra mensagem de
 * erro), ou `null` se pode concluir.
 */
export function tarefaPendenteBloqueiaConclusao(
  iniciativaId: string,
  agilTarefas: AgilTarefa[],
  agilColunas: AgilColuna[]
): string | null {
  const pendente = agilTarefas.find((t) => {
    if (t.iniciativaId !== iniciativaId || !t.dueAt) return false;
    const coluna = agilColunas.find((c) => c.id === t.colunaId);
    return !colunaConcluida(coluna?.titulo);
  });
  return pendente?.titulo ?? null;
}

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
