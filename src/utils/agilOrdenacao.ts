import type { AgilOrdenacao, AgilTarefa } from '../types';

export const ORDENACAO_OPCOES: { value: AgilOrdenacao; label: string }[] = [
  { value: 'manual', label: 'Manual (arraste)' },
  { value: 'prioridade', label: 'Prioridade' },
  { value: 'prazo', label: 'Prazo' },
  { value: 'criacao', label: 'Criação' },
];

// Maior = mais urgente. Prioridade é texto livre (Categorias), então
// reconhecemos pelas palavras-chave já usadas no resto do módulo
// (PRIORIDADE_BARRA/PRIORIDADE_TEXTO em TaskCard/TaskDetailModal) — tarefa
// sem prioridade ou com um valor não reconhecido cai no fim.
function rankPrioridade(prioridade?: string): number {
  const p = (prioridade ?? '').toLowerCase();
  if (p.includes('urgente')) return 4;
  if (p.includes('alta')) return 3;
  if (p.includes('média') || p.includes('media')) return 2;
  if (p.includes('baixa')) return 1;
  return 0;
}

/** Ordena as tarefas de UMA célula (já filtradas por coluna) conforme o modo
 *  escolhido no board. 'manual' preserva a ordem de arraste (`ordem`). */
export function ordenarTarefasDaCelula(tarefas: AgilTarefa[], modo: AgilOrdenacao | undefined): AgilTarefa[] {
  const lista = [...tarefas];
  switch (modo) {
    case 'prioridade':
      return lista.sort((a, b) => rankPrioridade(b.prioridade) - rankPrioridade(a.prioridade) || a.ordem - b.ordem);
    case 'prazo':
      return lista.sort((a, b) => {
        if (!a.dueAt && !b.dueAt) return a.ordem - b.ordem;
        if (!a.dueAt) return 1;
        if (!b.dueAt) return -1;
        return a.dueAt.localeCompare(b.dueAt) || a.ordem - b.ordem;
      });
    case 'criacao':
      return lista.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.ordem - b.ordem);
    case 'manual':
    default:
      return lista.sort((a, b) => a.ordem - b.ordem);
  }
}
