import { useState } from 'react';
import { ArrowRight, Ban, Link2, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { useCarteira } from '../../context/CarteiraContext';
import { toastError } from '../../utils/toast';
import { Button } from '../../ui';
import { SelectField } from '../SelectField';
import type { AgilTipoConexao } from '../../types';

const TIPO_LABEL: Record<AgilTipoConexao, string> = {
  bloqueia: 'Bloqueia',
  relacionada: 'Relacionada a',
};

interface ConexoesTabProps {
  tarefaId: string;
}

/** Relação livre entre esta tarefa e qualquer outra (inclusive de outro
 *  board) — não confundir com `iniciativaId` (hierarquia fixa, só board de
 *  Iniciativas). Direção importa em "Bloqueia": A bloqueia B ≠ B bloqueia A. */
export function ConexoesTab({ tarefaId }: ConexoesTabProps) {
  const { agilTarefas, agilConexoes, criarAgilConexao, removerAgilConexao } = useCarteira();
  const [tarefaDestinoId, setTarefaDestinoId] = useState('');
  const [tipo, setTipo] = useState<AgilTipoConexao>('relacionada');
  const [saving, setSaving] = useState(false);

  const conexoes = agilConexoes.filter((c) => c.tarefaOrigemId === tarefaId || c.tarefaDestinoId === tarefaId);
  const outrasTarefas = agilTarefas.filter((t) => t.id !== tarefaId);

  async function handleAdd() {
    if (!tarefaDestinoId) return;
    setSaving(true);
    try {
      await criarAgilConexao({ tarefaOrigemId: tarefaId, tarefaDestinoId, tipo });
      setTarefaDestinoId('');
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao criar conexão.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-2">
        <SelectField
          label="Conectar com"
          placeholder="Escolha uma tarefa"
          value={tarefaDestinoId}
          onChange={setTarefaDestinoId}
          className="flex-1"
          options={outrasTarefas.map((t) => ({ value: t.id, label: t.numero ? `#${t.numero} ${t.titulo}` : t.titulo }))}
        />
        <SelectField
          label="Tipo"
          value={tipo}
          onChange={(v) => setTipo(v as AgilTipoConexao)}
          options={Object.entries(TIPO_LABEL).map(([value, label]) => ({ value, label }))}
        />
        <Button variant="secondary" onClick={handleAdd} disabled={saving || !tarefaDestinoId}>
          <Link2 size={14} /> Ligar
        </Button>
      </div>

      {conexoes.length === 0 ? (
        <p className="text-[0.82rem] text-text-muted">Nenhuma conexão ainda.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {conexoes.map((c) => {
            const origem = c.tarefaOrigemId === tarefaId;
            const outraId = origem ? c.tarefaDestinoId : c.tarefaOrigemId;
            const outra = agilTarefas.find((t) => t.id === outraId);
            return (
              <div key={c.id} className="group flex items-center gap-2 p-2.5 rounded bg-bg border border-border">
                {c.tipo === 'bloqueia' ? <Ban size={13} className="shrink-0 text-danger" /> : <ArrowRight size={13} className="shrink-0 text-text-muted" />}
                <span className={clsx('text-[0.8rem] text-text-secondary', c.tipo === 'bloqueia' && 'text-danger')}>
                  {c.tipo === 'bloqueia' ? (origem ? 'Bloqueia' : 'Bloqueada por') : 'Relacionada a'}
                </span>
                <span className="flex-1 min-w-0 truncate text-[0.8rem] font-medium text-text-primary" title={outra?.titulo}>
                  {outra ? (outra.numero ? `#${outra.numero} ${outra.titulo}` : outra.titulo) : 'Tarefa removida'}
                </span>
                <button
                  type="button"
                  onClick={() => removerAgilConexao(c.id)}
                  className="shrink-0 flex items-center justify-center w-5 h-5 rounded-[4px] text-text-muted bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-[opacity,background-color,color] hover:bg-danger hover:text-white"
                  title="Remover conexão"
                  aria-label="Remover conexão"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
