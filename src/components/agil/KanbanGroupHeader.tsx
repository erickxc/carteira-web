import type { CSSProperties } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Pencil, Plus } from 'lucide-react';
import clsx from 'clsx';
import type { AgilColuna } from '../../types';

interface KanbanGroupHeaderProps {
  coluna: AgilColuna;
  /** Soma das tarefas de todas as sub-colunas. */
  totalTarefas: number;
  /** Grupo encerra na última coluna do board: sem borda à direita. */
  ultimaColuna: boolean;
  /** false quando este cabeçalho é uma CÓPIA repetida (swimlanes 2ª em diante). */
  arrastavel: boolean;
  style: CSSProperties;
  onEdit: () => void;
  onAddSub: () => void;
}

const BOTAO_ICONE =
  'shrink-0 flex items-center justify-center w-[18px] h-[18px] rounded-[4px] text-text-muted bg-transparent border-none cursor-pointer transition-colors hover:bg-card hover:text-text-primary';

/**
 * Cabeçalho de uma coluna agrupadora — abrange as sub-colunas dela (linha 1 do
 * cabeçalho). O WIP limit aqui vale para o grupo inteiro (CONWIP): conta a soma
 * das tarefas das sub-colunas.
 */
export function KanbanGroupHeader({ coluna, totalTarefas, ultimaColuna, arrastavel, style, onEdit, onAddSub }: KanbanGroupHeaderProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: coluna.id,
    data: { type: 'coluna', parentId: '' },
    disabled: !arrastavel,
  });

  const estilo: CSSProperties = {
    ...style,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const excedeu = !!coluna.wipLimit && totalTarefas > coluna.wipLimit;
  // Sem `ref` na cópia: evita duas instâncias do dnd-kit registrando o mesmo
  // id de coluna (ver mesma nota em KanbanColumnHeader).
  const refDrag = arrastavel ? setNodeRef : undefined;

  return (
    <div
      ref={refDrag}
      style={estilo}
      className={clsx(
        'group flex items-center gap-1 px-2 border-t-2 border-b border-border bg-card-hover',
        !ultimaColuna && 'border-r',
        excedeu ? 'border-t-danger' : 'border-t-accent'
      )}
    >
      <span
        {...(arrastavel ? attributes : {})}
        {...(arrastavel ? listeners : {})}
        className={clsx(
          'flex-1 text-center text-[0.71rem] font-semibold uppercase tracking-[0.06em] text-text-primary truncate select-none',
          arrastavel && 'cursor-grab'
        )}
        title={coluna.titulo}
      >
        {coluna.titulo}
      </span>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onAddSub} className={BOTAO_ICONE} title="Nova sub-coluna">
          <Plus size={12} />
        </button>
        <button onClick={onEdit} className={BOTAO_ICONE} title="Editar coluna">
          <Pencil size={11} />
        </button>
      </div>

      <span
        className={clsx(
          'shrink-0 min-w-[18px] px-1 text-center rounded-full text-[0.64rem] font-semibold tabular-nums',
          excedeu ? 'bg-[var(--danger-bg)] text-danger' : 'bg-bg text-text-muted'
        )}
        title={coluna.wipLimit ? `${totalTarefas} de ${coluna.wipLimit} (limite WIP do grupo)` : `${totalTarefas} tarefa(s)`}
      >
        {totalTarefas}{coluna.wipLimit ? `/${coluna.wipLimit}` : ''}
      </span>
    </div>
  );
}
