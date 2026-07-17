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
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Paperclip, Pencil, Plus } from 'lucide-react';
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

export default function AgendaPage() {
  const { agenda } = useCarteira();
  const location = useLocation();
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [modalState, setModalState] = useState<{ editing?: EventoAgenda; defaultDate?: Date } | null>(null);

  useEffect(() => {
    const state = location.state as AgendaLocationState | null;
    if (!state) return;

    if (state.focusDate) {
      const date = new Date(state.focusDate);
      setCurrentMonth(startOfMonth(date));
      setSelectedDate(date);
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
    return map;
  }, [agenda]);

  const selectedDayEvents = (eventsByDay.get(format(selectedDate, 'yyyy-MM-dd')) ?? [])
    .slice()
    .sort((a, b) => a.clientName.localeCompare(b.clientName));

  const holidaySelecionado = getHoliday(selectedDate);

  return (
    <div className="page-container">
      <h1 className="page-title">Agenda</h1>
      <p className="page-subtitle">Calendário de reuniões, precificações e follow-ups.</p>

      <div className="two-col-grid" style={{ gridTemplateColumns: '1.6fr 1fr', alignItems: 'start' }}>
        <div className="glass-card glass-card-flat">
          <div className="flex-between" style={{ marginBottom: 18 }}>
            <strong style={{ textTransform: 'capitalize', fontSize: '1.15rem', fontFamily: 'var(--font)' }}>
              {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
            </strong>
            <div className="flex-row" style={{ gap: 6 }}>
              <button className="btn btn-secondary" style={{ padding: '0.4rem 0.7rem' }} onClick={() => { setCurrentMonth(startOfMonth(new Date())); setSelectedDate(new Date()); }}>
                Hoje
              </button>
              <button className="btn btn-secondary btn-icon" onClick={() => setCurrentMonth((m) => subMonths(m, 1))} aria-label="Mês anterior">
                <ChevronLeft size={16} />
              </button>
              <button className="btn btn-secondary btn-icon" onClick={() => setCurrentMonth((m) => addMonths(m, 1))} aria-label="Próximo mês">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="calendar-grid" style={{ marginBottom: 8 }}>
            {WEEKDAY_LABELS.map((d) => (
              <div key={d} className="calendar-weekday">{d}</div>
            ))}
          </div>

          <div className="calendar-grid">
            {days.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const dayEvents = eventsByDay.get(key) ?? [];
              const holiday = getHoliday(day);
              const classes = [
                'calendar-day',
                !isSameMonth(day, currentMonth) && 'is-outside',
                isSameDay(day, new Date()) && 'is-today',
                isSameDay(day, selectedDate) && 'is-selected',
                holiday && 'is-holiday',
              ].filter(Boolean).join(' ');

              return (
                <div key={key} className={classes} onClick={() => setSelectedDate(day)} title={holiday ? formatHolidayLabel(holiday) : undefined}>
                  <span className="calendar-day-number">{format(day, 'd')}</span>
                  {dayEvents.length > 0 && (
                    <div className="calendar-events">
                      {dayEvents.slice(0, 2).map((ev) => (
                        <span key={ev.id} className="calendar-event">{ev.subject || ev.clientName}</span>
                      ))}
                      {dayEvents.length > 2 && <span className="calendar-event-more">+{dayEvents.length - 2} mais</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass-card glass-card-flat">
          <div className="section-header">
            <h3 style={{ textTransform: 'capitalize' }}>{format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}</h3>
            <button className="btn btn-primary btn-icon" onClick={() => setModalState({ defaultDate: selectedDate })}>
              <Plus size={15} />
            </button>
          </div>

          {holidaySelecionado && (
            <div className="badge badge-warning" style={{ marginBottom: 12 }}>{formatHolidayLabel(holidaySelecionado)}</div>
          )}

          {selectedDayEvents.length === 0 ? (
            <div className="empty-state">Nenhum evento nesta data.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selectedDayEvents.map((event) => (
                <div key={event.id} className="glass-card glass-card-flat" style={{ padding: 12 }}>
                  <div className="flex-between">
                    <div>
                      <strong style={{ fontSize: 14 }}>{event.subject || event.type}</strong>
                      <div>
                        <button className="link-button text-muted" style={{ fontSize: 13 }} onClick={() => navigate(`/clientes/${event.clientId}`)}>
                          {event.clientName}
                        </button>
                      </div>
                    </div>
                    <button className="btn btn-secondary btn-icon" onClick={() => setModalState({ editing: event })}>
                      <Pencil size={13} />
                    </button>
                  </div>
                  <div className="flex-row" style={{ marginTop: 6 }}>
                    <span className="badge badge-accent">{event.type}</span>
                    <span className={`badge ${eventoStatusBadge(event.status)}`}>{event.status}</span>
                    {event.attachments.length > 0 && (
                      <span className="badge badge-muted"><Paperclip size={11} /> {event.attachments.length}</span>
                    )}
                  </div>
                  {event.description && (
                    <p className="text-muted" style={{ fontSize: 13, marginTop: 8 }}>{event.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modalState && (
        <EventFormModal initial={modalState.editing} defaultDate={modalState.defaultDate} onClose={() => setModalState(null)} />
      )}
    </div>
  );
}
