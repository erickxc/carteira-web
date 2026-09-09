import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Briefcase, Plus, Settings } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { usePersistedState } from '../hooks/usePersistedState';
import { KanbanBoard } from '../components/agil/KanbanBoard';
import { BoardFormModal } from '../components/agil/BoardFormModal';
import { WorkspaceFormModal } from '../components/agil/WorkspaceFormModal';
import { FrentesManagerModal } from '../components/agil/FrentesManagerModal';
import { IniciativasManagerModal } from '../components/agil/IniciativasManagerModal';
import { AgilSidebar } from '../components/agil/AgilSidebar';
import { WorkspacePinModal } from '../components/agil/WorkspacePinModal';
import { desbloquearWorkspace, workspaceDesbloqueada } from '../utils/agilWorkspacePin';
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
  const [configAgilAberta, setConfigAgilAberta] = useState(false);
  const [iniciativasAberta, setIniciativasAberta] = useState(false);
  const [pinPendente, setPinPendente] = useState<AgilWorkspace | null>(null);

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
  const boardsDaWorkspace = useMemo(
    () => (workspace ? agilBoards.filter((b) => b.workspaceId === workspace.id) : []),
    [agilBoards, workspace]
  );
  const board = useMemo(
    () => boardsDaWorkspace.find((b) => b.id === boardId) ?? boardsDaWorkspace[0],
    [boardsDaWorkspace, boardId]
  );

  // Área com PIN e ainda não desbloqueada nesta aba: pede o PIN antes de
  // mostrar qualquer board dela. Barreira leve de UI, não segurança real.
  const bloqueada = !!workspace?.senha && !workspaceDesbloqueada(workspace.id);

  function selecionarWorkspace(id: string) {
    const w = agilWorkspaces.find((x) => x.id === id);
    if (w?.senha && !workspaceDesbloqueada(w.id)) {
      setPinPendente(w);
      return;
    }
    setWorkspaceId(id);
    setBoardId('');
  }

  return (
    <div className="page-container">
      <div className="flex items-center gap-1.5 mb-4">
        <Briefcase size={15} className="shrink-0 text-text-muted" />
        <h1 className="page-title" style={{ margin: 0, fontSize: '1.15rem' }}>Ágil</h1>
      </div>

      <div className="flex gap-5">
        <AgilSidebar
          workspaces={agilWorkspaces}
          boards={agilBoards}
          workspaceId={workspace?.id ?? ''}
          boardId={board?.id ?? ''}
          onSelectWorkspace={selecionarWorkspace}
          onSelectBoard={setBoardId}
          onNovaWorkspace={() => setWorkspaceModal('nova')}
          onNovoBoard={() => setBoardModal('novo')}
          onEditWorkspace={(w) => setWorkspaceModal(w)}
          onAbrirConfigAgil={() => setConfigAgilAberta(true)}
        />

        <div className="flex-1 min-w-0">
          {!workspace ? (
            <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
              Nenhuma área de trabalho ainda. Crie a primeira para começar.
            </div>
          ) : bloqueada ? (
            <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
              Esta área de trabalho tem PIN. Selecione-a na barra lateral para desbloquear.
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
                <div className="min-w-0">
                  <h2 className="truncate" style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{board?.nome ?? 'Nenhum quadro'}</h2>
                  {board?.descricao && <p className="page-subtitle" style={{ margin: 0 }}>{board.descricao}</p>}
                </div>
                <div className="flex-row" style={{ gap: '0.6rem', flexShrink: 0 }}>
                  {board && (
                    <Button variant="secondary" onClick={() => setIniciativasAberta(true)}>Iniciativas</Button>
                  )}
                  {board && (
                    <Button variant="secondary" onClick={() => setBoardModal(board)} title="Editar quadro">
                      <Settings size={16} />
                    </Button>
                  )}
                  <Button variant="primary" onClick={() => setBoardModal('novo')}>
                    <Plus size={16} /> Novo quadro
                  </Button>
                </div>
              </div>

              {board ? (
                <KanbanBoard board={board} />
              ) : (
                <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
                  Nenhum quadro nesta área de trabalho ainda. Crie o primeiro para começar a organizar as tarefas da equipe.
                </div>
              )}
            </>
          )}
        </div>
      </div>

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

      {configAgilAberta && <FrentesManagerModal onClose={() => setConfigAgilAberta(false)} />}

      {iniciativasAberta && board && (
        <IniciativasManagerModal boardId={board.id} boardNome={board.nome} onClose={() => setIniciativasAberta(false)} />
      )}

      {pinPendente && (
        <WorkspacePinModal
          workspaceNome={pinPendente.nome}
          onConfirm={(pin) => {
            if (pin !== pinPendente.senha) return false;
            desbloquearWorkspace(pinPendente.id);
            setWorkspaceId(pinPendente.id);
            setBoardId('');
            return true;
          }}
          onClose={() => setPinPendente(null)}
        />
      )}
    </div>
  );
}
