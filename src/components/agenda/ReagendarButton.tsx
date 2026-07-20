import { useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { CalendarClock } from 'lucide-react';

interface ReagendarButtonProps {
  /** Data atual do evento (ISO). */
  dataAtual: string;
  /** Chamado com a nova data no formato yyyy-MM-dd (mesmo do <input type="date">). */
  onReagendar: (novaData: string) => void;
  className?: string;
}

/**
 * Alternativa ao drag-and-drop para reagendar — um <input type="date"> nativo
 * num popover, totalmente operável por teclado/touch (o drag funciona só com
 * mouse). Complementa, não substitui, o drag-and-drop já existente.
 */
export function ReagendarButton({ dataAtual, onReagendar, className }: ReagendarButtonProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    setOpen(true);
  }

  const valorAtual = (() => {
    const d = new Date(dataAtual);
    return isNaN(d.getTime()) ? '' : format(d, 'yyyy-MM-dd');
  })();

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        ref={triggerRef}
        className={className ?? 'kanban-card-done'}
        title="Reagendar para outra data"
        aria-label="Reagendar"
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e as unknown as MouseEvent); } }}
      >
        <CalendarClock size={12} />
      </span>
      {open && rect && createPortal(
        <div
          className="filter-pop"
          style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, padding: 8 }}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="date"
            autoFocus
            className="field-input"
            defaultValue={valorAtual}
            onChange={(e) => { if (e.target.value) { onReagendar(e.target.value); setOpen(false); } }}
            onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
            onBlur={() => setOpen(false)}
          />
        </div>,
        document.body
      )}
    </>
  );
}
