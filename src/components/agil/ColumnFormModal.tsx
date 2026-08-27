import { useState, type FormEvent } from 'react';
import { useCarteira } from '../../context/CarteiraContext';
import { toastError } from '../../utils/toast';
import { confirmDialog } from '../../utils/confirmDialog';
import { ModalShell } from '../ModalShell';
import { Button, Field, Input, Select } from '../../ui';
import type { AgilColuna } from '../../types';

interface ColumnFormModalProps {
  boardId: string;
  initial?: AgilColuna;
  /** Pré-seleciona o pai ao criar (botão "dividir em sub-colunas" do cabeçalho). */
  parentIdInicial?: string;
  /** Colunas de topo — candidatas a pai. */
  colunasTopo: AgilColuna[];
  /** A coluna em edição já é agrupadora (tem sub-colunas): não pode virar filha. */
  temFilhos: boolean;
  onClose: () => void;
}

export function ColumnFormModal({ boardId, initial, parentIdInicial, colunasTopo, temFilhos, onClose }: ColumnFormModalProps) {
  const { criarAgilColuna, atualizarAgilColuna, removerAgilColuna } = useCarteira();
  const [titulo, setTitulo] = useState(initial?.titulo ?? '');
  const [parentId, setParentId] = useState(initial?.parentId ?? parentIdInicial ?? '');
  const [wipLimit, setWipLimit] = useState(initial?.wipLimit ? String(initial.wipLimit) : '');
  const [cor, setCor] = useState(initial?.cor ?? '');
  const [saving, setSaving] = useState(false);

  // Só 2 níveis: uma coluna que já é agrupadora não pode virar sub-coluna, e ela
  // própria nunca aparece como candidata a pai de si mesma.
  const paisPossiveis = colunasTopo.filter((c) => c.id !== initial?.id);
  const podeEscolherPai = !temFilhos;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) return;
    setSaving(true);
    try {
      const wipLimitNum = wipLimit.trim() ? Number(wipLimit) : undefined;
      if (initial) {
        await atualizarAgilColuna(initial.id, { titulo, wipLimit: wipLimitNum, parentId, cor: cor || undefined });
      } else {
        await criarAgilColuna({ boardId, titulo, wipLimit: wipLimitNum, parentId, cor: cor || undefined });
      }
      onClose();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao salvar a coluna.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial) return;
    const aviso = temFilhos
      ? `Excluir a coluna "${initial.titulo}"? Isso remove as sub-colunas dela e todas as tarefas dessas colunas.`
      : `Excluir a coluna "${initial.titulo}"? Isso também remove as tarefas dela.`;
    if (!(await confirmDialog(aviso, { danger: true, confirmLabel: 'Excluir' }))) return;
    await removerAgilColuna(initial.id);
    onClose();
  }

  return (
    <ModalShell
      title={initial ? 'Editar coluna' : parentIdInicial ? 'Nova sub-coluna' : 'Nova coluna'}
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
      <Field label="Título da coluna">
        <Input tone="modal" autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
      </Field>

      <Field label="Dentro da coluna (opcional)">
        <Select tone="modal" value={parentId} onChange={(e) => setParentId(e.target.value)} disabled={!podeEscolherPai}>
          <option value="">Nenhuma — coluna de topo</option>
          {paisPossiveis.map((c) => <option key={c.id} value={c.id}>{c.titulo}</option>)}
        </Select>
        <span className="text-[0.72rem] text-text-muted mt-1 block font-normal">
          {podeEscolherPai
            ? 'Escolher uma coluna aqui transforma esta em sub-coluna dela. As tarefas ficam sempre nas sub-colunas.'
            : 'Esta coluna já tem sub-colunas, então não pode virar sub-coluna de outra (máximo 2 níveis).'}
        </span>
      </Field>

      <Field label="Limite de tarefas simultâneas (WIP limit, opcional)">
        <Input tone="modal" type="number" min={1} value={wipLimit} onChange={(e) => setWipLimit(e.target.value)} placeholder="Sem limite" />
        <span className="text-[0.72rem] text-text-muted mt-1 block font-normal">
          Numa coluna com sub-colunas, o limite vale para o grupo inteiro.
        </span>
      </Field>

      <Field label="Cor (opcional)" as="div">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={cor || '#8a8a92'}
            onChange={(e) => setCor(e.target.value)}
            className="w-8 h-8 shrink-0 rounded-[6px] border border-border-strong cursor-pointer bg-transparent p-0"
          />
          {cor && (
            <button type="button" onClick={() => setCor('')} className="text-[0.74rem] text-text-muted bg-transparent border-none cursor-pointer hover:text-accent">
              Remover cor
            </button>
          )}
        </div>
        <span className="text-[0.72rem] text-text-muted mt-1 block font-normal">
          Usada só na bolinha de progresso de uma Iniciativa vinculada — sem cor, aparece cinza.
        </span>
      </Field>
    </ModalShell>
  );
}
