import { useState, type FormEvent } from 'react';
import { useCarteira } from '../../context/CarteiraContext';
import { toastError } from '../../utils/toast';
import { confirmDialog } from '../../utils/confirmDialog';
import { ModalShell } from '../ModalShell';
import { Button, Field, Input, Textarea } from '../../ui';
import type { AgilWorkspace } from '../../types';

interface WorkspaceFormModalProps {
  initial?: AgilWorkspace;
  onClose: () => void;
  onCreated?: (workspace: AgilWorkspace) => void;
  onDeleted?: () => void;
}

export function WorkspaceFormModal({ initial, onClose, onCreated, onDeleted }: WorkspaceFormModalProps) {
  const { agilBoards, criarAgilWorkspace, atualizarAgilWorkspace, removerAgilWorkspace } = useCarteira();
  const [nome, setNome] = useState(initial?.nome ?? '');
  const [descricao, setDescricao] = useState(initial?.descricao ?? '');
  const [senha, setSenha] = useState(initial?.senha ?? '');
  const [saving, setSaving] = useState(false);

  function handleSenhaChange(v: string) {
    setSenha(v.replace(/\D/g, '').slice(0, 4));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    if (senha && senha.length !== 4) { toastError('O PIN precisa ter exatamente 4 dígitos.'); return; }
    setSaving(true);
    try {
      if (initial) {
        await atualizarAgilWorkspace(initial.id, { nome, descricao, senha });
      } else {
        const nova = await criarAgilWorkspace({ nome, descricao, senha: senha || undefined });
        onCreated?.(nova);
      }
      onClose();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao salvar a área de trabalho.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial) return;
    const qtdBoards = agilBoards.filter((b) => b.workspaceId === initial.id).length;
    const aviso = qtdBoards > 0
      ? `Excluir a área de trabalho "${initial.nome}"? Isso também remove ${qtdBoards} board(s) dela, com todas as colunas e tarefas.`
      : `Excluir a área de trabalho "${initial.nome}"? Ela não tem boards.`;
    if (!(await confirmDialog(aviso, { danger: true, confirmLabel: 'Excluir' }))) return;
    await removerAgilWorkspace(initial.id);
    onDeleted?.();
    onClose();
  }

  return (
    <ModalShell
      title={initial ? 'Editar área de trabalho' : 'Nova área de trabalho'}
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
        Uma área de trabalho agrupa vários boards (ex.: por time ou por assunto).
      </p>
      <Field label="Nome da área de trabalho">
        <Input tone="modal" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} required />
      </Field>
      <Field label="Descrição (opcional)">
        <Textarea tone="modal" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </Field>
      <Field label="PIN de 4 dígitos (opcional)">
        <Input tone="modal" inputMode="numeric" placeholder="Nenhum" value={senha} onChange={(e) => handleSenhaChange(e.target.value)} />
      </Field>
      <p className="text-[0.72rem] text-text-muted -mt-2">
        Barreira leve pra evitar abrir por engano — não é senha de verdade (sem criptografia, qualquer um com acesso à API vê os dados). Não use pra proteger informação sensível.
      </p>
    </ModalShell>
  );
}
