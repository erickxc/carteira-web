import { useState, type FormEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { differenceInCalendarDays, format, isPast, isToday, parse, parseISO, startOfDay } from 'date-fns';
import { AlertTriangle, ArrowUp, CalendarClock, Clock, ListChecks, Plus } from 'lucide-react';
import clsx from 'clsx';
import { useCarteira } from '../../context/CarteiraContext';
import { corContrastante } from '../../utils/cor';
import type { AgilTarefa } from '../../types';

/** Barra de prioridade (idioma `stat-card-accent-bar` do app) — junto do
 *  bloqueio e do prazo vencido, é o único uso de cor no card. */
const PRIORIDADE_BARRA: Record<string, string> = {
  Baixa: 'bg-border-strong',
  Média: 'bg-success',
  Alta: 'bg-warning',
  Urgente: 'bg-danger',
};

const PRIORIDADE_TEXTO: Record<string, string> = {
  Alta: 'text-warning',
  Urgente: 'text-danger',
};

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase();
}

interface TaskCardProps {
  tarefa: AgilTarefa;
  onClick: () => void;
}

export function TaskCard({ tarefa, onClick }: TaskCardProps) {
  const { clientes, agilFrentes, agilColunas, agilTarefas, agilSubtarefas, criarAgilSubtarefa, atualizarAgilSubtarefa } = useCarteira();
  const frente = tarefa.frenteId ? agilFrentes.find((f) => f.id === tarefa.frenteId) : undefined;
  // Iniciativas → Tarefas (Fase B): puramente derivado do dado, sem precisar
  // saber "em qual grid" o card está sendo renderizado.
  // - Se OUTRAS tarefas apontam pra esta (`iniciativaId === tarefa.id`), esta é
  //   uma Iniciativa: mostra uma bolinha por tarefa vinculada, na cor da coluna
  //   onde ela está agora.
  const tarefasVinculadas = agilTarefas.filter((t) => t.iniciativaId === tarefa.id);
  // - Se esta tarefa TEM `iniciativaId`, ela é filha de uma Iniciativa (de outro
  //   board): mostra uma linha de referência, mesmo idioma do "↑ {cliente}".
  const iniciativa = tarefa.iniciativaId ? agilTarefas.find((t) => t.id === tarefa.iniciativaId) : undefined;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tarefa.id,
    data: { type: 'tarefa', colunaId: tarefa.colunaId, swimlaneId: tarefa.swimlaneId },
  });
  const [novaSub, setNovaSub] = useState<string | null>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };
  const cliente = tarefa.clientId ? clientes.find((c) => c.id === tarefa.clientId) : undefined;
  const subtarefas = agilSubtarefas.filter((s) => s.tarefaId === tarefa.id).sort((a, b) => a.ordem - b.ordem);
  const feitas = subtarefas.filter((s) => s.concluida).length;

  // Idade do card: dias desde a última alteração (mover conta como alteração).
  // Não é "tempo na coluna" no sentido estrito do Kanbanize — `updatedAt` também
  // muda ao editar — por isso o tooltip diz exatamente o que é.
  const idadeDias = differenceInCalendarDays(new Date(), parseISO(tarefa.updatedAt));

  let prazo: { texto: string; vencido: boolean } | null = null;
  if (tarefa.dueAt) {
    const d = parse(tarefa.dueAt, 'yyyy-MM-dd', new Date());
    prazo = { texto: format(d, 'dd/MM'), vencido: isPast(d) && !isToday(d) && d < startOfDay(new Date()) };
  }

  /** Impede o sensor de drag e o clique-abre-modal de capturarem os controles
   *  interativos internos (checkbox de subtarefa, input de nova subtarefa). */
  const pararEventos = {
    onPointerDown: (e: ReactPointerEvent) => e.stopPropagation(),
    onClick: (e: ReactMouseEvent) => e.stopPropagation(),
  };

  async function handleAddSub(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const titulo = (novaSub ?? '').trim();
    if (!titulo) { setNovaSub(null); return; }
    await criarAgilSubtarefa({ tarefaId: tarefa.id, titulo });
    setNovaSub('');
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={clsx(
        'group/card relative flex flex-col gap-1.5 pl-3 pr-2.5 py-2 rounded bg-card border border-border shadow-sm cursor-pointer overflow-hidden',
        'transition-[box-shadow,border-color,transform] duration-150',
        'hover:border-border-strong hover:shadow-md hover:-translate-y-[1px]',
        isDragging && 'shadow-lg'
      )}
    >
      {/* Barra de prioridade */}
      <span
        aria-hidden
        className={clsx('absolute left-0 top-0 bottom-0 w-[3px]', PRIORIDADE_BARRA[tarefa.prioridade ?? ''] ?? 'bg-border')}
      />

      {/* Linha 1: número do card + Frente (categoria colorida) + prioridade */}
      <div className="flex items-center gap-1.5">
        <span className="px-1.5 rounded-[4px] bg-bg border border-border text-[0.62rem] font-semibold text-text-secondary leading-[1.5] tabular-nums">
          {tarefa.numero ? `#${tarefa.numero}` : '—'}
        </span>
        {frente && (
          <span
            className="px-1.5 rounded-full text-[0.6rem] font-semibold leading-[1.5] truncate max-w-[110px]"
            style={{ background: frente.cor, color: corContrastante(frente.cor) }}
            title={frente.titulo}
          >
            {frente.titulo}
          </span>
        )}
        <span className={clsx('ml-auto text-[0.63rem] font-medium truncate shrink-0', PRIORIDADE_TEXTO[tarefa.prioridade ?? ''] ?? 'text-text-muted')}>
          {tarefa.prioridade || 'Nenhum'}
        </span>
      </div>

      {/* Linha 2: título + avatares dos responsáveis (até 3, "+N" se houver mais) */}
      <div className="flex items-start gap-2">
        <span className="flex-1 text-[0.8rem] font-semibold text-text-primary leading-[1.35] break-words">{tarefa.titulo}</span>
        {tarefa.responsaveis && tarefa.responsaveis.length > 0 && (
          <div className="shrink-0 flex items-center -space-x-1">
            {tarefa.responsaveis.slice(0, 3).map((r) => (
              <span
                key={r}
                className="flex items-center justify-center w-[21px] h-[21px] rounded-full bg-accent-soft text-[color:var(--accent-fg)] text-[0.58rem] font-bold leading-none ring-1 ring-border ring-offset-1 ring-offset-card"
                title={r}
              >
                {iniciais(r)}
              </span>
            ))}
            {tarefa.responsaveis.length > 3 && (
              <span
                className="flex items-center justify-center w-[21px] h-[21px] rounded-full bg-bg text-text-secondary text-[0.55rem] font-bold leading-none ring-1 ring-border ring-offset-1 ring-offset-card"
                title={tarefa.responsaveis.slice(3).join(', ')}
              >
                +{tarefa.responsaveis.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Linha 3: métricas (bloqueio, idade, prazo, subtarefas) */}
      <div className="flex items-center gap-2.5 text-[0.66rem] text-text-muted">
        {tarefa.bloqueado && (
          <span className="text-danger" title={tarefa.motivoBloqueio || 'Tarefa bloqueada'}>
            <AlertTriangle size={11} />
          </span>
        )}
        <span className="flex items-center gap-1" title={`${idadeDias} dia(s) desde a última alteração`}>
          <Clock size={11} /> {idadeDias}d
        </span>
        {prazo && (
          <span
            className={clsx(
              'flex items-center gap-1',
              prazo.vencido && 'px-1.5 -mx-0.5 rounded-full bg-[var(--danger-bg)] text-danger font-semibold'
            )}
            title={prazo.vencido ? 'Prazo vencido' : 'Prazo'}
          >
            <CalendarClock size={11} /> {prazo.texto}
          </span>
        )}
        {subtarefas.length > 0 && (
          <span className="flex items-center gap-1" title="Subtarefas concluídas">
            <ListChecks size={11} /> {feitas}/{subtarefas.length}
          </span>
        )}
      </div>

      {/* Iniciativa vinculada (esta tarefa é filha de uma Iniciativa de outro board) */}
      {iniciativa && (
        <div className="flex items-center gap-1 text-[0.66rem] text-text-secondary min-w-0" title={`Iniciativa: ${iniciativa.titulo}`}>
          <ArrowUp size={10} className="shrink-0 text-text-muted" />
          <span className="truncate">Iniciativa: {iniciativa.titulo}</span>
        </div>
      )}

      {/* Bolinhas de progresso (esta tarefa É uma Iniciativa) — uma por tarefa
          vinculada, na cor da coluna onde ela está agora; sem cor definida na
          coluna, cinza neutro. Só indicador (a tarefa filha pode estar em outro
          board — abrir daqui exigiria trocar de board, fora de escopo aqui). */}
      {tarefasVinculadas.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {tarefasVinculadas.map((filha) => {
            const corColuna = agilColunas.find((c) => c.id === filha.colunaId)?.cor;
            return (
              <span
                key={filha.id}
                title={filha.titulo}
                className="w-3 h-3 rounded-full border border-border-strong"
                style={{ background: corColuna ?? '#8a8a92' }}
              />
            );
          })}
        </div>
      )}

      {/* Linha 4: cliente vinculado */}
      {cliente && (
        <div className="flex items-center gap-1 text-[0.66rem] text-text-secondary min-w-0" title={cliente.empresa}>
          <ArrowUp size={10} className="shrink-0 text-text-muted" />
          <span className="truncate">{cliente.empresa}</span>
        </div>
      )}

      {/* Etiquetas */}
      {tarefa.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tarefa.labels.map((l) => (
            <span key={l} className="px-1.5 rounded-full bg-bg border border-border text-[0.62rem] text-text-secondary leading-[1.55]">{l}</span>
          ))}
        </div>
      )}

      {/* Subtarefas inline */}
      {subtarefas.length > 0 && (
        <div className="flex flex-col gap-0.5 pt-0.5 border-t border-border/70">
          {subtarefas.map((s) => (
            <label key={s.id} className="flex items-start gap-1.5 text-[0.66rem] cursor-pointer" {...pararEventos}>
              <input
                type="checkbox"
                checked={s.concluida}
                onChange={(e) => atualizarAgilSubtarefa(s.id, { concluida: e.target.checked })}
                className="mt-[3px] w-[11px] h-[11px] shrink-0 rounded-[3px] accent-[var(--accent)]"
              />
              <span className={clsx('leading-[1.4] break-words', s.concluida ? 'line-through text-text-muted' : 'text-text-secondary')}>
                {s.titulo}
              </span>
            </label>
          ))}
        </div>
      )}

      {/* Nova subtarefa (inline, sem abrir o modal) */}
      {novaSub === null ? (
        <button
          type="button"
          {...pararEventos}
          onClick={(e) => { e.stopPropagation(); setNovaSub(''); }}
          className="flex items-center gap-1 text-left text-[0.66rem] text-text-muted bg-transparent border-none p-0 cursor-pointer opacity-70 group-hover/card:opacity-100 hover:text-accent transition-opacity"
        >
          <Plus size={10} /> Nova subtarefa
        </button>
      ) : (
        <form onSubmit={handleAddSub} {...pararEventos}>
          <input
            autoFocus
            value={novaSub}
            onChange={(e) => setNovaSub(e.target.value)}
            onBlur={() => setNovaSub(null)}
            onKeyDown={(e) => { if (e.key === 'Escape') setNovaSub(null); }}
            placeholder="Título e Enter"
            className="w-full px-1.5 py-[2px] rounded-[4px] bg-bg border border-border-strong text-[0.66rem] text-text-primary outline-none transition-[border-color,box-shadow] focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
          />
        </form>
      )}
    </div>
  );
}
