import { AgilFiltrosBar } from './AgilFiltrosBar';
import type { AgilFiltros } from '../../utils/agilFiltros';

interface AgilFiltrosPainelProps {
  boardId: string;
  filtros: AgilFiltros;
  onChange: (filtros: AgilFiltros) => void;
}

/** Painel de filtros do quadro — separado do board, fixado no lado direito da tela. */
export function AgilFiltrosPainel({ boardId, filtros, onChange }: AgilFiltrosPainelProps) {
  return (
    <aside className="w-[220px] shrink-0 flex flex-col gap-3 p-3 rounded-xl border border-border bg-card" style={{ maxHeight: 'calc(100vh - 140px)', overflowY: 'auto' }}>
      <span className="text-[0.7rem] font-bold uppercase tracking-[0.06em] text-text-muted">Filtros</span>
      <AgilFiltrosBar boardId={boardId} filtros={filtros} onChange={onChange} vertical />
    </aside>
  );
}
