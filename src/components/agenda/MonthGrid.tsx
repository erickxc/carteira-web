import { format, isSameDay, isSameMonth, parseISO } from 'date-fns';
import { AlertTriangle, CalendarSync, MapPin, Paperclip, Plus, User } from 'lucide-react';
import { formatHolidayLabel, getHoliday } from '../../utils/holidays';
import { corTipo } from '../../utils/tipoCor';
import { salaDoEvento } from '../../utils/turnos';
import { ReagendarButton } from './ReagendarButton';
import type { EventoAgenda, EventoCeo } from '../../types';

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface MonthGridProps {
  monthDays: Date[];
  currentMonth: Date;
  hoje: Date;
  eventsByDay: Map<string, EventoAgenda[]>;
  eventsByDayCeo: Map<string, EventoCeo[]>;
  conflitos: Set<string>;
  draggedId: string | null;
  dragOverKey: string | null;
  onDragOverDay: (key: string) => void;
  onDragLeaveDay: (key: string) => void;
  onDropDay: (id: string, key: string) => void;
  onDragStartEvento: (id: string) => void;
  onDragEndEvento: () => void;
  onSelecionarEvento: (ev: EventoAgenda) => void;
  onSelecionarEventoCeo: (ev: EventoCeo) => void;
  onNovoEvento: (day: Date) => void;
  onReagendar: (id: string, novaData: string) => void;
}

/**
 * Visão "Mês" da Agenda — extraído de AgendaPage.tsx (mesmo comportamento,
 * mesmas classes/markup), sem alterar nenhuma regra de negócio.
 */
export function MonthGrid({
  monthDays, currentMonth, hoje, eventsByDay, eventsByDayCeo, conflitos, draggedId, dragOverKey,
  onDragOverDay, onDragLeaveDay, onDropDay, onDragStartEvento, onDragEndEvento,
  onSelecionarEvento, onSelecionarEventoCeo, onNovoEvento, onReagendar,
}: MonthGridProps) {
  return (
    <>
      <div className="calendar-grid" style={{ marginBottom: 8 }}>
        {WEEKDAY_LABELS.map((d) => (<div key={d} className="calendar-weekday">{d}</div>))}
      </div>
      <div className="calendar-grid calendar-grid-big">
        {monthDays.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const dayEvents = eventsByDay.get(key) ?? [];
          const dayEventsCeo = eventsByDayCeo.get(key) ?? [];
          const holiday = getHoliday(day);
          const classes = ['calendar-day', 'calendar-day-big',
            !isSameMonth(day, currentMonth) && 'is-outside', isSameDay(day, hoje) && 'is-today',
            (day.getDay() === 0 || day.getDay() === 6) && 'is-weekend', holiday && 'is-holiday',
            dragOverKey === key && 'is-drop-target'].filter(Boolean).join(' ');
          return (
            <div key={key} className={classes}
              onDragOver={(e) => { e.preventDefault(); onDragOverDay(key); }}
              onDragLeave={() => onDragLeaveDay(key)}
              onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || draggedId; if (id) onDropDay(id, key); }}
              title={holiday ? formatHolidayLabel(holiday) : undefined}>
              <div className="flex items-center justify-between">
                <span className="calendar-day-number">{format(day, 'd')}</span>
                <button className="calendar-add" onClick={() => onNovoEvento(day)} aria-label="Adicionar"><Plus size={13} /></button>
              </div>
              <div className="calendar-events-big custom-scrollbar">
                {dayEvents.map((ev) => (
                  <button key={ev.id}
                    className={`calendar-chip${draggedId === ev.id ? ' is-dragging' : ''}${/conclu|realiz/i.test(ev.status) ? ' is-done' : ''}${/cancel|reagend/i.test(ev.status) ? ' is-cancel' : ''}`}
                    style={{ ['--chip-color' as string]: corTipo(ev.type) }}
                    draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', ev.id); onDragStartEvento(ev.id); }}
                    onDragEnd={onDragEndEvento}
                    onClick={() => onSelecionarEvento(ev)}
                    title={`${ev.clientName} — ${ev.subject || ev.type}${ev.time ? ' ' + ev.time : ''}${ev.servicos.length > 0 ? ' · ' + ev.servicos.join(', ') : ''}${salaDoEvento(ev) ? ' · Sala: ' + salaDoEvento(ev) : ''}${ev.monitores.length > 0 ? ' · Monitor: ' + ev.monitores.join(', ') : ''} · clique para editar/reagendar (ou arraste para outro dia)`}>
                    <span className="calendar-chip-title">{ev.time ? `${ev.time} ` : ''}{ev.clientName}</span>
                    <span className="calendar-chip-meta">
                      {/* Reunião: a cor da barra lateral já indica o tipo — mostrar o
                          serviço tratado (Monitoria/Precificação) é mais útil que repetir
                          "Reunião" no texto. Sem serviço tagueado (legado), cai no tipo. */}
                      <span className="calendar-chip-type">
                        {/* Com 2+ serviços, "Monitoria, Precificação" não cabe na
                            coluna e era cortado no meio da palavra. Mostra o
                            primeiro + contador; a lista completa está no title. */}
                        {/reuni/i.test(ev.type) && ev.servicos.length > 0
                          ? (ev.servicos.length > 1 ? `${ev.servicos[0]} +${ev.servicos.length - 1}` : ev.servicos[0])
                          : ev.type}
                      </span>
                      {salaDoEvento(ev) && <span className="chip-monitor"><MapPin size={10} /> {salaDoEvento(ev)}</span>}
                      {ev.monitores.length > 0 && <span className="chip-monitor"><User size={10} /> {ev.monitores.join(', ')}</span>}
                      {(ev.reagendamentos ?? 0) > 0 && (
                        <span
                          className="chip-remarcada"
                          title={`Remarcada ${ev.reagendamentos}x`}
                        >
                          <CalendarSync size={10} /> {ev.reagendamentos}x
                        </span>
                      )}
                      {conflitos.has(ev.id) && <AlertTriangle size={10} className="text-[color:var(--danger)]" />}
                      {ev.attachments.length > 0 && <Paperclip size={10} className="calendar-chip-clip" />}
                      <ReagendarButton className="calendar-chip-reagendar" dataAtual={ev.date} onReagendar={(novaData) => onReagendar(ev.id, novaData)} />
                    </span>
                  </button>
                ))}
                {dayEventsCeo.map((ev) => (
                  <button key={ev.id}
                    type="button"
                    className="calendar-chip calendar-chip-ceo"
                    onClick={() => onSelecionarEventoCeo(ev)}
                    title={`${ev.title}${ev.allDay ? '' : ' · ' + format(parseISO(ev.start), 'HH:mm')} — Agendas do Marco (Google, somente leitura)`}>
                    <span className="calendar-chip-title">📅 {ev.allDay ? '' : `${format(parseISO(ev.start), 'HH:mm')} `}{ev.title}</span>
                    <span className="calendar-chip-meta">
                      <span className="calendar-chip-type">Agendas do Marco</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
