import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { CATEGORIA_TIPO_LABEL, type CategoriaTipo } from '../types';

const TIPOS: CategoriaTipo[] = ['servico', 'tipo_evento', 'status_cliente', 'status_evento', 'monitor', 'tipo_lembrete'];

function CategoriaCard({ tipo }: { tipo: CategoriaTipo }) {
  const { categorias, criarCategoria, atualizarCategoria, removerCategoria } = useCarteira();
  const itens = categorias
    .filter((c) => c.tipo === tipo)
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  const [novoValor, setNovoValor] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editValor, setEditValor] = useState('');

  async function adicionar() {
    const valor = novoValor.trim();
    if (!valor) return;
    setSalvando(true);
    try {
      await criarCategoria(tipo, valor);
      setNovoValor('');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Falha ao adicionar.');
    } finally {
      setSalvando(false);
    }
  }

  async function salvarEdicao(id: string) {
    const valor = editValor.trim();
    if (!valor) return;
    await atualizarCategoria(id, valor);
    setEditandoId(null);
  }

  async function excluir(id: string, valor: string) {
    if (!confirm(`Remover "${valor}"? Registros que já usam esse valor não são alterados.`)) return;
    await removerCategoria(id);
  }

  return (
    <div className="glass-card glass-card-flat">
      <div className="section-header">
        <h3>{CATEGORIA_TIPO_LABEL[tipo]}</h3>
        <span className="text-muted" style={{ fontSize: 12 }}>{itens.length}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {itens.length === 0 && <div className="empty-state">Nenhum item.</div>}
        {itens.map((cat) => (
          <div key={cat.id} className="flex-between" style={{ padding: '0.4rem 0.5rem', borderRadius: 3, background: 'var(--paper-2)' }}>
            {editandoId === cat.id ? (
              <>
                <input
                  className="field-input"
                  value={editValor}
                  autoFocus
                  onChange={(e) => setEditValor(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && salvarEdicao(cat.id)}
                  style={{ marginRight: 8 }}
                />
                <div className="flex-row">
                  <button className="btn btn-secondary btn-icon" onClick={() => salvarEdicao(cat.id)}><Check size={14} /></button>
                  <button className="btn btn-secondary btn-icon" onClick={() => setEditandoId(null)}><X size={14} /></button>
                </div>
              </>
            ) : (
              <>
                <span>{cat.valor}</span>
                <div className="flex-row">
                  <button className="btn btn-secondary btn-icon" onClick={() => { setEditandoId(cat.id); setEditValor(cat.valor); }}>
                    <Pencil size={13} />
                  </button>
                  <button className="btn btn-danger btn-icon" onClick={() => excluir(cat.id, cat.valor)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex-row">
        <input
          className="field-input"
          placeholder="Adicionar..."
          value={novoValor}
          onChange={(e) => setNovoValor(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && adicionar()}
        />
        <button className="btn btn-primary btn-icon" onClick={adicionar} disabled={salvando || !novoValor.trim()}>
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

export default function ConfiguracoesPage() {
  return (
    <div className="page-container">
      <h1 className="page-title">Configurações</h1>
      <p className="page-subtitle">Categorias editáveis — serviços, tipos de evento, status e monitores.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
        {TIPOS.map((tipo) => (
          <CategoriaCard key={tipo} tipo={tipo} />
        ))}
      </div>
    </div>
  );
}
