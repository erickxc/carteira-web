import { useState, type FormEvent } from 'react';
import { useCarteira } from '../../context/CarteiraContext';
import { toastError } from '../../utils/toast';
import { confirmDialog } from '../../utils/confirmDialog';
import { ModalShell } from '../ModalShell';
import { Button, Field, Input } from '../../ui';
import type { AgilSwimlane } from '../../types';

interface SwimlaneFormModalProps {
  boardId: string;
  initial?: AgilSwimlane;
  onClose: () => void;
}

export function SwimlaneFormModal({ boardId, initial, onClose }: SwimlaneFormModalProps) {
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
    if (!(await confirmDialog(`Excluir a raia "${initial.titulo}"? As tarefas dela voltam pra raia padrão.`, { danger: true, confirmLabel: 'Excluir' }))) return;
    await removerAgilSwimlane(initial.id);
    onClose();
  }

  return (
    <ModalShell
      title={initial ? 'Editar raia (swimlane)' : 'Nova raia (swimlane)'}
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
      <Field label="Título da raia">
        <Input tone="modal" autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} required placeholder="Ex.: Backlog" />
      </Field>
      <span className="text-[0.72rem] text-text-muted block font-normal">
        Raias organizam as tarefas em linhas horizontais dentro do quadro (ex.: Backlog / Em andamento / Arquivo). Sem nenhuma raia cadastrada, o quadro fica como hoje, sem linhas.
      </span>
    </ModalShell>
  );
}
