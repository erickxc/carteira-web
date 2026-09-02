import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, isPast, parse, startOfDay } from 'date-fns';
import { AlertTriangle, CalendarClock, KanbanSquare } from 'lucide-react';
import clsx from 'clsx';
import { useCarteira } from '../../context/CarteiraContext';
import { Card } from '../../ui';
import type { Cliente } from '../../types';

interface AgilTarefasCardProps {
  cliente: Cliente;
}

/**
 * Tarefas do Ágil (Kanban interno) vinculadas a este cliente (`AgilTarefa.clientId`).
 * Só leitura + navegação — editar a tarefa continua sendo feito no board, o
 * mesmo padrão do agente de IA (`buscar_tarefas_cliente`), que já cruzava esse
 * dado sem a ficha do cliente nunca mostrar de volta. Oculto quando vazio, sem
 * popup: diferente de Contatos (que virou popup por sobrecarregar o cabeçalho),
 * aqui é uma lista curta e opcional.
 */
export function AgilTarefasCard({ cliente }: AgilTarefasCardProps) {
  const navigate = useNavigate();
  const { agilTarefas, agilBoards, agilColunas, agilWorkspaces } = useCarteira();

  const tarefas = useMemo(
    () => agilTarefas
      .filter((t) => t.clientId === cliente.id)
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')),
    [agilTarefas, cliente.id]
  );

  if (tarefas.length === 0) return null;

  function abrirBoard(boardId: string, workspaceId: string) {
    navigate('/agil', { state: { agilWorkspaceId: workspaceId, agilBoardId: boardId } });
  }

  return (
    <Card flat style={{ marginBottom: 24 }}>
      <div className="section-header">
        <h3>Tarefas Ágil</h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>{tarefas.length}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {tarefas.map((t) => {
          const board = agilBoards.find((b) => b.id === t.boardId);
          const coluna = agilColunas.find((c) => c.id === t.colunaId);
          const workspaceId = board?.workspaceId ?? agilWorkspaces[0]?.id ?? '';
          let prazo: { texto: string; vencido: boolean } | null = null;
          if (t.dueAt) {
            const d = parse(t.dueAt, 'yyyy-MM-dd', new Date());
            prazo = { texto: format(d, 'dd/MM'), vencido: isPast(d) && d < startOfDay(new Date()) };
          }
          return (
            <button
              key={t.id}
              onClick={() => abrirBoard(t.boardId, workspaceId)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded text-left bg-bg border border-border cursor-pointer transition-colors hover:border-border-strong hover:bg-card-hover"
            >
              <KanbanSquare size={13} className="shrink-0 text-text-muted" />
              <span className="flex-1 min-w-0 truncate text-[0.8rem] text-text-primary">{t.titulo}</span>
              {board && (
                <span className="shrink-0 text-[0.66rem] text-text-muted truncate max-w-[110px]" title={`${board.nome} · ${coluna?.titulo ?? ''}`}>
                  {board.nome}{coluna ? ` · ${coluna.titulo}` : ''}
                </span>
              )}
              {t.bloqueado && (
                <span className="shrink-0 text-danger" title={t.motivoBloqueio || 'Tarefa bloqueada'}>
                  <AlertTriangle size={12} />
                </span>
              )}
              {prazo && (
                <span
                  className={clsx(
                    'shrink-0 flex items-center gap-1 text-[0.66rem]',
                    prazo.vencido ? 'text-danger font-semibold' : 'text-text-muted'
                  )}
                >
                  <CalendarClock size={11} /> {prazo.texto}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
