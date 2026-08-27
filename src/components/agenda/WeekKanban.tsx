import { format, isSameDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MapPin, Plus } from 'lucide-react';
import { getHoliday } from '../../utils/holidays';
import { salaDoEvento, turnoDe, turnoDeCeo } from '../../utils/turnos';
import { corSalaVariant } from '../../utils/corSala';
import { Badge } from '../../ui';
import { CardEvento } from './CardEvento';
import type { EventoAgenda, EventoCeo } from '../../types';

interface WeekKanbanProps {
  weekDays: Date[];
  hoje: Date;
  eventsByDay: Map<string, EventoAgenda[]>;
  eventsByDayCeo: Map<string, EventoCeo[]>;
  /** Opções de sala cadastradas (Configurações → Categorias) — define a ordem
   *  dos grupos ao segmentar cada turno por sala. */
  salaOpcoes: string[];
  conflitos: Set<string>;
  draggedId: string | null;
  dragOverKey: string | null;
  onDragOverTurno: (dkey: string) => void;
  onDragLeaveTurno: (dkey: string) => void;
  onDropTurno: (id: string, dayKey: string, turno: 'manha' | 'tarde') => void;
  onDragStartEvento: (id: string) => void;
  onDragEndEvento: () => void;
  onSelecionarEvento: (ev: EventoAgenda) => void;
  onSelecionarEventoCeo: (ev: EventoCeo) => void;
  onConcluir: (ev: EventoAgenda) => void;
  onReagendar: (id: string, novaData: string) => void;
  onNovoEvento: (day: Date) => void;
}

/**
 * Visão "Semana" (kanban) da Agenda — extraído de AgendaPage.tsx, mesmo
 * comportamento. 3 "linhas" de grid explícitas (cabeçalho / manhã / tarde) em
 * vez de uma coluna por dia com tudo empilhado dentro — o Grid só alinha a
 * altura entre colunas quando cada bloco é um item de grid PRÓPRIO; empilhado
 * num wrapper por dia, um dia com mais reuniões de manhã empurrava "Tarde"
 * pra baixo só naquela coluna, desalinhando a régua toda (bug real relatado).
 */
/** Agrupa os eventos de um turno por sala — ordem: `salaOpcoes` (cadastro),
 *  depois salas "avulsas" (valor gravado que não está mais no cadastro),
 *  por último "Sem sala" (tipos que não usam sala, ou Reunião sem sala
 *  marcada). Só serve pra exibição — não afeta a ordem de drag-and-drop. */
function agruparPorSala(lista: EventoAgenda[], salaOpcoes: string[]): { sala: string; eventos: EventoAgenda[] }[] {
  const porSala = new Map<string, EventoAgenda[]>();
  for (const ev of lista) {
    const chave = salaDoEvento(ev);
    if (!porSala.has(chave)) porSala.set(chave, []);
    porSala.get(chave)!.push(ev);
  }
  const ordem = [...salaOpcoes, ...[...porSala.keys()].filter((s) => s && !salaOpcoes.includes(s)).sort()];
  const grupos = ordem.filter((s) => porSala.has(s)).map((s) => ({ sala: s, eventos: porSala.get(s)! }));
  if (porSala.has('')) grupos.push({ sala: '', eventos: porSala.get('')! });
  return grupos;
}

export function WeekKanban({
  weekDays, hoje, eventsByDay, eventsByDayCeo, salaOpcoes, conflitos, draggedId, dragOverKey,
  onDragOverTurno, onDragLeaveTurno, onDropTurno, onDragStartEvento, onDragEndEvento,
  onSelecionarEvento, onSelecionarEventoCeo, onConcluir, onReagendar, onNovoEvento,
}: WeekKanbanProps) {
  function renderTurno(day: Date, key: string, turno: 'manha' | 'tarde', lista: EventoAgenda[], listaCeo: EventoCeo[], isManha: boolean) {
    const dkey = `${key}|${turno}`;
    const grupos = agruparPorSala(lista, salaOpcoes);
    return (
      <div key={`${key}-${turno}`}
        className={`kanban-turno${isManha ? ' kanban-turno-manha' : ' kanban-turno-tarde'}${dragOverKey === dkey ? ' is-drop-target' : ''}`}
        onDragOver={(e) => { e.preventDefault(); onDragOverTurno(dkey); }}
        onDragLeave={() => onDragLeaveTurno(dkey)}
        onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain') || draggedId; if (id) onDropTurno(id, key, turno); }}>
        <div className="kanban-turno-label">{isManha ? 'Manhã' : 'Tarde'}</div>
        {grupos.map((grupo, i) => (
          <div key={grupo.sala || '(sem sala)'} className={`kanban-sala-grupo${i > 0 ? ' kanban-sala-grupo-sep' : ''}`}>
            {/* Rotula sempre que o grupo tem sala de verdade — mesmo 1 grupo
                só, você já vê qual sala é. "Sem sala" fica implícito (não
                rotula) pra não poluir dia com só Contato/Relatório. Pílula
                colorida (cor determinística por sala) em vez de texto cinza —
                texto simples se perdia entre os cards. */}
            {grupo.sala && (
              <Badge variant={corSalaVariant(grupo.sala)} style={{ alignSelf: 'flex-start' }}>
                <MapPin size={11} /> {grupo.sala}
              </Badge>
            )}
            {grupo.eventos.map((ev) => (
              <CardEvento
                key={ev.id}
                ev={ev}
                isDragging={draggedId === ev.id}
                hasConflito={conflitos.has(ev.id)}
                onDragStart={() => onDragStartEvento(ev.id)}
                onDragEnd={onDragEndEvento}
                onClick={() => onSelecionarEvento(ev)}
                onConcluir={() => onConcluir(ev)}
                onReagendar={(novaData) => onReagendar(ev.id, novaData)}
              />
            ))}
          </div>
        ))}
        {listaCeo.map((ev) => (
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
        <button className="kanban-add" onClick={() => onNovoEvento(day)}><Plus size={13} /> reunião</button>
      </div>
    );
  }

  return (
    <div className="kanban">
      {weekDays.map((day) => {
        const key = format(day, 'yyyy-MM-dd');
        const holiday = getHoliday(day);
        return (
          <div key={key} className={`kanban-col-header${isSameDay(day, hoje) ? ' is-today' : ''}`}>
            <span className="font-bold text-[0.8rem] capitalize">{format(day, 'EEE', { locale: ptBR })}</span>
            <span className="text-[0.72rem] text-text-muted">{format(day, 'dd/MM')}</span>
            {holiday && <Badge variant="warning" style={{ fontSize: 10 }}>feriado</Badge>}
          </div>
        );
      })}
      {weekDays.map((day) => {
        const key = format(day, 'yyyy-MM-dd');
        const dayEvents = eventsByDay.get(key) ?? [];
        const manha = dayEvents.filter((e) => turnoDe(e) === 'manha');
        const dayEventsCeo = eventsByDayCeo.get(key) ?? [];
        const manhaCeo = dayEventsCeo.filter((e) => turnoDeCeo(e) === 'manha');
        return renderTurno(day, key, 'manha', manha, manhaCeo, true);
      })}
      {weekDays.map((day) => {
        const key = format(day, 'yyyy-MM-dd');
        const dayEvents = eventsByDay.get(key) ?? [];
        const tarde = dayEvents.filter((e) => turnoDe(e) === 'tarde');
        const dayEventsCeo = eventsByDayCeo.get(key) ?? [];
        const tardeCeo = dayEventsCeo.filter((e) => turnoDeCeo(e) === 'tarde');
        return renderTurno(day, key, 'tarde', tarde, tardeCeo, false);
      })}
    </div>
  );
}
