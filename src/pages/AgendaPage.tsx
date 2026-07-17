import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parse,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Paperclip, Plus } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { EventFormModal } from '../components/EventFormModal';
import { formatHolidayLabel, getHoliday } from '../utils/holidays';
import { eventoStatusBadge } from '../utils/badges';
import type { EventoAgenda } from '../types';

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface AgendaLocationState {
  focusDate?: string;
  openNewEvent?: boolean;
}

/** Classe de cor do chip a partir do badge de status (verde/amarelo/vermelho/neutro). */
function chipClass(status: string): string {
  const b = eventoStatusBadge(status);
  if (b.includes('success')) return 'is-ok';
  if (b.includes('accent')) return 'is-agendado';
  if (b.includes('warning')) return 'is-warn';
  if (b.includes('danger')) return 'is-danger';
  return '';
}

export default function AgendaPage() {
  const { agenda, atualizarEvento } = useCarteira();
  const location = useLocation();
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [modalState, setModalState] = useState<{ editing?: EventoAgenda; defaultDate?: Date } | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  useEffect(() => {
    const state = location.state as AgendaLocationState | null;
    if (!state) return;

    if (state.focusDate) {
      setCurrentMonth(startOfMonth(new Date(state.focusDate)));
    }
    if (state.openNewEvent) {
      setModalState({ defaultDate: state.focusDate ? new Date(state.focusDate) : new Date() });
    }
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth));
    const end = endOfWeek(endOfMonth(currentMonth));
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, EventoAgenda[]>();
    agenda.forEach((item) => {
      const key = format(parseISO(item.date), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    for (const list of map.values()) list.sort((a, b) => (a.subject || a.clientName).localeCompare(b.subject || b.clientName));
    return map;
  }, [agenda]);

  async function moverEvento(id: string, targetKey: string) {
    const ev = agenda.find((e) => e.id === id);
    if (!ev) return;
    const atualKey = format(parseISO(ev.date), 'yyyy-MM-dd');
    if (atualKey === targetKey) return;
    // Grava como meia-noite local (mesmo formato do EventFormModal) para evitar shift de fuso.
    const novaData = parse(targetKey, 'yyyy-MM-dd', new Date()).toISOString();
    await atualizarEvento(id, { date: novaData });
  }

  function onDrop(e: React.DragEvent, targetKey: string) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || draggedId;
    setDragOverKey(null);
    setDraggedId(null);
    if (id) moverEvento(id, targetKey);
  }

  return (
    <div className="page-container">
      <div className="flex-between" style={{ marginBottom: 4 }}>
        <div>
          <h1 className="page-title">Agenda</h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>
            Arraste um card para outro dia para remarcar a reunião.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setModalState({ defaultDate: new Date() })}>
          <Plus size={16} /> Novo evento
        </button>
      </div>

      <div className="glass-card glass-card-flat agenda-board">
        <div className="flex-between" style={{ marginBottom: 16 }}>
          <strong style={{ textTransform: 'capitalize', fontSize: '1.35rem', fontFamily: 'var(--font)' }}>
            {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
          </strong>
          <div className="flex-row" style={{ gap: 14 }}>
            <div className="agenda-legend">
              <span><i className="legend-dot is-ok" /> Concluído</span>
              <span><i className="legend-dot is-agendado" /> Agendado</span>
              <span><i className="legend-dot is-danger" /> Cancelado</span>
            </div>
            <div className="flex-row" style={{ gap: 6 }}>
              <button className="btn btn-secondary" style={{ padding: '0.45rem 0.8rem' }} onClick={() => setCurrentMonth(startOfMonth(new Date()))}>
                Hoje
              </button>
              <button className="btn btn-secondary btn-icon" onClick={() => setCurrentMonth((m) => subMonths(m, 1))} aria-label="Mês anterior">
                <ChevronLeft size={18} />
              </button>
              <button className="btn btn-secondary btn-icon" onClick={() => setCurrentMonth((m) => addMonths(m, 1))} aria-label="Próximo mês">
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>

        <div className="calendar-grid" style={{ marginBottom: 8 }}>
          {WEEKDAY_LABELS.map((d) => (
            <div key={d} className="calendar-weekday">{d}</div>
          ))}
        </div>

        <div className="calendar-grid calendar-grid-big">
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayEvents = eventsByDay.get(key) ?? [];
            const holiday = getHoliday(day);
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;
            const classes = [
              'calendar-day',
              'calendar-day-big',
              !isSameMonth(day, currentMonth) && 'is-outside',
              isSameDay(day, new Date()) && 'is-today',
              isWeekend && 'is-weekend',
              holiday && 'is-holiday',
              dragOverKey === key && 'is-drop-target',
            ].filter(Boolean).join(' ');

            return (
              <div
                key={key}
                className={classes}
                onDragOver={(e) => { e.preventDefault(); if (dragOverKey !== key) setDragOverKey(key); }}
                onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
                onDrop={(e) => onDrop(e, key)}
                title={holiday ? formatHolidayLabel(holiday) : undefined}
              >
                <div className="calendar-day-head">
                  <span className="calendar-day-number">{format(day, 'd')}</span>
                  <button
                    className="calendar-add"
                    onClick={() => setModalState({ defaultDate: day })}
                    aria-label="Adicionar evento neste dia"
                    title="Adicionar evento"
                  >
                    <Plus size={13} />
                  </button>
                </div>

                <div className="calendar-events-big custom-scrollbar">
                  {dayEvents.map((ev) => (
                    <button
                      key={ev.id}
                      className={`calendar-chip ${chipClass(ev.status)}${draggedId === ev.id ? ' is-dragging' : ''}`}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', ev.id); e.dataTransfer.effectAllowed = 'move'; setDraggedId(ev.id); }}
                      onDragEnd={() => { setDraggedId(null); setDragOverKey(null); }}
                      onClick={() => setModalState({ editing: ev })}
                      title={`${ev.clientName} — ${ev.subject || ev.type} (${ev.status})`}
                    >
                      <span className="calendar-chip-title">{ev.clientName}</span>
                      <span className="calendar-chip-meta">
                        <span className="calendar-chip-type">{ev.type}</span>
                        {ev.attachments.length > 0 && <Paperclip size={10} className="calendar-chip-clip" />}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {modalState && (
        <EventFormModal initial={modalState.editing} defaultDate={modalState.defaultDate} onClose={() => setModalState(null)} />
      )}
    </div>
  );
}
