import type { CSSProperties } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, Pencil, SplitSquareHorizontal } from 'lucide-react';
import clsx from 'clsx';
import type { AgilColuna } from '../../types';

interface KanbanColumnHeaderProps {
  coluna: AgilColuna;
  totalTarefas: number;
  colapsada: boolean;
  /** Coluna de topo sem sub-colunas ocupa as duas linhas do cabeçalho. */
  ocupaDuasLinhas: boolean;
  /** Última coluna do board: sem borda à direita. */
  ultimaColuna: boolean;
  /** false quando este cabeçalho é uma CÓPIA repetida (swimlanes 2ª em diante
   *  — colunas são as mesmas do board, repetidas visualmente por swimlane).
   *  A cópia não é arrastável: evita duas instâncias do dnd-kit disputando o
   *  mesmo id de coluna. Reordenar sempre pela primeira swimlane. */
  arrastavel: boolean;
  style: CSSProperties;
  onToggleColapso: () => void;
  onEdit: () => void;
  /** Só em coluna de topo: cria a primeira sub-coluna (vira agrupadora). */
  onAddSub?: () => void;
}

const BOTAO_ICONE =
  'shrink-0 flex items-center justify-center w-[18px] h-[18px] rounded-[4px] text-text-muted bg-transparent border-none cursor-pointer transition-colors hover:bg-card hover:text-text-primary';

export function KanbanColumnHeader({
  coluna, totalTarefas, colapsada, ocupaDuasLinhas, ultimaColuna, arrastavel, style, onToggleColapso, onEdit, onAddSub,
}: KanbanColumnHeaderProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: coluna.id,
    data: { type: 'coluna', parentId: coluna.parentId ?? '' },
    disabled: !arrastavel,
  });

  const estilo: CSSProperties = {
    ...style,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const excedeu = !!coluna.wipLimit && totalTarefas > coluna.wipLimit;

  const contador = (
    <span
      className={clsx(
        'shrink-0 min-w-[18px] px-1 text-center rounded-full text-[0.64rem] font-semibold tabular-nums',
        excedeu ? 'bg-[var(--danger-bg)] text-danger' : 'bg-bg text-text-muted'
      )}
      title={coluna.wipLimit ? `${totalTarefas} de ${coluna.wipLimit} (limite WIP)` : `${totalTarefas} tarefa(s)`}
    >
      {totalTarefas}{coluna.wipLimit ? `/${coluna.wipLimit}` : ''}
    </span>
  );

  // Ref só é anexada quando arrastável: se duas cópias (uma por swimlane)
  // registrassem o MESMO id de coluna no dnd-kit, a medição de colisão do
  // drag ficaria ambígua. Sem `ref`, a cópia nunca se registra — só existe
  // visualmente.
  const refDrag = arrastavel ? setNodeRef : undefined;

  if (colapsada) {
    return (
      <div
        ref={refDrag}
        style={estilo}
        className={clsx(
          'flex flex-col items-center gap-1.5 py-2 border-b border-border bg-card-hover',
          !ultimaColuna && 'border-r',
          ocupaDuasLinhas ? 'border-t-2' : 'border-t',
          excedeu ? 'border-t-danger' : ocupaDuasLinhas ? 'border-t-accent' : 'border-t-border'
        )}
      >
        <button onClick={onToggleColapso} className={BOTAO_ICONE} title="Expandir coluna">
          <ChevronRight size={13} />
        </button>
        {contador}
        <span className="text-[0.7rem] font-semibold tracking-[0.02em] text-text-primary whitespace-nowrap" style={{ writingMode: 'vertical-rl' }}>
          {coluna.titulo}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={refDrag}
      style={estilo}
      className={clsx(
        'group flex items-center gap-1 px-2 border-b border-border',
        !ultimaColuna && 'border-r',
        ocupaDuasLinhas ? 'border-t-2 bg-card-hover' : 'border-t bg-card',
        excedeu ? 'border-t-danger' : ocupaDuasLinhas ? 'border-t-accent' : 'border-t-border'
      )}
    >
      <button onClick={onToggleColapso} className={BOTAO_ICONE} title="Recolher coluna">
        <ChevronDown size={13} />
      </button>

      {/* O título é a alça de arraste (reordenar entre irmãs) — só na cópia
          arrastável (1ª swimlane); nas demais é só um rótulo. */}
      <span
        {...(arrastavel ? attributes : {})}
        {...(arrastavel ? listeners : {})}
        className={clsx(
          'flex-1 text-center text-[0.71rem] font-semibold uppercase tracking-[0.04em] text-text-primary truncate select-none',
          arrastavel && 'cursor-grab'
        )}
        title={coluna.titulo}
      >
        {coluna.titulo}
      </span>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {onAddSub && (
          <button onClick={onAddSub} className={BOTAO_ICONE} title="Dividir em sub-colunas">
            <SplitSquareHorizontal size={12} />
          </button>
        )}
        <button onClick={onEdit} className={BOTAO_ICONE} title="Editar coluna">
          <Pencil size={11} />
        </button>
      </div>

      {contador}
    </div>
  );
}
