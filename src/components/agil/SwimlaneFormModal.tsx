import { useState, type FormEvent } from 'react';
import { useCarteira } from '../../context/CarteiraContext';
import { toastError } from '../../utils/toast';
import { confirmDialog } from '../../utils/confirmDialog';
import { ModalShell } from '../ModalShell';
import { Button, Field, Input } from '../../ui';
import type { AgilSwimlane } from '../../types';

interface SwimlaneFormModalProps {
  boardId: string;
  /** Nome do board dono — exibido no modal para deixar claro que a swimlane é
   *  uma faixa DENTRO deste board, não um board novo (confusão real já
   *  relatada: usuário queria criar um board separado e usou este botão). */
  boardNome: string;
  initial?: AgilSwimlane;
  onClose: () => void;
}

export function SwimlaneFormModal({ boardId, boardNome, initial, onClose }: SwimlaneFormModalProps) {
  const { criarAgilSwimlane, atualizarAgilSwimlane, removerAgilSwimlane } = useCarteira();
  const [titulo, setTitulo] = useState(initial?.titulo ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) return;
    setSaving(true);
    try {
      if (initial) {
        await atualizarAgilSwimlane(initial.id, { titulo });
      } else {
        await criarAgilSwimlane({ boardId, titulo });
      }
      onClose();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao salvar a swimlane.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial) return;
    if (!(await confirmDialog(`Excluir a swimlane "${initial.titulo}"? Isso também remove as tarefas dela.`, { danger: true, confirmLabel: 'Excluir' }))) return;
    await removerAgilSwimlane(initial.id);
    onClose();
  }

  return (
    <ModalShell
      title={initial ? 'Editar swimlane' : 'Nova swimlane'}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={
        <>
          {initial && <Button variant="danger" onClick={handleDelete} style={{ marginRight: 'auto' }}>Excluir</Button>}
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </>
      }
    >
      <p className="text-[0.78rem] text-text-muted mb-3">
        Uma swimlane é uma faixa horizontal <strong>dentro do board "{boardNome}"</strong> — para criar um board
        separado, use "Novo board" em vez deste botão.
      </p>
      <Field label="Título da swimlane">
        <Input tone="modal" autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
      </Field>
    </ModalShell>
  );
}
