import { AlertTriangle, Check } from 'lucide-react';
import { corTipo, corTipoBg } from '../../utils/tipoCor';
import { ReagendarButton } from './ReagendarButton';
import type { EventoAgenda } from '../../types';

interface CardEventoProps {
  ev: EventoAgenda;
  isDragging: boolean;
  hasConflito: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
  onConcluir: () => void;
  onReagendar: (novaData: string) => void;
}

/** Card de evento da view Semana/Kanban — extraído de AgendaPage para não ser
 * redefinido a cada render; recebe estado de drag/conflito via props em vez
 * de fechar sobre o state da página. */
export function CardEvento({ ev, isDragging, hasConflito, onDragStart, onDragEnd, onClick, onConcluir, onReagendar }: CardEventoProps) {
  const isDone = /conclu|realiz/i.test(ev.status);
  const isCancel = /cancel|reagend/i.test(ev.status);
  // Fundo pastel sólido cobrindo o card inteiro (verde concluído / vermelho
  // cancelado) vence a cor de fundo do tipo. A barra lateral (borderLeftColor)
  // continua sempre com a cor do TIPO (Reunião/Contato/Ligação/Relatório) —
  // status é o fundo, tipo é a barra, nunca os dois disputando a mesma cor.
  const background = isDone
    ? 'var(--success-pastel-bg)'
    : isCancel
      ? 'var(--danger-pastel-bg)'
      : corTipoBg(ev.type);
  return (
    <button
      className={`kanban-card${isDragging ? ' is-dragging' : ''}${isDone ? ' is-done' : ''}${isCancel ? ' is-cancel' : ''}`}
      style={{ borderLeftColor: corTipo(ev.type), borderLeftWidth: 5, background }}
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', ev.id); onDragStart(); }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      title={`${ev.clientName} — ${ev.subject || ev.type} · clique para editar/reagendar (ou arraste para outro dia/turno)`}
    >
      <div className="kanban-card-top">
        <span className="kanban-card-time">{ev.time || '—'}{ev.duracao ? ` · ${ev.duracao}min` : ''}</span>
        {hasConflito && <AlertTriangle size={12} className="text-[color:var(--danger)]" />}
        <ReagendarButton dataAtual={ev.date} onReagendar={onReagendar} />
        {!/conclu|realiz|cancel|reagend/i.test(ev.status) && (
          <span className="kanban-card-done" onClick={(e) => { e.stopPropagation(); onConcluir(); }} title="Concluir reunião"><Check size={12} /></span>
        )}
      </div>
      <span className="kanban-card-title">{ev.clientName}</span>
      <span className="kanban-card-sub">
        {ev.subject || (/reuni/i.test(ev.type) && ev.servicos.length > 0 ? ev.servicos.join(', ') : ev.type)}
        {ev.checklist && ev.checklist.length > 0 ? ` · ☑ ${ev.checklist.filter((c) => c.done).length}/${ev.checklist.length}` : ''}
      </span>
      {ev.monitor && <span className="kanban-card-sub">👤 {ev.monitor}</span>}
    </button>
  );
}
