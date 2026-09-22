import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useCarteira } from '../../context/CarteiraContext';
import { toastError } from '../../utils/toast';
import { confirmDialog } from '../../utils/confirmDialog';
import { ModalShell } from '../ModalShell';
import { Button, Input } from '../../ui';
import type { AgilFrente } from '../../types';

const CORES_SUGERIDAS = ['#dabb6c', '#e0645c', '#4cae7a', '#d69a3c', '#304373', '#68818d', '#e0c81e', '#a6a6ad'];

interface FrentesManagerModalProps {
  onClose: () => void;
}

/**
 * Gerenciador de Frentes — GLOBAL (não por board): marcos do dia a dia da 2D
 * (Monitoria, Análise, Alvos...), com cor, iguais em qualquer quadro do Ágil.
 */
export function FrentesManagerModal({ onClose }: FrentesManagerModalProps) {
  const { agilFrentes, agilTarefas, criarAgilFrente, atualizarAgilFrente, removerAgilFrente } = useCarteira();
  const frentes = [...agilFrentes].sort((a, b) => a.ordem - b.ordem);

  const [novoNome, setNovoNome] = useState('');
  const [novaCor, setNovaCor] = useState(CORES_SUGERIDAS[0]);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editCor, setEditCor] = useState('');

  async function adicionar() {
    const nome = novoNome.trim();
    if (!nome) return;
    setSalvando(true);
    try {
      await criarAgilFrente({ nome, cor: novaCor });
      setNovoNome('');
      setNovaCor(CORES_SUGERIDAS[(frentes.length + 1) % CORES_SUGERIDAS.length]);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao criar a Frente.');
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(f: AgilFrente) {
    setEditandoId(f.id);
    setEditNome(f.nome);
    setEditCor(f.cor);
  }

  async function salvarEdicao(id: string) {
    const nome = editNome.trim();
    if (!nome) return;
    await atualizarAgilFrente(id, { nome, cor: editCor });
    setEditandoId(null);
  }

  async function excluir(f: AgilFrente) {
    const uso = agilTarefas.filter((t) => t.frenteId === f.id).length;
    const impacto = uso > 0
      ? `${uso} tarefa(s) usam "${f.nome}" hoje — elas não são apagadas, só ficam sem Frente.`
      : `Nenhuma tarefa usa "${f.nome}" hoje.`;
    if (!(await confirmDialog(`Remover a Frente "${f.nome}"? ${impacto}`, { danger: true, confirmLabel: 'Remover' }))) return;
    await removerAgilFrente(f.id);
  }

  return (
    <ModalShell title="Frentes do Ágil" onClose={onClose} onSubmit={(e) => e.preventDefault()} footer={<Button variant="secondary" onClick={onClose}>Fechar</Button>}>
      <p className="text-[0.8rem] text-text-muted mb-3">
        Marcos do dia a dia da 2D (ex.: Monitoria, Análise, Alvos) — globais, iguais em qualquer quadro. A cor pinta o card da tarefa.
      </p>

      <div className="flex flex-col gap-2 mb-4">
        {frentes.length === 0 && <div className="empty-state">Nenhuma Frente ainda.</div>}
        {frentes.map((f) => (
          <div key={f.id} className="flex items-center gap-2 px-2.5 py-2 rounded bg-bg border border-border">
            {editandoId === f.id ? (
              <>
                <input
                  type="color"
                  value={editCor}
                  onChange={(e) => setEditCor(e.target.value)}
                  className="w-8 h-8 shrink-0 rounded-[6px] border border-border-strong cursor-pointer bg-transparent p-0"
                  title="Cor da Frente"
                  aria-label="Cor da Frente"
                />
                <Input
                  tone="modal"
                  autoFocus
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') salvarEdicao(f.id); if (e.key === 'Escape') setEditandoId(null); }}
                  style={{ flex: 1 }}
                />
                <Button variant="secondary" size="icon" onClick={() => salvarEdicao(f.id)} title="Salvar" aria-label="Salvar Frente"><Check size={14} /></Button>
                <Button variant="secondary" size="icon" onClick={() => setEditandoId(null)} title="Cancelar" aria-label="Cancelar edição"><X size={14} /></Button>
              </>
            ) : (
              <>
                <span className="w-4 h-4 shrink-0 rounded-full border border-border-strong" style={{ backgroundColor: f.cor }} />
                <span className="flex-1 text-[0.85rem] text-text-primary truncate">{f.nome}</span>
                <Button variant="secondary" size="icon" onClick={() => iniciarEdicao(f)} title="Editar" aria-label={`Editar Frente ${f.nome}`}><Pencil size={13} /></Button>
                <Button variant="danger" size="icon" onClick={() => excluir(f)} title="Remover" aria-label={`Remover Frente ${f.nome}`}><Trash2 size={13} /></Button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-border">
        <input
          type="color"
          value={novaCor}
          onChange={(e) => setNovaCor(e.target.value)}
          className="w-8 h-8 shrink-0 rounded-[6px] border border-border-strong cursor-pointer bg-transparent p-0"
          title="Cor da nova Frente"
          aria-label="Cor da nova Frente"
        />
        <Input
          tone="modal"
          placeholder="Nova Frente (ex.: Monitoria)…"
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }}
          style={{ flex: 1 }}
        />
        <Button variant="primary" onClick={adicionar} disabled={salvando || !novoNome.trim()}>
          <Plus size={14} /> Adicionar
        </Button>
      </div>
    </ModalShell>
  );
}
