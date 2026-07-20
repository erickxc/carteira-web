import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  addDays, addMonths, addWeeks, differenceInCalendarDays, eachDayOfInterval, endOfMonth, endOfWeek,
  format, isSameDay, isSameMonth, parse, parseISO, startOfMonth, startOfWeek, subMonths, subWeeks,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, CalendarDays, Check, ChevronLeft, ChevronRight, LayoutGrid, Paperclip, Plus, Printer } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { EventFormModal } from '../components/EventFormModal';
import { Dropdown } from '../components/Dropdown';
import { formatHolidayLabel, getHoliday } from '../utils/holidays';
import { eventoStatusBadge } from '../utils/badges';
import type { EventoAgenda } from '../types';

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const TYPE_PALETTE = ['#bd952f', '#5a9bd4', '#4cae7a', '#c77dba', '#d69a3c', '#7b8794'];

interface AgendaLocationState { focusDate?: string; openNewEvent?: boolean; }

function chipClass(status: string): string {
  const b = eventoStatusBadge(status);
  if (b.includes('success')) return 'is-ok';
  if (b.includes('accent')) return 'is-agendado';
  if (b.includes('warning')) return 'is-warn';
  if (b.includes('danger')) return 'is-danger';
  return '';
}
function turnoDe(ev: EventoAgenda): 'manha' | 'tarde' {
  if (!ev.time) return 'manha';
  return Number(ev.time.slice(0, 2)) >= 12 ? 'tarde' : 'manha';
}
function ordenaPorHora(a: EventoAgenda, b: EventoAgenda) {
  return (a.time || '99:99').localeCompare(b.time || '99:99');
}

export default function AgendaPage() {
  const { agenda, clientes, atualizarEvento, opcoesPorTipo } = useCarteira();
  const location = useLocation();
  const navigate = useNavigate();
  const hoje = new Date();
  const [view, setView] = useState<'mes' | 'kanban'>('mes');
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(hoje));
  const [weekRef, setWeekRef] = useState(hoje);
  const [modalState, setModalState] = useState<{ editing?: EventoAgenda; defaultDate?: Date } | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [fMonitores, setFMonitores] = useState<string[]>([]);
  const [fTipos, setFTipos] = useState<string[]>([]);

  const statusConcluido = useMemo(
    () => opcoesPorTipo('status_evento').find((s) => /conclu|realiz/i.test(s)) ?? 'Concluído',
    [opcoesPorTipo]
  );

  const monitorPorCliente = useMemo(() => {
    const m = new Map<string, string>();
    clientes.forEach((c) => m.set(c.id, c.monitor || ''));
    return m;
  }, [clientes]);
  const monitorOpcoes = useMemo(() => [...new Set(clientes.map((c) => c.monitor).filter(Boolean))].sort(), [clientes]);
  const tiposUnicos = useMemo(() => [...new Set(agenda.map((a) => a.type).filter(Boolean))].sort(), [agenda]);
  const corTipo = (t: string) => TYPE_PALETTE[Math.max(0, tiposUnicos.indexOf(t)) % TYPE_PALETTE.length];

  // Agenda com filtros de monitor/tipo aplicados (para exibição).
  const agendaFiltrada = useMemo(
    () => agenda.filter((a) =>
      (fMonitores.length === 0 || fMonitores.includes(monitorPorCliente.get(a.clientId) || '')) &&
      (fTipos.length === 0 || fTipos.includes(a.type))),
    [agenda, fMonitores, fTipos, monitorPorCliente]
  );

  function gerarAta(ev: EventoAgenda): string {
    const linhas = (ev.checklist ?? []).map((i) => `${i.done ? '[x]' : '[ ]'} ${i.text}`);
    return [`Ata — ${format(parseISO(ev.date), 'dd/MM/yyyy')}`, ...linhas, ev.description ? `\n${ev.description}` : ''].filter(Boolean).join('\n');
  }

  useEffect(() => {
    const state = location.state as AgendaLocationState | null;
    if (!state) return;
    if (state.focusDate) { setCurrentMonth(startOfMonth(new Date(state.focusDate))); setWeekRef(new Date(state.focusDate)); }
    if (state.openNewEvent) setModalState({ defaultDate: state.focusDate ? new Date(state.focusDate) : new Date() });
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, EventoAgenda[]>();
    agendaFiltrada.forEach((item) => {
      const key = format(parseISO(item.date), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    for (const list of map.values()) list.sort(ordenaPorHora);
    return map;
  }, [agendaFiltrada]);

  // Conflitos: mesmo dia + mesma hora (não vazia).
  const conflitos = useMemo(() => {
    const m = new Map<string, string[]>();
    agendaFiltrada.forEach((a) => {
      if (!a.time) return;
      const k = `${format(parseISO(a.date), 'yyyy-MM-dd')}|${a.time}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a.id);
    });
    const s = new Set<string>();
    m.forEach((ids) => { if (ids.length > 1) ids.forEach((id) => s.add(id)); });
    return s;
  }, [agendaFiltrada]);

  const proximos = useMemo(
    () => agendaFiltrada
      .filter((a) => differenceInCalendarDays(parseISO(a.date), hoje) >= 0)
      .sort((a, b) => (parseISO(a.date).getTime() - parseISO(b.date).getTime()) || ordenaPorHora(a, b))
      .slice(0, 10),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agendaFiltrada]
  );

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth));
    const end = endOfWeek(endOfMonth(currentMonth));
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(weekRef, { weekStartsOn: 1 });
    return [0, 1, 2, 3, 4].map((i) => addDays(start, i)); // Seg..Sex
  }, [weekRef]);

  async function moverParaDia(id: string, targetKey: string) {
    const ev = agenda.find((e) => e.id === id);
    if (!ev || format(parseISO(ev.date), 'yyyy-MM-dd') === targetKey) return;
    await atualizarEvento(id, { date: parse(targetKey, 'yyyy-MM-dd', new Date()).toISOString() });
  }

  async function moverKanban(id: string, dayKey: string, turno: 'manha' | 'tarde') {
    const ev = agenda.find((e) => e.id === id);
    if (!ev) return;
    const curTurno = turnoDe(ev);
    let novaHora = ev.time || '';
    if (turno !== curTurno || !ev.time) novaHora = turno === 'manha' ? '09:00' : '14:00';
    await atualizarEvento(id, { date: parse(dayKey, 'yyyy-MM-dd', new Date()).toISOString(), time: novaHora });
  }

  function concluir(ev: EventoAgenda) {
    const patch: Partial<EventoAgenda> = { status: statusConcluido };
    if ((ev.checklist?.length ?? 0) > 0 && !ev.ata) patch.ata = gerarAta(ev);
    atualizarEvento(ev.id, patch);
  }

  function tituloPeriodo() {
    if (view === 'mes') return format(currentMonth, 'MMMM yyyy', { locale: ptBR });
    const s = weekDays[0], e = weekDays[4];
    return `${format(s, "d 'de' MMM", { locale: ptBR })} – ${format(e, "d 'de' MMM", { locale: ptBR })}`;
  }
  function irAnterior() { view === 'mes' ? setCurrentMonth((m) => subMonths(m, 1)) : setWeekRef((w) => subWeeks(w, 1)); }
  function irProximo() { view === 'mes' ? setCurrentMonth((m) => addMonths(m, 1)) : setWeekRef((w) => addWeeks(w, 1)); }
  function irHoje() { setCurrentMonth(startOfMonth(hoje)); setWeekRef(hoje); }

  function CardEvento({ ev }: { ev: EventoAgenda }) {
    return (
      <button
        className={`kanban-card${draggedId === ev.id ? ' is-dragging' : ''}${/conclu|realiz/i.test(ev.status) ? ' is-done' : ''}`}
        style={{ borderLeftColor: corTipo(ev.type) }}
        draggable
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', ev.id); setDraggedId(ev.id); }}
        onDragEnd={() => { setDraggedId(null); setDragOverKey(null); }}
        onClick={() => setModalState({ editing: ev })}
      >
        <div className="kanban-card-top">
          <span className="kanban-card-time">{ev.time || '—'}{ev.duracao ? ` · ${ev.duracao}min` : ''}</span>
          {conflitos.has(ev.id) && <AlertTriangle size={12} className="text-[color:var(--danger)]" />}
          {!/conclu|realiz/i.test(ev.status) && (
            <span className="kanban-card-done" onClick={(e) => { e.stopPropagation(); concluir(ev); }} title="Concluir reunião"><Check size={12} /></span>
          )}
        </div>
        <span className="kanban-card-title">{ev.clientName}</span>
        <span className="kanban-card-sub">{ev.subject || ev.type}{ev.checklist && ev.checklist.length > 0 ? ` · ☑ ${ev.checklist.filter((c) => c.done).length}/${ev.checklist.length}` : ''}</span>
      </button>
    );
  }

  return (
    <div className="page-container">
      <div className="flex-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: 4 }}>
        <div>
          <h1 className="page-title">Agenda</h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>Reuniões, recorrências e checklist. Arraste os cards para remarcar.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModalState({ defaultDate: new Date() })}><Plus size={16} /> Novo evento</button>
      </div>

      {/* Faixa de próximas reuniões */}
      <div className="section agenda-noprint" style={{ marginTop: '1rem' }}>
        <div className="section-header"><h3>Próximas reuniões</h3><span className="text-muted" style={{ fontSize: 12 }}>{proximos.length}</span></div>
        {proximos.length === 0 ? (
          <div className="glass-card glass-card-flat"><div className="empty-state">Nenhuma reunião futura.</div></div>
        ) : (
          <div className="agenda-upcoming">
            {proximos.map((ev) => {
              const d = parseISO(ev.date);
              return (
                <button key={ev.id} className="agenda-up-card" onClick={() => setModalState({ editing: ev })}>
                  <span className="agenda-up-date">
                    <span className="agenda-up-day">{format(d, 'dd')}</span>
                    <span className="agenda-up-mon">{format(d, 'MMM', { locale: ptBR })}</span>
                  </span>
                  <span className="agenda-up-main">
                    <span className="agenda-up-title">{ev.clientName}</span>
                    <span className="agenda-up-sub">{ev.time ? `${ev.time} · ` : ''}{ev.subject || ev.type}</span>
                  </span>
                  {conflitos.has(ev.id) && <AlertTriangle size={13} className="text-[color:var(--danger)] shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="glass-card glass-card-flat agenda-board">
        <div className="flex-between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <strong style={{ textTransform: 'capitalize', fontSize: '1.3rem' }}>{tituloPeriodo()}</strong>
          <div className="flex-row" style={{ gap: 8 }}>
            <div className="tabs">
              <button className={`tab${view === 'mes' ? ' is-active' : ''}`} onClick={() => setView('mes')}><CalendarDays size={15} /> Mês</button>
              <button className={`tab${view === 'kanban' ? ' is-active' : ''}`} onClick={() => setView('kanban')}><LayoutGrid size={15} /> Semana</button>
            </div>
            <button className="btn btn-secondary" style={{ padding: '0.45rem 0.8rem' }} onClick={irHoje}>Hoje</button>
            <button className="btn btn-secondary btn-icon" onClick={irAnterior} aria-label="Anterior"><ChevronLeft size={18} /></button>
            <button className="btn btn-secondary btn-icon" onClick={irProximo} aria-label="Próximo"><ChevronRight size={18} /></button>
            <button className="btn btn-secondary btn-icon agenda-noprint" onClick={() => window.print()} aria-label="Imprimir / PDF" title="Imprimir / exportar PDF"><Printer size={16} /></button>
          </div>
        </div>

        {/* Filtros + legenda de tipos */}
        <div className="agenda-toolbar agenda-noprint">
          <div className="flex-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 150 }}>
              <Dropdown label="Monitor" multiple options={monitorOpcoes.map((m) => ({ value: m, label: m }))} value={fMonitores} onChange={(v) => setFMonitores(v as string[])} />
            </div>
            <div style={{ minWidth: 150 }}>
              <Dropdown label="Tipo" multiple options={tiposUnicos.map((t) => ({ value: t, label: t }))} value={fTipos} onChange={(v) => setFTipos(v as string[])} />
            </div>
          </div>
          {view === 'kanban' && (
            <div className="agenda-legend-tipos">
              {tiposUnicos.map((t) => (
                <span key={t}><i style={{ background: corTipo(t) }} /> {t}</span>
              ))}
            </div>
          )}
        </div>

        {view === 'mes' ? (
          <>
            <div className="calendar-grid" style={{ marginBottom: 8 }}>
              {WEEKDAY_LABELS.map((d) => (<div key={d} className="calendar-weekday">{d}</div>))}
            </div>
            <div className="calendar-grid calendar-grid-big">
              {monthDays.map((day) => {
                const key = format(day, 'yyyy-MM-dd');
                const dayEvents = eventsByDay.get(key) ?? [];
                const holiday = getHoliday(day);
                const classes = ['calendar-day', 'calendar-day-big',
                  !isSameMonth(day, currentMonth) && 'is-outside', isSameDay(day, hoje) && 'is-today',
                  (day.getDay() === 0 || day.getDay() === 6) && 'is-weekend', holiday && 'is-holiday',
                  dragOverKey === key && 'is-drop-target'].filter(Boolean).join(' ');
                return (
                  <div key={key} className={classes}
                    onDragOver={(e) => { e.preventDefault(); if (dragOverKey !== key) setDragOverKey(key); }}
                    onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
                    onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || draggedId; setDragOverKey(null); setDraggedId(null); if (id) moverParaDia(id, key); }}
                    title={holiday ? formatHolidayLabel(holiday) : undefined}>
                    <div className="calendar-day-head">
                      <span className="calendar-day-number">{format(day, 'd')}</span>
                      <button className="calendar-add" onClick={() => setModalState({ defaultDate: day })} aria-label="Adicionar"><Plus size={13} /></button>
                    </div>
                    <div className="calendar-events-big custom-scrollbar">
                      {dayEvents.map((ev) => (
                        <button key={ev.id} className={`calendar-chip ${chipClass(ev.status)}${draggedId === ev.id ? ' is-dragging' : ''}`}
                          draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', ev.id); setDraggedId(ev.id); }}
                          onDragEnd={() => { setDraggedId(null); setDragOverKey(null); }}
                          onClick={() => setModalState({ editing: ev })}
                          title={`${ev.clientName} — ${ev.subject || ev.type}${ev.time ? ' ' + ev.time : ''}`}>
                          <span className="calendar-chip-title">{ev.time ? `${ev.time} ` : ''}{ev.clientName}</span>
                          <span className="calendar-chip-meta">
                            <span className="calendar-chip-type">{ev.type}</span>
                            {conflitos.has(ev.id) && <AlertTriangle size={10} className="text-[color:var(--danger)]" />}
                            {ev.attachments.length > 0 && <Paperclip size={10} className="calendar-chip-clip" />}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="kanban">
            {weekDays.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const dayEvents = eventsByDay.get(key) ?? [];
              const manha = dayEvents.filter((e) => turnoDe(e) === 'manha');
              const tarde = dayEvents.filter((e) => turnoDe(e) === 'tarde');
              const holiday = getHoliday(day);
              return (
                <div key={key} className={`kanban-col${isSameDay(day, hoje) ? ' is-today' : ''}`}>
                  <div className="kanban-col-head">
                    <span className="kanban-col-day">{format(day, 'EEE', { locale: ptBR })}</span>
                    <span className="kanban-col-date">{format(day, 'dd/MM')}</span>
                    {holiday && <span className="badge badge-warning" style={{ fontSize: 10 }}>feriado</span>}
                  </div>
                  {(['manha', 'tarde'] as const).map((turno) => {
                    const dkey = `${key}|${turno}`;
                    const lista = turno === 'manha' ? manha : tarde;
                    return (
                      <div key={turno} className={`kanban-turno${dragOverKey === dkey ? ' is-drop-target' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); if (dragOverKey !== dkey) setDragOverKey(dkey); }}
                        onDragLeave={() => setDragOverKey((k) => (k === dkey ? null : k))}
                        onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || draggedId; setDragOverKey(null); setDraggedId(null); if (id) moverKanban(id, key, turno); }}>
                        <div className="kanban-turno-label">{turno === 'manha' ? 'Manhã' : 'Tarde'}</div>
                        {lista.map((ev) => <CardEvento key={ev.id} ev={ev} />)}
                        <button className="kanban-add" onClick={() => setModalState({ defaultDate: day })}><Plus size={13} /> reunião</button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modalState && (
        <EventFormModal initial={modalState.editing} defaultDate={modalState.defaultDate} onClose={() => setModalState(null)} />
      )}
    </div>
  );
}
