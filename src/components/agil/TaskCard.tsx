import { useState, type FormEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { differenceInCalendarDays, format, isPast, isToday, parse, parseISO, startOfDay } from 'date-fns';
import { AlertTriangle, ArrowUp, CalendarClock, Clock, ListChecks, Plus } from 'lucide-react';
import clsx from 'clsx';
import { useCarteira } from '../../context/CarteiraContext';
import { corContrastante } from '../../utils/cor';
import { parseCamposCard } from '../../utils/agilCamposCard';
import { progressoIniciativa } from '../../utils/agilColunas';
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
  const { clientes, agilBoards, agilTarefas, agilColunas, agilFrentes, agilSubtarefas, criarAgilSubtarefa, atualizarAgilSubtarefa } = useCarteira();
  const board = agilBoards.find((b) => b.id === tarefa.boardId);
  const campos = parseCamposCard(board?.camposCard);
  // Se esta tarefa TEM `iniciativaId`, ela aponta pra uma tarefa do board fixo
  // de Iniciativas da workspace: mostra uma linha de referência, mesmo idioma do "↑ {cliente}".
  const iniciativa = campos.includes('iniciativa') && tarefa.iniciativaId ? agilTarefas.find((t) => t.id === tarefa.iniciativaId) : undefined;
  const frente = campos.includes('frente') && tarefa.frenteId ? agilFrentes.find((f) => f.id === tarefa.frenteId) : undefined;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tarefa.id,
    data: { type: 'tarefa', colunaId: tarefa.colunaId, swimlaneId: tarefa.swimlaneId ?? '' },
  });
  const [novaSub, setNovaSub] = useState<string | null>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };
  const cliente = tarefa.clientId ? clientes.find((c) => c.id === tarefa.clientId) : undefined;
  const progresso = progressoIniciativa(tarefa.id, agilTarefas, agilColunas);
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
      onKeyDown={(e) => {
        // Só abre pelo Enter/Espaço quando o foco está no card em si — senão
        // Enter dentro do input de nova subtarefa (que já tem seu próprio
        // onSubmit) ou Espaço num checkbox de subtarefa abriria o modal junto.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
      }}
      className={clsx(
        'group/card relative flex flex-col gap-1.5 pl-3 pr-2.5 py-2 rounded bg-card border border-border shadow-sm cursor-pointer overflow-hidden',
        'transition-[box-shadow,border-color] duration-150',
        // Sem translate no hover: deslocar a própria caixa que recebe o hover
        // é auto-referente (tremor perto da borda — ver Card.tsx).
        'hover:border-border-strong hover:shadow-md',
        isDragging && 'shadow-lg'
      )}
    >
      {/* Barra lateral: cor da Frente tem precedência sobre a de prioridade. */}
      {frente ? (
        <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: frente.cor }} />
      ) : (
        <span aria-hidden className={clsx('absolute left-0 top-0 bottom-0 w-[3px]', PRIORIDADE_BARRA[tarefa.prioridade ?? ''] ?? 'bg-border')} />
      )}

      {/* Linha 1: número do card + prioridade */}
      <div className="flex items-center gap-1.5">
        <span className="px-1.5 rounded-[4px] bg-bg border border-border text-[0.62rem] font-semibold text-text-secondary leading-[1.5] tabular-nums">
          {tarefa.numero ? `#${tarefa.numero}` : '—'}
        </span>
        {progresso !== null && (
          <span
            className="px-1.5 rounded-full bg-accent-soft text-[color:var(--accent-fg)] text-[0.62rem] font-bold leading-[1.5] tabular-nums"
            title={`${progresso}% das tarefas vinculadas concluídas`}
          >
            {progresso}%
          </span>
        )}
        {tarefa.tamanho && (
          <span className="ml-auto shrink-0 px-1.5 rounded-[4px] bg-bg border border-border text-[0.62rem] font-semibold text-text-secondary leading-[1.5]" title="Tamanho">
            {tarefa.tamanho}
          </span>
        )}
        {campos.includes('prioridade') && (
          <span className={clsx('text-[0.63rem] font-medium truncate shrink-0', PRIORIDADE_TEXTO[tarefa.prioridade ?? ''] ?? 'text-text-muted', !tarefa.tamanho && 'ml-auto')}>
            {tarefa.prioridade || 'Nenhum'}
          </span>
        )}
      </div>

      {/* Linha 2: título + avatares dos responsáveis (até 3, "+N" se houver mais) */}
      <div className="flex items-start gap-2">
        <span className="flex-1 text-[0.8rem] font-semibold text-text-primary leading-[1.35] break-words">{tarefa.titulo}</span>
        {campos.includes('responsaveis') && tarefa.responsaveis && tarefa.responsaveis.length > 0 && (
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
        {campos.includes('dueAt') && prazo && (
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
        {campos.includes('subtarefas') && subtarefas.length > 0 && (
          <span className="flex items-center gap-1" title="Subtarefas concluídas">
            <ListChecks size={11} /> {feitas}/{subtarefas.length}
          </span>
        )}
      </div>

      {/* Iniciativa vinculada (agrupador/épico do mesmo board) */}
      {iniciativa && (
        <div className="flex items-center gap-1 text-[0.66rem] text-text-secondary min-w-0" title={`Iniciativa: ${iniciativa.titulo}`}>
          <ArrowUp size={10} className="shrink-0 text-text-muted" />
          <span className="truncate">Iniciativa: {iniciativa.titulo}</span>
        </div>
      )}

      {/* Linha 4: cliente vinculado */}
      {cliente && (
        <div className="flex items-center gap-1 text-[0.66rem] text-text-secondary min-w-0" title={cliente.empresa}>
          <ArrowUp size={10} className="shrink-0 text-text-muted" />
          <span className="truncate">{cliente.empresa}</span>
        </div>
      )}

      {/* Frente — substitui o antigo campo Etiquetas (texto livre) */}
      {frente && (
        <span
          className="self-start px-1.5 rounded-full text-[0.62rem] font-medium leading-[1.55]"
          style={{ background: frente.cor, color: corContrastante(frente.cor) }}
        >
          {frente.nome}
        </span>
      )}

      {/* Subtarefas inline */}
      {campos.includes('subtarefas') && subtarefas.length > 0 && (
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
