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
  boardId: string;
  onClose: () => void;
}

/**
 * Gerenciador de Frentes do board — lista de categorias coloridas que o
 * próprio usuário cria/edita/reordena (ex.: Bug, Correção, Implementação),
 * mesmo espírito do gerenciador de Categorias em Configurações, com cor.
 */
export function FrentesManagerModal({ boardId, onClose }: FrentesManagerModalProps) {
  const { agilFrentes, agilTarefas, criarAgilFrente, atualizarAgilFrente, removerAgilFrente } = useCarteira();
  const frentes = agilFrentes.filter((f) => f.boardId === boardId).sort((a, b) => a.ordem - b.ordem);

  const [novoTitulo, setNovoTitulo] = useState('');
  const [novaCor, setNovaCor] = useState(CORES_SUGERIDAS[0]);
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editTitulo, setEditTitulo] = useState('');
  const [editCor, setEditCor] = useState('');

  async function adicionar() {
    const titulo = novoTitulo.trim();
    if (!titulo) return;
    setSalvando(true);
    try {
      await criarAgilFrente({ boardId, titulo, cor: novaCor });
      setNovoTitulo('');
      setNovaCor(CORES_SUGERIDAS[(frentes.length + 1) % CORES_SUGERIDAS.length]);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao criar a frente.');
    } finally {
      setSalvando(false);
    }
  }

  function iniciarEdicao(f: AgilFrente) {
    setEditandoId(f.id);
    setEditTitulo(f.titulo);
    setEditCor(f.cor);
  }

  async function salvarEdicao(id: string) {
    const titulo = editTitulo.trim();
    if (!titulo) return;
    await atualizarAgilFrente(id, { titulo, cor: editCor });
    setEditandoId(null);
  }

  async function excluir(f: AgilFrente) {
    const uso = agilTarefas.filter((t) => t.frenteId === f.id).length;
    const impacto = uso > 0
      ? `${uso} tarefa(s) usam "${f.titulo}" hoje — elas não são apagadas, só ficam sem frente.`
      : `Nenhuma tarefa usa "${f.titulo}" hoje.`;
    if (!(await confirmDialog(`Remover a frente "${f.titulo}"? ${impacto}`, { danger: true, confirmLabel: 'Remover' }))) return;
    await removerAgilFrente(f.id);
  }

  return (
    <ModalShell title="Frentes do board" onClose={onClose} onSubmit={(e) => e.preventDefault()} footer={<Button variant="secondary" onClick={onClose}>Fechar</Button>}>
      <p className="text-[0.8rem] text-text-muted mb-3">
        Frente é uma categoria colorida da tarefa (ex.: Bug, Correção, Implementação) — crie quantas quiser, com a cor que preferir.
      </p>

      <div className="flex flex-col gap-2 mb-4">
        {frentes.length === 0 && <div className="empty-state">Nenhuma frente ainda.</div>}
        {frentes.map((f) => (
          <div key={f.id} className="flex items-center gap-2 px-2.5 py-2 rounded bg-bg border border-border">
            {editandoId === f.id ? (
              <>
                <input
                  type="color"
                  value={editCor}
                  onChange={(e) => setEditCor(e.target.value)}
                  className="w-8 h-8 shrink-0 rounded-[6px] border border-border-strong cursor-pointer bg-transparent p-0"
                  title="Cor da frente"
                />
                <Input
                  tone="modal"
                  autoFocus
                  value={editTitulo}
                  onChange={(e) => setEditTitulo(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') salvarEdicao(f.id); if (e.key === 'Escape') setEditandoId(null); }}
                  style={{ flex: 1 }}
                />
                <Button variant="secondary" size="icon" onClick={() => salvarEdicao(f.id)} title="Salvar"><Check size={14} /></Button>
                <Button variant="secondary" size="icon" onClick={() => setEditandoId(null)} title="Cancelar"><X size={14} /></Button>
              </>
            ) : (
              <>
                <span className="w-4 h-4 shrink-0 rounded-full border border-border-strong" style={{ backgroundColor: f.cor }} />
                <span className="flex-1 text-[0.85rem] text-text-primary truncate">{f.titulo}</span>
                <Button variant="secondary" size="icon" onClick={() => iniciarEdicao(f)} title="Editar"><Pencil size={13} /></Button>
                <Button variant="danger" size="icon" onClick={() => excluir(f)} title="Remover"><Trash2 size={13} /></Button>
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
          title="Cor da nova frente"
        />
        <Input
          tone="modal"
          placeholder="Nova frente (ex.: Bug)..."
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
