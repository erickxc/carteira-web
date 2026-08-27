import type { CSSProperties } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import clsx from 'clsx';
import { TaskCard } from './TaskCard';
import type { AgilTarefa } from '../../types';

interface KanbanCellProps {
  colunaId: string;
  swimlaneId: string;
  tarefas: AgilTarefa[];
  colapsada: boolean;
  /** Coluna com WIP estourado — destaca a célula toda, como no Kanbanize. */
  wipExcedido: boolean;
  /** Última coluna do board: sem borda à direita (a moldura do board já fecha). */
  ultimaColuna: boolean;
  style: CSSProperties;
  onNovaTarefa: () => void;
  onEditTarefa: (t: AgilTarefa) => void;
}

export function KanbanCell({
  colunaId, swimlaneId, tarefas, colapsada, wipExcedido, ultimaColuna, style, onNovaTarefa, onEditTarefa,
}: KanbanCellProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cell-${colunaId}-${swimlaneId}`,
    data: { type: 'celula', colunaId, swimlaneId },
  });

  if (colapsada) {
    return (
      <div
        style={style}
        className={clsx('flex items-start justify-center px-1 py-2 border-b border-border bg-bg', !ultimaColuna && 'border-r')}
      >
        <span className="text-[0.66rem] text-text-muted tabular-nums">{tarefas.length || ''}</span>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        'group/cell flex flex-col gap-2 p-2 border-b border-border min-h-[72px] transition-colors duration-150',
        !ultimaColuna && 'border-r',
        isOver ? 'bg-accent-soft' : wipExcedido ? 'bg-[var(--danger-bg)]' : 'bg-bg'
      )}
    >
      <SortableContext items={tarefas.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        {tarefas.map((t) => <TaskCard key={t.id} tarefa={t} onClick={() => onEditTarefa(t)} />)}
      </SortableContext>

      <button
        onClick={onNovaTarefa}
        title="Nova tarefa"
        className={clsx(
          'flex items-center justify-center gap-1 py-1 rounded-sm text-[0.68rem] text-text-muted bg-transparent',
          'border border-dashed border-transparent cursor-pointer transition-[opacity,color,border-color] duration-150',
          'opacity-0 group-hover/cell:opacity-100 hover:text-accent hover:border-border-strong focus-visible:opacity-100'
        )}
      >
        <Plus size={12} /> Tarefa
      </button>
    </div>
  );
}
