import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  addDays, addMonths, addWeeks, differenceInCalendarDays, eachDayOfInterval, endOfMonth, endOfWeek,
  format, isSameDay, isSameMonth, parse, parseISO, startOfMonth, startOfWeek, subDays, subMonths, subWeeks,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, Paperclip, Plus, Printer, User } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { EventFormModal } from '../components/EventFormModal';
import { Dropdown } from '../components/Dropdown';
import { CardEvento } from '../components/agenda/CardEvento';
import { ReagendarButton } from '../components/agenda/ReagendarButton';
import { CeoEventoPopover } from '../components/agenda/CeoEventoPopover';
import { SugestaoAgendaCard } from '../components/agenda/SugestaoAgendaCard';
import { formatHolidayLabel, getHoliday } from '../utils/holidays';
import { gerarAta } from '../utils/ata';
import { corTipo } from '../utils/tipoCor';
import { usePersistedState } from '../hooks/usePersistedState';
import { Badge, Button, Card } from '../ui';
import type { EventoAgenda, EventoCeo } from '../types';

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface AgendaLocationState { focusDate?: string; openNewEvent?: boolean; initialType?: string; }

function turnoDe(ev: EventoAgenda): 'manha' | 'tarde' {
  if (!ev.time) return 'manha';
  return Number(ev.time.slice(0, 2)) >= 12 ? 'tarde' : 'manha';
}
function turnoDeCeo(ev: EventoCeo): 'manha' | 'tarde' {
  if (ev.allDay) return 'manha';
  return Number(format(parseISO(ev.start), 'HH')) >= 12 ? 'tarde' : 'manha';
}
function ordenaPorHora(a: EventoAgenda, b: EventoAgenda) {
  return (a.time || '99:99').localeCompare(b.time || '99:99');
}

export default function AgendaPage() {
  const { agenda, clientes, atualizarEvento, opcoesPorTipo, ceoAgenda } = useCarteira();
  const location = useLocation();
  const navigate = useNavigate();
  const hoje = new Date();
  const [view, setView] = usePersistedState<'mes' | 'kanban'>('filtro:agenda:view', 'mes');
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(hoje));
  const [weekRef, setWeekRef] = useState(hoje);
  const [modalState, setModalState] = useState<{ editing?: EventoAgenda; defaultDate?: Date; initialClientId?: string; initialType?: string; initialTime?: string } | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [fMonitores, setFMonitores] = usePersistedState<string[]>('filtro:agenda:monitores', []);
  // Padrão: só Reunião. Contatos/Relatórios aparecem ao marcá-los no filtro Tipo.
  const [fTipos, setFTipos] = usePersistedState<string[]>('filtro:agenda:tipos', ['Reunião']);
  // Cancelado/Reagendado somem do calendário por padrão (evento morto, sem
  // ocupar mais o horário) — toggle revela pra quem quiser ver o histórico.
  const [mostrarCancelados, setMostrarCancelados] = usePersistedState('filtro:agenda:mostrarCancelados', false);
  const [mostrarAgendaCeo, setMostrarAgendaCeo] = usePersistedState('carteira:mostrarAgendaCeo', false);
  const [eventoCeoAberto, setEventoCeoAberto] = useState<EventoCeo | null>(null);

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
  // Tipos considerados = os cadastrados (categoria) + os presentes nos dados.
  const tiposUnicos = useMemo(
    () => [...new Set([...opcoesPorTipo('tipo_evento'), ...agenda.map((a) => a.type)])].filter(Boolean).sort(),
    [opcoesPorTipo, agenda]
  );

  // Agenda com filtros de monitor/tipo aplicados (para exibição).
  const agendaFiltrada = useMemo(
    () => agenda.filter((a) =>
      (fMonitores.length === 0 || fMonitores.includes(monitorPorCliente.get(a.clientId) || '')) &&
      (fTipos.length === 0 || fTipos.includes(a.type)) &&
      (mostrarCancelados || !/cancel|reagend/i.test(a.status || ''))),
    [agenda, fMonitores, fTipos, mostrarCancelados, monitorPorCliente]
  );


  useEffect(() => {
    const state = location.state as AgendaLocationState | null;
    if (!state) return;
    // Reage a um sinal de navegação transiente (state do router, ex.: "abrir
    // agenda nessa data" vindo do Dashboard/Busca) — consome e limpa o state pra
    // não disparar de novo; não dá pra mover pro corpo do render (efeito
    // colateral de navegação, não estado derivado de props).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (state.focusDate) { setCurrentMonth(startOfMonth(new Date(state.focusDate))); setWeekRef(new Date(state.focusDate)); }
    if (state.openNewEvent) setModalState({ defaultDate: state.focusDate ? new Date(state.focusDate) : new Date(), initialType: state.initialType });
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

  // Eventos da Agenda do CEO, por dia (chave 'yyyy-MM-dd') — inclui todos os
  // dias entre start/end para compromissos que abrangem mais de um dia.
  const eventsByDayCeo = useMemo(() => {
    const map = new Map<string, EventoCeo[]>();
    if (!mostrarAgendaCeo) return map;
    ceoAgenda.events.forEach((ev) => {
      const inicio = parseISO(ev.start);
      // Evento de dia inteiro: o Google usa data final EXCLUSIVA (ex.: um
      // compromisso só no dia 20 vem com end=21) — sem o -1 dia, o loop abaixo
      // também marcaria o dia 21, que não faz parte do compromisso.
      const fim = ev.end ? (ev.allDay ? subDays(parseISO(ev.end), 1) : parseISO(ev.end)) : inicio;
      eachDayOfInterval({ start: inicio, end: fim }).forEach((dia) => {
        const key = format(dia, 'yyyy-MM-dd');
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(ev);
      });
    });
    return map;
  }, [ceoAgenda, mostrarAgendaCeo]);

  // Conflitos: mesmo MONITOR + mesmo dia + mesma hora (não vazia). Monitores
  // diferentes no mesmo horário não é conflito (cada um pode ter sua própria
  // reunião ao mesmo tempo). Cancelado/Reagendado não ocupa mais o horário.
  const conflitos = useMemo(() => {
    const m = new Map<string, string[]>();
    agendaFiltrada.forEach((a) => {
      if (!a.time || !a.monitor || /cancel|reagend/i.test(a.status || '')) return;
      const k = `${format(parseISO(a.date), 'yyyy-MM-dd')}|${a.time}|${a.monitor}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a.id);
    });
    const s = new Set<string>();
    m.forEach((ids) => { if (ids.length > 1) ids.forEach((id) => s.add(id)); });
    return s;
  }, [agendaFiltrada]);

  // "Próximas reuniões" = só eventos do tipo Reunião. Contato/Relatório são
  // eventos de agenda (aparecem no calendário) mas não são reunião, então não
  // entram nesta lista. Match por palavra-chave (tipos são editáveis). Exclui
  // Cancelado/Concluído (a pedido do usuário, literalmente só esses 2 — não
  // Realizado/Reagendado, que continuam aparecendo).
  const proximos = useMemo(
    () => agendaFiltrada
      .filter((a) => /reuni/i.test(a.type))
      .filter((a) => !/cancel|conclu/i.test(a.status || ''))
      .filter((a) => differenceInCalendarDays(parseISO(a.date), hoje) >= 0)
      .sort((a, b) => (parseISO(a.date).getTime() - parseISO(b.date).getTime()) || ordenaPorHora(a, b))
      .slice(0, 10),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agendaFiltrada]
  );

  // Ticker "Próximas reuniões": sempre anima (rola continuamente, mesmo quando
  // a lista cabe inteira na largura visível — sinaliza que a tela está "viva").
  // A duração é calculada pela largura real do conteúdo (px), não pela
  // quantidade de itens — velocidade de leitura constante (px/s) mesmo com
  // poucos ou muitos itens, em vez da fórmula antiga que deixava listas curtas
  // rápidas/com a "costura" do loop muito visível.
  const tickerRef = useRef<HTMLDivElement>(null);
  const tickerTrackRef = useRef<HTMLDivElement>(null);
  const [duracaoTicker, setDuracaoTicker] = useState(35);
  const PX_POR_SEGUNDO_TICKER = 55;

  useEffect(() => {
    function medir() {
      const container = tickerRef.current;
      const track = tickerTrackRef.current;
      if (!container || !track) return;
      // O track sempre contém a lista duplicada (loop sem emenda) — a largura
      // de uma cópia é metade do scrollWidth total.
      const largura = track.scrollWidth / 2;
      setDuracaoTicker(Math.max(18, largura / PX_POR_SEGUNDO_TICKER));
    }
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [proximos]);

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
    // Não sobrescreve ata editada manualmente.
    atualizarEvento(ev.id, {
      status: statusConcluido,
      // Contexto do cliente para a ata sair com participantes; sem ele o
      // cabeçalho perderia essa seção.
      ata: ev.ata?.trim() ? ev.ata : gerarAta(ev, { cliente: clientes.find((c) => c.id === ev.clientId) }),
    });
  }

  function tituloPeriodo() {
    if (view === 'mes') return format(currentMonth, 'MMMM yyyy', { locale: ptBR });
    const s = weekDays[0], e = weekDays[4];
    return `${format(s, "d 'de' MMM", { locale: ptBR })} – ${format(e, "d 'de' MMM", { locale: ptBR })}`;
  }
  function irAnterior() { if (view === 'mes') setCurrentMonth((m) => subMonths(m, 1)); else setWeekRef((w) => subWeeks(w, 1)); }
  function irProximo() { if (view === 'mes') setCurrentMonth((m) => addMonths(m, 1)); else setWeekRef((w) => addWeeks(w, 1)); }
  function irHoje() { setCurrentMonth(startOfMonth(hoje)); setWeekRef(hoje); }

  return (
    <div className="page-container">
      <div className="flex-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: 4 }}>
        <div>
          <h1 className="page-title">Agenda</h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>Reuniões, recorrências e checklist. Arraste os cards para remarcar.</p>
        </div>
        <Button variant="primary" onClick={() => setModalState({ defaultDate: new Date() })}><Plus size={16} /> Novo evento</Button>
      </div>

      {/* Faixa de próximas reuniões */}
      <div className="section agenda-noprint" style={{ marginTop: '1rem' }}>
        <div className="section-header"><h3>Próximas reuniões</h3><span className="text-text-muted" style={{ fontSize: 12 }}>{proximos.length}</span></div>
        {proximos.length === 0 ? (
          <Card flat><div className="empty-state">Nenhuma reunião futura.</div></Card>
        ) : (
          <div className="agenda-ticker" ref={tickerRef}>
            {/* lista sempre duplicada (loop sem emenda), mas só anima quando não cabe na largura visível */}
            <div
              className="agenda-ticker-track"
              ref={tickerTrackRef}
              style={{ animationDuration: `${duracaoTicker}s` }}
            >
              {[...proximos, ...proximos].map((ev, i) => {
                const d = parseISO(ev.date);
                return (
                  <button
                    key={`${ev.id}-${i}`}
                    className="agenda-ticker-item"
                    onClick={() => setModalState({ editing: ev })}
                    aria-hidden={i >= proximos.length}
                    tabIndex={i >= proximos.length ? -1 : 0}
                  >
                    <span className="agenda-ticker-dot" style={{ background: corTipo(ev.type) }} />
                    <span className="agenda-ticker-date">{format(d, 'dd/MM')}</span>
                    <strong className="agenda-ticker-name">{ev.clientName}</strong>
                    <span className="agenda-ticker-meta">
                      {ev.time ? `${ev.time}` : ''}{ev.subject || ev.type ? `${ev.time ? ' · ' : ''}${ev.subject || ev.type}` : ''}
                      {ev.monitor && <span className="chip-monitor"> · <User size={10} /> {ev.monitor}</span>}
                    </span>
                    {conflitos.has(ev.id) && <AlertTriangle size={12} className="text-[color:var(--danger)] shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <SugestaoAgendaCard
        onAgendar={(clienteId, dia, hora) => setModalState({ initialClientId: clienteId, defaultDate: dia, initialTime: hora })}
      />

      <Card flat className="agenda-board">
        <div className="flex-between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <strong style={{ textTransform: 'capitalize', fontSize: '1.3rem' }}>{tituloPeriodo()}</strong>
          <div className="flex-row" style={{ gap: 8 }}>
            <div className="tabs">
              <button className={`tab${view === 'mes' ? ' is-active' : ''}`} onClick={() => setView('mes')}><CalendarDays size={15} /> Mês</button>
              <button className={`tab${view === 'kanban' ? ' is-active' : ''}`} onClick={() => setView('kanban')}><LayoutGrid size={15} /> Semana</button>
            </div>
            <Button variant="secondary" style={{ padding: '0.45rem 0.8rem' }} onClick={irHoje}>Hoje</Button>
            <Button variant="secondary" size="icon" onClick={irAnterior} aria-label="Anterior"><ChevronLeft size={18} /></Button>
            <Button variant="secondary" size="icon" onClick={irProximo} aria-label="Próximo"><ChevronRight size={18} /></Button>
            <Button variant="secondary" size="icon" className="agenda-noprint" onClick={() => window.print()} aria-label="Imprimir / PDF" title="Imprimir / exportar PDF"><Printer size={16} /></Button>
          </div>
        </div>

        {/* Filtros (somem na impressão) + legenda de tipos (fica na impressão, é a chave de cores do calendário) */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-[14px] pb-[14px] border-b border-border">
          <div className="flex-row agenda-noprint" style={{ gap: 8, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 150 }}>
              <Dropdown label="Monitor" multiple options={monitorOpcoes.map((m) => ({ value: m, label: m }))} value={fMonitores} onChange={(v) => setFMonitores(v as string[])} />
            </div>
            <div style={{ minWidth: 150 }}>
              <Dropdown label="Tipo" multiple options={tiposUnicos.map((t) => ({ value: t, label: t }))} value={fTipos} onChange={(v) => setFTipos(v as string[])} />
            </div>
            <label className="check-row" style={{ fontSize: '0.85rem' }}>
              <input type="checkbox" checked={mostrarCancelados} onChange={(e) => setMostrarCancelados(e.target.checked)} /> Mostrar cancelados
            </label>
            <label className="check-row" style={{ fontSize: '0.85rem' }}>
              <input type="checkbox" checked={mostrarAgendaCeo} onChange={(e) => setMostrarAgendaCeo(e.target.checked)} /> Agendas do Marco
            </label>
            {mostrarAgendaCeo && ceoAgenda.lastSync === null && (
              <span className="text-text-muted" style={{ fontSize: '0.72rem' }} title={ceoAgenda.lastError ?? undefined}>
                Agendas do Marco indisponível no momento
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            {tiposUnicos.map((t) => (
              <span key={t} className="inline-flex items-center gap-[6px] text-[0.74rem] text-text-secondary">
                <i className="w-[10px] h-[10px] rounded-[3px] inline-block" style={{ background: corTipo(t) }} /> {t}
              </span>
            ))}
          </div>
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
                const dayEventsCeo = eventsByDayCeo.get(key) ?? [];
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
                    <div className="flex items-center justify-between">
                      <span className="calendar-day-number">{format(day, 'd')}</span>
                      <button className="calendar-add" onClick={() => setModalState({ defaultDate: day })} aria-label="Adicionar"><Plus size={13} /></button>
                    </div>
                    <div className="calendar-events-big custom-scrollbar">
                      {dayEvents.map((ev) => (
                        <button key={ev.id}
                          className={`calendar-chip${draggedId === ev.id ? ' is-dragging' : ''}${/conclu|realiz/i.test(ev.status) ? ' is-done' : ''}${/cancel|reagend/i.test(ev.status) ? ' is-cancel' : ''}`}
                          style={{ ['--chip-color' as string]: corTipo(ev.type) }}
                          draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', ev.id); setDraggedId(ev.id); }}
                          onDragEnd={() => { setDraggedId(null); setDragOverKey(null); }}
                          onClick={() => setModalState({ editing: ev })}
                          title={`${ev.clientName} — ${ev.subject || ev.type}${ev.time ? ' ' + ev.time : ''}${ev.monitor ? ' · Monitor: ' + ev.monitor : ''} · clique para editar/reagendar (ou arraste para outro dia)`}>
                          <span className="calendar-chip-title">{ev.time ? `${ev.time} ` : ''}{ev.clientName}</span>
                          <span className="calendar-chip-meta">
                            {/* Reunião: a cor da barra lateral já indica o tipo — mostrar o
                                serviço tratado (Monitoria/Precificação) é mais útil que repetir
                                "Reunião" no texto. Sem serviço tagueado (legado), cai no tipo. */}
                            <span className="calendar-chip-type">
                              {/reuni/i.test(ev.type) && ev.servicos.length > 0 ? ev.servicos.join(', ') : ev.type}
                            </span>
                            {ev.monitor && <span className="chip-monitor"><User size={10} /> {ev.monitor}</span>}
                            {conflitos.has(ev.id) && <AlertTriangle size={10} className="text-[color:var(--danger)]" />}
                            {ev.attachments.length > 0 && <Paperclip size={10} className="calendar-chip-clip" />}
                            <ReagendarButton className="calendar-chip-reagendar" dataAtual={ev.date} onReagendar={(novaData) => moverParaDia(ev.id, novaData)} />
                          </span>
                        </button>
                      ))}
                      {dayEventsCeo.map((ev) => (
                        <button key={ev.id}
                          type="button"
                          className="calendar-chip calendar-chip-ceo"
                          onClick={() => setEventoCeoAberto(ev)}
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
        ) : (
          <div className="kanban">
            {weekDays.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const dayEvents = eventsByDay.get(key) ?? [];
              const manha = dayEvents.filter((e) => turnoDe(e) === 'manha');
              const tarde = dayEvents.filter((e) => turnoDe(e) === 'tarde');
              const dayEventsCeo = eventsByDayCeo.get(key) ?? [];
              const manhaCeo = dayEventsCeo.filter((e) => turnoDeCeo(e) === 'manha');
              const tardeCeo = dayEventsCeo.filter((e) => turnoDeCeo(e) === 'tarde');
              const holiday = getHoliday(day);
              return (
                <div key={key} className={`kanban-col${isSameDay(day, hoje) ? ' is-today' : ''}`}>
                  <div className="flex items-center gap-[6px] px-[0.7rem] py-[0.6rem] border-b border-border bg-card-hover">
                    <span className="font-bold text-[0.8rem] capitalize">{format(day, 'EEE', { locale: ptBR })}</span>
                    <span className="text-[0.72rem] text-text-muted">{format(day, 'dd/MM')}</span>
                    {holiday && <Badge variant="warning" style={{ fontSize: 10 }}>feriado</Badge>}
                  </div>
                  {(['manha', 'tarde'] as const).map((turno) => {
                    const dkey = `${key}|${turno}`;
                    const lista = turno === 'manha' ? manha : tarde;
                    const listaCeo = turno === 'manha' ? manhaCeo : tardeCeo;
                    return (
                      <div key={turno} className={`kanban-turno${dragOverKey === dkey ? ' is-drop-target' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); if (dragOverKey !== dkey) setDragOverKey(dkey); }}
                        onDragLeave={() => setDragOverKey((k) => (k === dkey ? null : k))}
                        onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || draggedId; setDragOverKey(null); setDraggedId(null); if (id) moverKanban(id, key, turno); }}>
                        <div className="kanban-turno-label">{turno === 'manha' ? 'Manhã' : 'Tarde'}</div>
                        {lista.map((ev) => (
                          <CardEvento
                            key={ev.id}
                            ev={ev}
                            isDragging={draggedId === ev.id}
                            hasConflito={conflitos.has(ev.id)}
                            onDragStart={() => setDraggedId(ev.id)}
                            onDragEnd={() => { setDraggedId(null); setDragOverKey(null); }}
                            onClick={() => setModalState({ editing: ev })}
                            onConcluir={() => concluir(ev)}
                            onReagendar={(novaData) => moverParaDia(ev.id, novaData)}
                          />
                        ))}
                        {listaCeo.map((ev) => (
                          <button key={ev.id}
                            type="button"
                            className="calendar-chip calendar-chip-ceo"
                            onClick={() => setEventoCeoAberto(ev)}
                            title={`${ev.title}${ev.allDay ? '' : ' · ' + format(parseISO(ev.start), 'HH:mm')} — Agendas do Marco (Google, somente leitura)`}>
                            <span className="calendar-chip-title">📅 {ev.allDay ? '' : `${format(parseISO(ev.start), 'HH:mm')} `}{ev.title}</span>
                            <span className="calendar-chip-meta">
                              <span className="calendar-chip-type">Agendas do Marco</span>
                            </span>
                          </button>
                        ))}
                        <button className="kanban-add" onClick={() => setModalState({ defaultDate: day })}><Plus size={13} /> reunião</button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {modalState && (
        <EventFormModal
          key={modalState.editing ? 'edit-' + modalState.editing.id : 'new-' + (modalState.initialClientId ?? '') + '-' + (modalState.initialType ?? '') + '-' + (modalState.initialTime ?? '')}
          initial={modalState.editing}
          defaultDate={modalState.defaultDate}
          initialTime={modalState.initialTime}
          initialClientId={modalState.initialClientId}
          initialType={modalState.initialType}
          onClose={() => setModalState(null)}
          onAgendarProximo={(clientId) => setModalState({ initialClientId: clientId, defaultDate: new Date() })}
        />
      )}

      {eventoCeoAberto && (
        <CeoEventoPopover evento={eventoCeoAberto} onClose={() => setEventoCeoAberto(null)} />
      )}
    </div>
  );
}
