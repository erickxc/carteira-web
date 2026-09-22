import { useState } from 'react';
import { ChevronRight, Lock, Plus, Settings, Tag } from 'lucide-react';
import clsx from 'clsx';
import { workspaceDesbloqueada } from '../../utils/agilWorkspacePin';
import type { AgilBoard, AgilWorkspace } from '../../types';

interface AgilSidebarProps {
  workspaces: AgilWorkspace[];
  boards: AgilBoard[];
  workspaceId: string;
  boardId: string;
  onSelectWorkspace: (id: string) => void;
  onSelectBoard: (id: string) => void;
  onNovaWorkspace: () => void;
  onNovoBoard: (workspaceId: string) => void;
  onEditWorkspace: (w: AgilWorkspace) => void;
  onAbrirConfigAgil: () => void;
}

export function AgilSidebar({
  workspaces, boards, workspaceId, boardId, onSelectWorkspace, onSelectBoard,
  onNovaWorkspace, onNovoBoard, onEditWorkspace, onAbrirConfigAgil,
}: AgilSidebarProps) {
  const [aberta, setAberta] = useState<string | null>(workspaceId || null);

  return (
    <aside
      className="w-[240px] shrink-0 flex flex-col gap-1 p-3 rounded-xl border border-border bg-card"
      style={{ maxHeight: 'calc(100vh - 140px)', overflowY: 'auto' }}
    >
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="text-[0.7rem] font-bold uppercase tracking-[0.06em] text-text-muted">Áreas de trabalho</span>
        <button
          onClick={onNovaWorkspace}
          className="flex items-center justify-center w-5 h-5 rounded-sm text-text-muted bg-transparent border-none cursor-pointer hover:bg-card-hover hover:text-text-primary"
          title="Nova área de trabalho"
          aria-label="Nova área de trabalho"
        >
          <Plus size={13} />
        </button>
      </div>

      {workspaces.length === 0 && (
        <p className="px-1 text-[0.76rem] text-text-muted">Nenhuma área de trabalho ainda.</p>
      )}

      {workspaces.map((w) => {
        const bloqueada = !!w.senha && !workspaceDesbloqueada(w.id);
        // Board fixo de Iniciativas fica FORA da lista comum de quadros —
        // aparece pinado, com ícone próprio.
        const boardsDaArea = boards.filter((b) => b.workspaceId === w.id && b.id !== w.iniciativasBoardId);
        const expandido = aberta === w.id;
        return (
          <div key={w.id}>
            <div
              role="button"
              tabIndex={0}
              className={clsx(
                'group flex items-center gap-1 px-1.5 py-1.5 rounded cursor-pointer text-[0.82rem]',
                workspaceId === w.id ? 'bg-card-hover text-text-primary font-semibold' : 'text-text-secondary hover:bg-card-hover'
              )}
              onClick={() => {
                setAberta(expandido ? null : w.id);
                onSelectWorkspace(w.id);
              }}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setAberta(expandido ? null : w.id);
                  onSelectWorkspace(w.id);
                }
              }}
            >
              <ChevronRight size={13} className={clsx('shrink-0 transition-transform', expandido && 'rotate-90')} />
              {bloqueada && <Lock size={11} className="shrink-0 text-text-muted" />}
              <span className="flex-1 truncate">{w.nome}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onEditWorkspace(w); }}
                className="shrink-0 flex items-center justify-center w-[18px] h-[18px] rounded-[4px] text-text-muted bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100 hover:bg-card hover:text-text-primary"
                title="Editar área de trabalho"
                aria-label={`Editar área de trabalho ${w.nome}`}
              >
                <Settings size={11} />
              </button>
            </div>

            {expandido && !bloqueada && (
              <div className="flex flex-col gap-0.5 pl-5 mt-0.5 mb-1">
                {boardsDaArea.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => onSelectBoard(b.id)}
                    className={clsx(
                      'text-left px-1.5 py-1 rounded text-[0.78rem] bg-transparent border-none cursor-pointer truncate',
                      boardId === b.id ? 'bg-accent-soft text-[color:var(--accent-fg)] font-medium' : 'text-text-secondary hover:bg-card-hover'
                    )}
                  >
                    {b.nome}
                  </button>
                ))}
                <button
                  onClick={() => onNovoBoard(w.id)}
                  className="flex items-center gap-1 px-1.5 py-1 text-[0.74rem] text-text-muted bg-transparent border-none cursor-pointer hover:text-accent"
                >
                  <Plus size={11} /> Quadro
                </button>
              </div>
            )}
          </div>
        );
      })}

      <div className="mt-3 pt-2 border-t border-border">
        <button
          onClick={onAbrirConfigAgil}
          className="flex items-center gap-1.5 px-1.5 py-1.5 w-full text-left text-[0.78rem] text-text-secondary bg-transparent border-none cursor-pointer rounded hover:bg-card-hover hover:text-text-primary"
          aria-label="Configurações do Ágil"
        >
          <Tag size={13} /> Configurações do Ágil
        </button>
      </div>
    </aside>
  );
}
