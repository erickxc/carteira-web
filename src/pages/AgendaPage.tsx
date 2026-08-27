import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  addDays, addMonths, addWeeks, differenceInCalendarDays, eachDayOfInterval, endOfMonth, endOfWeek,
  format, parse, parseISO, startOfMonth, startOfWeek, subDays, subMonths, subWeeks,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, Plus, Printer } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { EventFormModal } from '../components/EventFormModal';
import { FiltroBotoes } from '../components/FiltroBotoes';
import { CeoEventoPopover } from '../components/agenda/CeoEventoPopover';
import { SugestaoAgendaCard } from '../components/agenda/SugestaoAgendaCard';
import { ProximasReunioesTicker } from '../components/agenda/ProximasReunioesTicker';
import { MonthGrid } from '../components/agenda/MonthGrid';
import { WeekKanban } from '../components/agenda/WeekKanban';
import { turnoDe } from '../utils/turnos';
import { gerarAta } from '../utils/ata';
import { corTipo } from '../utils/tipoCor';
import { usePersistedState } from '../hooks/usePersistedState';
import { Button, Card } from '../ui';
import type { EventoAgenda, EventoCeo } from '../types';

interface AgendaLocationState { focusDate?: string; openNewEvent?: boolean; initialType?: string; }

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
      if (!a.time || /cancel|reagend/i.test(a.status || '')) return;
      (a.monitores ?? []).forEach((mon) => {
        const k = `${format(parseISO(a.date), 'yyyy-MM-dd')}|${a.time}|${mon}`;
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(a.id);
      });
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

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth));
    const end = endOfWeek(endOfMonth(currentMonth));
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(weekRef, { weekStartsOn: 1 });
    return [0, 1, 2, 3, 4].map((i) => addDays(start, i)); // Seg..Sex
  }, [weekRef]);

  /**
   * Mudar o DIA de um evento é uma remarcação — conta no `reagendamentos`.
   * Só reunião entra na conta: mover um Contato/Relatório de dia é ajuste de
   * registro, não uma reunião desmarcada com o cliente.
   */
  function contarRemarcacao(ev: EventoAgenda): Partial<EventoAgenda> {
    if (!/reuni/i.test(ev.type || '')) return {};
    return { reagendamentos: (ev.reagendamentos ?? 0) + 1 };
  }

  async function moverParaDia(id: string, targetKey: string) {
    const ev = agenda.find((e) => e.id === id);
    if (!ev || format(parseISO(ev.date), 'yyyy-MM-dd') === targetKey) return;
    await atualizarEvento(id, {
      date: parse(targetKey, 'yyyy-MM-dd', new Date()).toISOString(),
      ...contarRemarcacao(ev),
    });
  }

  async function moverKanban(id: string, dayKey: string, turno: 'manha' | 'tarde') {
    const ev = agenda.find((e) => e.id === id);
    if (!ev) return;
    const curTurno = turnoDe(ev);
    let novaHora = ev.time || '';
    if (turno !== curTurno || !ev.time) novaHora = turno === 'manha' ? '09:00' : '14:00';
    // Trocar só de turno no mesmo dia não é remarcação com o cliente.
    const mudouDeDia = format(parseISO(ev.date), 'yyyy-MM-dd') !== dayKey;
    await atualizarEvento(id, {
      date: parse(dayKey, 'yyyy-MM-dd', new Date()).toISOString(),
      time: novaHora,
      ...(mudouDeDia ? contarRemarcacao(ev) : {}),
    });
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

      <ProximasReunioesTicker
        proximos={proximos}
        conflitos={conflitos}
        onSelecionar={(ev) => setModalState({ editing: ev })}
      />

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

        {/* Filtros em botões (somem na impressão). Trocaram os dropdowns de
            Monitor/Tipo: são poucas opções e a troca é constante, então um clique
            resolve em vez de abrir → escolher → fechar. O botão de Tipo carrega a
            própria cor do tipo, que é a mesma do chip no calendário — a legenda
            separada continua só para a impressão. */}
        <div className="agenda-filtros agenda-noprint">
          <FiltroBotoes
            label="Tipos"
            opcoes={tiposUnicos}
            valor={fTipos}
            onChange={setFTipos}
            corDe={corTipo}
          />
          {monitorOpcoes.length > 0 && (
            <FiltroBotoes
              label="Monitor"
              opcoes={monitorOpcoes}
              valor={fMonitores}
              onChange={setFMonitores}
            />
          )}
          <div className="agenda-filtro-linha agenda-filtro-opcoes">
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
        </div>

        {/* Legenda de cores — só na impressão, onde não há botão colorido. */}
        <div className="agenda-legenda-print">
          {tiposUnicos.map((t) => (
            <span key={t} className="inline-flex items-center gap-[6px] text-[0.74rem] text-text-secondary">
              <i className="w-[10px] h-[10px] rounded-[3px] inline-block" style={{ background: corTipo(t) }} /> {t}
            </span>
          ))}
        </div>

        {view === 'mes' ? (
          <MonthGrid
            monthDays={monthDays}
            currentMonth={currentMonth}
            hoje={hoje}
            eventsByDay={eventsByDay}
            eventsByDayCeo={eventsByDayCeo}
            conflitos={conflitos}
            draggedId={draggedId}
            dragOverKey={dragOverKey}
            onDragOverDay={(key) => setDragOverKey((k) => (k === key ? k : key))}
            onDragLeaveDay={(key) => setDragOverKey((k) => (k === key ? null : k))}
            onDropDay={(id, key) => { setDragOverKey(null); setDraggedId(null); moverParaDia(id, key); }}
            onDragStartEvento={setDraggedId}
            onDragEndEvento={() => { setDraggedId(null); setDragOverKey(null); }}
            onSelecionarEvento={(ev) => setModalState({ editing: ev })}
            onSelecionarEventoCeo={setEventoCeoAberto}
            onNovoEvento={(day) => setModalState({ defaultDate: day })}
            onReagendar={moverParaDia}
          />
        ) : (
          <WeekKanban
            weekDays={weekDays}
            hoje={hoje}
            eventsByDay={eventsByDay}
            eventsByDayCeo={eventsByDayCeo}
            salaOpcoes={opcoesPorTipo('sala')}
            conflitos={conflitos}
            draggedId={draggedId}
            dragOverKey={dragOverKey}
            onDragOverTurno={(dkey) => setDragOverKey((k) => (k === dkey ? k : dkey))}
            onDragLeaveTurno={(dkey) => setDragOverKey((k) => (k === dkey ? null : k))}
            onDropTurno={(id, dayKey, turno) => { setDragOverKey(null); setDraggedId(null); moverKanban(id, dayKey, turno); }}
            onDragStartEvento={setDraggedId}
            onDragEndEvento={() => { setDraggedId(null); setDragOverKey(null); }}
            onSelecionarEvento={(ev) => setModalState({ editing: ev })}
            onSelecionarEventoCeo={setEventoCeoAberto}
            onConcluir={concluir}
            onReagendar={moverParaDia}
            onNovoEvento={(day) => setModalState({ defaultDate: day })}
          />
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
