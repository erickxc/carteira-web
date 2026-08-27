import { useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { useCarteira } from '../../context/CarteiraContext';
import { toastError } from '../../utils/toast';
import { Button, Input } from '../../ui';

interface SubtarefasTabProps {
  tarefaId: string;
}

export function SubtarefasTab({ tarefaId }: SubtarefasTabProps) {
  const { agilSubtarefas, criarAgilSubtarefa, atualizarAgilSubtarefa, removerAgilSubtarefa } = useCarteira();
  const [titulo, setTitulo] = useState('');
  const [saving, setSaving] = useState(false);

  const subtarefas = agilSubtarefas.filter((s) => s.tarefaId === tarefaId).sort((a, b) => a.ordem - b.ordem);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) return;
    setSaving(true);
    try {
      await criarAgilSubtarefa({ tarefaId, titulo: titulo.trim() });
      setTitulo('');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao adicionar subtarefa.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {subtarefas.length === 0 && (
        <p className="text-[0.82rem] text-text-muted py-2">Nenhuma subtarefa ainda.</p>
      )}
      <div className="flex flex-col gap-1">
        {subtarefas.map((s) => (
          <label key={s.id} className="group flex items-center gap-2.5 px-2.5 py-2 rounded bg-bg border border-border cursor-pointer transition-colors hover:border-border-strong">
            <input
              type="checkbox"
              checked={s.concluida}
              onChange={(e) => atualizarAgilSubtarefa(s.id, { concluida: e.target.checked })}
              className="w-[13px] h-[13px] shrink-0 rounded-[3px] accent-[var(--accent)]"
            />
            <span className={`flex-1 text-[0.85rem] ${s.concluida ? 'line-through text-text-muted' : 'text-text-primary'}`}>{s.titulo}</span>
            <button
              type="button"
              onClick={() => removerAgilSubtarefa(s.id)}
              className="flex items-center justify-center w-6 h-6 rounded-[4px] text-text-muted bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-[opacity,background-color,color] hover:bg-danger hover:text-white"
              title="Remover"
            >
              <Trash2 size={13} />
            </button>
          </label>
        ))}
      </div>
      <form onSubmit={handleAdd} className="flex gap-2">
        <Input tone="modal" placeholder="Nova subtarefa..." value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={saving || !titulo.trim()}>Adicionar</Button>
      </form>
    </div>
  );
}
