import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useCarteira } from '../../context/CarteiraContext';
import { toastError } from '../../utils/toast';
import { confirmDialog } from '../../utils/confirmDialog';
import { ModalShell } from '../ModalShell';
import { Button, Input } from '../../ui';
import type { AgilIniciativa } from '../../types';

interface IniciativasManagerModalProps {
  boardId: string;
  boardNome: string;
  onClose: () => void;
}

/** Gerenciador de Iniciativas (agrupador/épico) DESTE board. */
export function IniciativasManagerModal({ boardId, boardNome, onClose }: IniciativasManagerModalProps) {
  const { agilIniciativas, agilTarefas, criarAgilIniciativa, atualizarAgilIniciativa, removerAgilIniciativa } = useCarteira();
  const iniciativas = agilIniciativas.filter((i) => i.boardId === boardId).sort((a, b) => a.ordem - b.ordem);

  const [novoTitulo, setNovoTitulo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editTitulo, setEditTitulo] = useState('');

  async function adicionar() {
    const titulo = novoTitulo.trim();
    if (!titulo) return;
    setSalvando(true);
    try {
      await criarAgilIniciativa({ boardId, titulo });
      setNovoTitulo('');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao criar a iniciativa.');
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(i: AgilIniciativa) {
    setEditandoId(i.id);
    setEditTitulo(i.titulo);
  }

  async function salvarEdicao(id: string) {
    const titulo = editTitulo.trim();
    if (!titulo) return;
    await atualizarAgilIniciativa(id, { titulo });
    setEditandoId(null);
  }

  async function excluir(i: AgilIniciativa) {
    const uso = agilTarefas.filter((t) => t.iniciativaId === i.id).length;
    const impacto = uso > 0
      ? `${uso} tarefa(s) apontam pra "${i.titulo}" hoje — elas não são apagadas, só ficam sem iniciativa.`
      : `Nenhuma tarefa aponta pra "${i.titulo}" hoje.`;
    if (!(await confirmDialog(`Remover a iniciativa "${i.titulo}"? ${impacto}`, { danger: true, confirmLabel: 'Remover' }))) return;
    await removerAgilIniciativa(i.id);
  }

  return (
    <ModalShell title={`Iniciativas — ${boardNome}`} onClose={onClose} onSubmit={(e) => e.preventDefault()} footer={<Button variant="secondary" onClick={onClose}>Fechar</Button>}>
      <p className="text-[0.8rem] text-text-muted mb-3">
        Iniciativa agrupa várias tarefas deste quadro (épico) — crie quantas quiser.
      </p>

      <div className="flex flex-col gap-2 mb-4">
        {iniciativas.length === 0 && <div className="empty-state">Nenhuma iniciativa ainda.</div>}
        {iniciativas.map((i) => (
          <div key={i.id} className="flex items-center gap-2 px-2.5 py-2 rounded bg-bg border border-border">
            {editandoId === i.id ? (
              <>
                <Input
                  tone="modal"
                  autoFocus
                  value={editTitulo}
                  onChange={(e) => setEditTitulo(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') salvarEdicao(i.id); if (e.key === 'Escape') setEditandoId(null); }}
                  style={{ flex: 1 }}
                />
                <Button variant="secondary" size="icon" onClick={() => salvarEdicao(i.id)} title="Salvar"><Check size={14} /></Button>
                <Button variant="secondary" size="icon" onClick={() => setEditandoId(null)} title="Cancelar"><X size={14} /></Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-[0.85rem] text-text-primary truncate">{i.titulo}</span>
                <Button variant="secondary" size="icon" onClick={() => iniciarEdicao(i)} title="Editar"><Pencil size={13} /></Button>
                <Button variant="danger" size="icon" onClick={() => excluir(i)} title="Remover"><Trash2 size={13} /></Button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-border">
        <Input
          tone="modal"
          placeholder="Nova iniciativa..."
          value={novoTitulo}
          onChange={(e) => setNovoTitulo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }}
          style={{ flex: 1 }}
        />
        <Button variant="primary" onClick={adicionar} disabled={salvando || !novoTitulo.trim()}>
          <Plus size={14} /> Adicionar
        </Button>
      </div>
    </ModalShell>
  );
}
