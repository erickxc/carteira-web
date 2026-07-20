import { AlertTriangle, Check } from 'lucide-react';
import { corTipo, corTipoBg } from '../../utils/tipoCor';
import type { EventoAgenda } from '../../types';

interface CardEventoProps {
  ev: EventoAgenda;
  isDragging: boolean;
  hasConflito: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
  onConcluir: () => void;
}

/** Card de evento da view Semana/Kanban — extraído de AgendaPage para não ser
 * redefinido a cada render; recebe estado de drag/conflito via props em vez
 * de fechar sobre o state da página. */
export function CardEvento({ ev, isDragging, hasConflito, onDragStart, onDragEnd, onClick, onConcluir }: CardEventoProps) {
  return (
    <button
      className={`kanban-card${isDragging ? ' is-dragging' : ''}${/conclu|realiz/i.test(ev.status) ? ' is-done' : ''}`}
      style={{ borderLeftColor: corTipo(ev.type), background: corTipoBg(ev.type) }}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', ev.id); onDragStart(); }}
      onDragEnd={onDragEnd}
      onClick={onClick}
    >
      <div className="kanban-card-top">
        <span className="kanban-card-time">{ev.time || '—'}{ev.duracao ? ` · ${ev.duracao}min` : ''}</span>
        {hasConflito && <AlertTriangle size={12} className="text-[color:var(--danger)]" />}
        {!/conclu|realiz/i.test(ev.status) && (
          <span className="kanban-card-done" onClick={(e) => { e.stopPropagation(); onConcluir(); }} title="Concluir reunião"><Check size={12} /></span>
        )}
      </div>
      <span className="kanban-card-title">{ev.clientName}</span>
      <span className="kanban-card-sub">{ev.subject || ev.type}{ev.checklist && ev.checklist.length > 0 ? ` · ☑ ${ev.checklist.filter((c) => c.done).length}/${ev.checklist.length}` : ''}</span>
    </button>
  );
}
