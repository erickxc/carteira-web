import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Briefcase, ChevronRight, Plus, Settings } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { usePersistedState } from '../hooks/usePersistedState';
import { KanbanBoard } from '../components/agil/KanbanBoard';
import { BoardFormModal } from '../components/agil/BoardFormModal';
import { WorkspaceFormModal } from '../components/agil/WorkspaceFormModal';
import { Dropdown } from '../components/Dropdown';
import { Button } from '../ui';
import type { AgilBoard, AgilWorkspace } from '../types';

export default function AgilPage() {
  const { agilWorkspaces, agilBoards } = useCarteira();
  const location = useLocation();
  const navigate = useNavigate();
  const [workspaceId, setWorkspaceId] = usePersistedState<string>('agil:workspaceId', '');
  const [boardId, setBoardId] = usePersistedState<string>('agil:boardId', '');
  const [workspaceModal, setWorkspaceModal] = useState<'nova' | AgilWorkspace | null>(null);
  const [boardModal, setBoardModal] = useState<'novo' | AgilBoard | null>(null);

  // Navegação vinda de outra tela (ex.: card de tarefas Ágil na ficha do
  // cliente) já chega com workspace/board escolhidos. Depende de `location.key`
  // (não de `[]`) — senão clicar duas vezes numa tarefa do mesmo board, com a
  // página já montada, não dispararia de novo (mesmo bug já visto na Agenda).
  useEffect(() => {
    const state = location.state as { agilWorkspaceId?: string; agilBoardId?: string } | null;
    if (!state?.agilWorkspaceId && !state?.agilBoardId) return;
    if (state.agilWorkspaceId) setWorkspaceId(state.agilWorkspaceId);
    if (state.agilBoardId) setBoardId(state.agilBoardId);
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

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
      {/* Cabeçalho único: breadcrumb clicável (Ágil › [Workspace] › Board) à
          esquerda, ações à direita — um só nível visual em vez de duas linhas
          soltas (rótulo pequeno + board grande) que antes exigiam o olho pular
          entre dois pesos tipográficos bem diferentes pra entender "onde estou". */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <Briefcase size={15} className="shrink-0 text-text-muted" />
          <span className="text-[0.78rem] font-semibold text-text-muted">Ágil</span>

          {agilWorkspaces.length > 1 && (
            <>
              <ChevronRight size={13} className="shrink-0 text-text-muted" />
              <Dropdown
                label="Área de trabalho"
                value={workspace?.id ?? ''}
                onChange={(v) => { setWorkspaceId(v as string); setBoardId(''); }}
                options={agilWorkspaces.map((w) => ({ value: w.id, label: w.nome }))}
              />
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

          <ChevronRight size={13} className="shrink-0 text-text-muted" />
          {boardsDaWorkspace.length > 1 ? (
            <Dropdown
              label="Board"
              value={board?.id ?? ''}
              onChange={(v) => setBoardId(v as string)}
              options={boardsDaWorkspace.map((b) => ({ value: b.id, label: b.nome }))}
            />
          ) : (
            <h1 className="page-title truncate" style={{ margin: 0, fontSize: '1.15rem' }}>{board?.nome ?? 'Nenhum board'}</h1>
          )}

          <button
            onClick={() => setWorkspaceModal('nova')}
            className="flex items-center gap-1 text-[0.72rem] text-text-muted bg-transparent border-none cursor-pointer hover:text-accent"
            title="Nova área de trabalho"
          >
            <Plus size={12} /> Área de trabalho
          </button>
        </div>

        <div className="flex-row" style={{ gap: '0.6rem', flexShrink: 0 }}>
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
      {board?.descricao && (
        <p className="page-subtitle" style={{ margin: '0 0 0.25rem' }}>{board.descricao}</p>
      )}

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
