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
  /** Sempre true hoje (board sem raias, um único cabeçalho por coluna). */
  arrastavel: boolean;
  /** Cor usada quando a coluna não tem `cor` própria — sem isso, o cabeçalho
   *  cai numa borda cinza quase invisível (achado comparando com o
   *  Businessmap, onde toda coluna tem uma faixa colorida no topo). */
  corPadrao: string;
  style: CSSProperties;
  onToggleColapso: () => void;
  onEdit: () => void;
  /** Só em coluna de topo: cria a primeira sub-coluna (vira agrupadora). */
  onAddSub?: () => void;
}

const BOTAO_ICONE =
  'shrink-0 flex items-center justify-center w-[18px] h-[18px] rounded-[4px] text-text-muted bg-transparent border-none cursor-pointer transition-colors hover:bg-card hover:text-text-primary';

export function KanbanColumnHeader({
  coluna, totalTarefas, colapsada, ocupaDuasLinhas, ultimaColuna, arrastavel, corPadrao, style, onToggleColapso, onEdit, onAddSub,
}: KanbanColumnHeaderProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: coluna.id,
    data: { type: 'coluna', parentId: coluna.parentId ?? '' },
    disabled: !arrastavel,
  });

  const excedeu = !!coluna.wipLimit && totalTarefas > coluna.wipLimit;
  // Linha colorida no topo — cor própria da coluna (estilo businessmap), com
  // vermelho de WIP estourado tendo prioridade sobre a cor cadastrada.
  const corTopo = excedeu ? 'var(--danger)' : coluna.cor || corPadrao;
  const estilo: CSSProperties = {
    ...style,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    borderTopColor: corTopo,
  };

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

  const refDrag = arrastavel ? setNodeRef : undefined;

  if (colapsada) {
    return (
      <div
        ref={refDrag}
        style={estilo}
        className={clsx(
          'flex flex-col items-center gap-1.5 py-2 border-b border-border bg-card-hover',
          !ultimaColuna && 'border-r',
          ocupaDuasLinhas ? 'border-t-2' : 'border-t'
        )}
      >
        <button onClick={onToggleColapso} className={BOTAO_ICONE} title="Expandir coluna" aria-label={`Expandir coluna ${coluna.titulo}`}>
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
        ocupaDuasLinhas ? 'border-t-2 bg-card-hover' : 'border-t bg-card'
      )}
    >
      <button onClick={onToggleColapso} className={BOTAO_ICONE} title="Recolher coluna" aria-label={`Recolher coluna ${coluna.titulo}`}>
        <ChevronDown size={13} />
      </button>

      {/* O título é a alça de arraste (reordenar entre irmãs) — só na cópia
          arrastável (sempre true hoje); mantido pelo mesmo componente. */}
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
          <button onClick={onAddSub} className={BOTAO_ICONE} title="Dividir em sub-colunas" aria-label={`Dividir coluna ${coluna.titulo} em sub-colunas`}>
            <SplitSquareHorizontal size={12} />
          </button>
        )}
        <button onClick={onEdit} className={BOTAO_ICONE} title="Editar coluna" aria-label={`Editar coluna ${coluna.titulo}`}>
          <Pencil size={11} />
        </button>
      </div>

      {contador}
    </div>
  );
}
