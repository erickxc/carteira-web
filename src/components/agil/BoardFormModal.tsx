import { useState, type FormEvent } from 'react';
import { useCarteira } from '../../context/CarteiraContext';
import { toastError } from '../../utils/toast';
import { confirmDialog } from '../../utils/confirmDialog';
import { ModalShell } from '../ModalShell';
import { Button, Field, Input, Textarea } from '../../ui';
import { SelectField } from '../SelectField';
import type { AgilBoard } from '../../types';

interface BoardFormModalProps {
  initial?: AgilBoard;
  /** Workspace pré-selecionada ao criar (a que está aberta na página). */
  workspaceIdInicial: string;
  onClose: () => void;
  onCreated?: (board: AgilBoard) => void;
  onDeleted?: () => void;
}

export function BoardFormModal({ initial, workspaceIdInicial, onClose, onCreated, onDeleted }: BoardFormModalProps) {
  const { agilWorkspaces, criarAgilBoard, atualizarAgilBoard, removerAgilBoard } = useCarteira();
  const [nome, setNome] = useState(initial?.nome ?? '');
  const [descricao, setDescricao] = useState(initial?.descricao ?? '');
  const [workspaceId, setWorkspaceId] = useState(initial?.workspaceId ?? workspaceIdInicial);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !workspaceId) return;
    setSaving(true);
    try {
      const payload = { nome, descricao, workspaceId };
      if (initial) {
        await atualizarAgilBoard(initial.id, payload);
      } else {
        const novo = await criarAgilBoard(payload);
        onCreated?.(novo);
      }
      onClose();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao salvar o board.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial) return;
    if (!(await confirmDialog(`Excluir o board "${initial.nome}"? Isso também remove todas as colunas, tarefas e iniciativas dele.`, { danger: true, confirmLabel: 'Excluir' }))) return;
    await removerAgilBoard(initial.id);
    onDeleted?.();
    onClose();
  }

  return (
    <ModalShell
      title={initial ? 'Editar board' : 'Novo board'}
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
      <Field label="Nome do board">
        <Input tone="modal" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} required />
      </Field>

      <SelectField
        label="Área de trabalho"
        value={workspaceId}
        onChange={setWorkspaceId}
        options={agilWorkspaces.map((w) => ({ value: w.id, label: w.nome }))}
      />

      <Field label="Descrição (opcional)">
        <Textarea tone="modal" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </Field>

      {!initial && (
        <p className="text-[0.76rem] text-text-muted">
          O board nasce com 5 colunas de período (Backlog, A fazer, Em andamento, Validação, Concluído) — editáveis depois.
        </p>
      )}
    </ModalShell>
  );
}
