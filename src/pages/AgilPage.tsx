import { useMemo, useState } from 'react';
import { Briefcase, Plus, Settings } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { usePersistedState } from '../hooks/usePersistedState';
import { KanbanBoard } from '../components/agil/KanbanBoard';
import { BoardFormModal } from '../components/agil/BoardFormModal';
import { WorkspaceFormModal } from '../components/agil/WorkspaceFormModal';
import { Button, Select } from '../ui';
import type { AgilBoard, AgilWorkspace } from '../types';

export default function AgilPage() {
  const { agilWorkspaces, agilBoards } = useCarteira();
  const [workspaceId, setWorkspaceId] = usePersistedState<string>('agil:workspaceId', '');
  const [boardId, setBoardId] = usePersistedState<string>('agil:boardId', '');
  const [workspaceModal, setWorkspaceModal] = useState<'nova' | AgilWorkspace | null>(null);
  const [boardModal, setBoardModal] = useState<'novo' | AgilBoard | null>(null);

  const workspace = useMemo(
    () => agilWorkspaces.find((w) => w.id === workspaceId) ?? agilWorkspaces[0],
    [agilWorkspaces, workspaceId]
  );
  // Exclui os companheiros de Iniciativas do seletor — eles não são um board
  // "de verdade" pra escolher, só aparecem empilhados acima do board deles.
  const boardsDaWorkspace = useMemo(
    () => (workspace ? agilBoards.filter((b) => b.workspaceId === workspace.id && !b.ehIniciativas) : []),
    [agilBoards, workspace]
  );
  const board = useMemo(
    () => boardsDaWorkspace.find((b) => b.id === boardId) ?? boardsDaWorkspace[0],
    [boardsDaWorkspace, boardId]
  );
  // Board de Iniciativas vinculado (se houver) — renderizado empilhado ACIMA
  // do board de tarefas, na mesma tela. Cada KanbanBoard já é autocontido por
  // board.id (busca suas próprias colunas/swimlanes/tarefas via contexto), daí
  // não precisar de nenhum componente novo pra isso — só renderizar dois.
  const boardIniciativas = useMemo(
    () => (board?.iniciativasBoardId ? agilBoards.find((b) => b.id === board.iniciativasBoardId) : undefined),
    [agilBoards, board]
  );

  return (
    <div className="page-container">
      {/* Linha 1: área de trabalho — só aparece quando há mais de uma, pra não
          adicionar um nível de navegação a quem usa só o padrão "Geral". */}
      <div className="flex items-center gap-2 mb-2.5 flex-wrap">
        <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-text-muted">Ágil</span>
        {agilWorkspaces.length > 1 && (
          <>
            <span className="text-text-muted">·</span>
            <Select value={workspace?.id ?? ''} onChange={(e) => { setWorkspaceId(e.target.value); setBoardId(''); }} style={{ minWidth: 160, height: 28, fontSize: '0.78rem' }} title="Trocar de área de trabalho">
              {agilWorkspaces.map((w) => <option key={w.id} value={w.id}>{w.nome}</option>)}
            </Select>
          </>
        )}
        {workspace && (
          <button
            onClick={() => setWorkspaceModal(workspace)}
            className="flex items-center justify-center w-6 h-6 rounded-sm text-text-muted bg-transparent border-none cursor-pointer hover:bg-card-hover hover:text-text-primary"
            title="Editar área de trabalho"
          >
            <Settings size={13} />
          </button>
        )}
        <button
          onClick={() => setWorkspaceModal('nova')}
          className="flex items-center gap-1 text-[0.74rem] text-text-muted bg-transparent border-none cursor-pointer hover:text-accent"
          title="Nova área de trabalho"
        >
          <Briefcase size={13} /> Nova área de trabalho
        </button>
      </div>

      {/* Linha 2: board — o destaque real da tela. */}
      <div className="flex-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title truncate">{board?.nome ?? 'Nenhum board'}</h1>
          {board?.descricao && <p className="page-subtitle" style={{ margin: 0 }}>{board.descricao}</p>}
        </div>
        <div className="flex-row" style={{ gap: '0.6rem', flexShrink: 0 }}>
          {boardsDaWorkspace.length > 1 && (
            <Select value={board?.id ?? ''} onChange={(e) => setBoardId(e.target.value)} style={{ minWidth: 180 }} title="Trocar de board">
              {boardsDaWorkspace.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
            </Select>
          )}
          {board && (
            <Button variant="secondary" onClick={() => setBoardModal(board)} title="Editar board">
              <Settings size={16} />
            </Button>
          )}
          {workspace && (
            <Button variant="primary" onClick={() => setBoardModal('novo')}>
              <Plus size={16} /> Novo board
            </Button>
          )}
        </div>
      </div>

      {!workspace ? (
        <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
          Nenhuma área de trabalho ainda. Crie a primeira para começar.
        </div>
      ) : board ? (
        <>
          {boardIniciativas && (
            <div className="mb-1">
              <div className="text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-text-muted mb-1">
                Iniciativas · {boardIniciativas.nome}
              </div>
              <KanbanBoard board={boardIniciativas} />
            </div>
          )}
          <div className={boardIniciativas ? 'mt-5' : undefined}>
            {boardIniciativas && (
              <div className="text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-text-muted mb-1">
                Tarefas · {board.nome}
              </div>
            )}
            <KanbanBoard board={board} />
          </div>
        </>
      ) : (
        <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
          Nenhum board nesta área de trabalho ainda. Crie o primeiro para começar a organizar as tarefas da equipe.
        </div>
      )}

      {workspaceModal && (
        <WorkspaceFormModal
          initial={workspaceModal === 'nova' ? undefined : workspaceModal}
          onClose={() => setWorkspaceModal(null)}
          onCreated={(nova) => setWorkspaceId(nova.id)}
          onDeleted={() => setWorkspaceId('')}
        />
      )}

      {boardModal && workspace && (
        <BoardFormModal
          initial={boardModal === 'novo' ? undefined : boardModal}
          workspaceIdInicial={workspace.id}
          onClose={() => setBoardModal(null)}
          onCreated={(novo) => setBoardId(novo.id)}
          onDeleted={() => setBoardId('')}
        />
      )}
    </div>
  );
}
