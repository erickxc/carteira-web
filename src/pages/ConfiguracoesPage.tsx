import { useEffect, useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { CATEGORIA_TIPO_LABEL, SEGMENTO_LABEL, type Cadencias, type CategoriaTipo, type Modelo, type Segmento } from '../types';

const TIPOS: CategoriaTipo[] = ['servico', 'tipo_evento', 'status_cliente', 'status_evento', 'monitor', 'tipo_lembrete'];

const CADENCIA_CAMPOS: { chave: keyof Cadencias; label: string; ajuda: string }[] = [
  { chave: 'reuniao_dias', label: 'Reunião a cada (dias)', ajuda: 'Cliente engajado sem próxima reunião marcada vira recomendação após este intervalo.' },
  { chave: 'relatorio_dias', label: 'Relatório a cada (dias)', ajuda: 'Sugere envio de relatório do período após este intervalo sem contato.' },
  { chave: 'esfriando_dias', label: 'Esfriando após (dias)', ajuda: 'Cliente sem contato há mais que isso entra no segmento Esfriando.' },
  { chave: 'primeiro_contato_dias', label: 'Primeiro contato (dias)', ajuda: 'Janela alvo para buscar clientes nunca atendidos.' },
];

const SEGMENTOS: Segmento[] = ['engajado', 'esfriando', 'frio'];

function CadenciasCard() {
  const { cadencias, salvarCadencias } = useCarteira();
  const [form, setForm] = useState<Cadencias>(cadencias);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => setForm(cadencias), [cadencias]);

  async function salvar() {
    setSalvando(true);
    try {
      await salvarCadencias(form);
      setSalvo(true);
      setTimeout(() => setSalvo(false), 1500);
    } finally {
      setSalvando(false);
    }
  }

  const alterado = JSON.stringify(form) !== JSON.stringify(cadencias);

  return (
    <div className="glass-card glass-card-flat">
      <div className="section-header">
        <h3>Cadências de acompanhamento</h3>
      </div>
      <p className="text-muted" style={{ fontSize: 12, marginTop: -8, marginBottom: 14 }}>
        Regras que geram as recomendações da Central de Ações.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {CADENCIA_CAMPOS.map(({ chave, label, ajuda }) => (
          <label key={chave} className="field">
            {label}
            <input
              type="number"
              min={1}
              className="field-input"
              value={form[chave]}
              onChange={(e) => setForm((f) => ({ ...f, [chave]: Number(e.target.value) }))}
            />
            <span className="text-muted" style={{ fontSize: 11 }}>{ajuda}</span>
          </label>
        ))}
      </div>
      <div className="flex-row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={salvar} disabled={salvando || !alterado}>
          {salvo ? <><Check size={15} /> Salvo</> : 'Salvar cadências'}
        </button>
      </div>
    </div>
  );
}

function ModelosCard() {
  const { modelos, criarModelo, atualizarModelo, removerModelo } = useCarteira();
  const [editando, setEditando] = useState<Modelo | null>(null);
  const [novoSeg, setNovoSeg] = useState<Segmento>('frio');
  const [titulo, setTitulo] = useState('');
  const [conteudo, setConteudo] = useState('');

  function editar(m: Modelo) {
    setEditando(m);
    setNovoSeg(m.segmento);
    setTitulo(m.titulo);
    setConteudo(m.conteudo);
  }

  function limpar() {
    setEditando(null);
    setTitulo('');
    setConteudo('');
    setNovoSeg('frio');
  }

  async function salvar() {
    if (!titulo.trim() || !conteudo.trim()) return;
    if (editando) {
      await atualizarModelo(editando.id, { segmento: novoSeg, titulo: titulo.trim(), conteudo });
    } else {
      await criarModelo({ segmento: novoSeg, titulo: titulo.trim(), conteudo });
    }
    limpar();
  }

  async function excluir(m: Modelo) {
    if (!confirm(`Remover o modelo "${m.titulo}"?`)) return;
    await removerModelo(m.id);
    if (editando?.id === m.id) limpar();
  }

  return (
    <div className="glass-card glass-card-flat">
      <div className="section-header">
        <h3>Modelos de material</h3>
        <span className="text-muted" style={{ fontSize: 12 }}>{modelos.length}</span>
      </div>
      <p className="text-muted" style={{ fontSize: 12, marginTop: -8, marginBottom: 14 }}>
        Textos por segmento usados no botão “Material”. Use <code>{'{empresa}'}</code> para inserir o nome do cliente.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {modelos.length === 0 && <div className="empty-state">Nenhum modelo cadastrado.</div>}
        {modelos.map((m) => (
          <div key={m.id} className="flex-between" style={{ padding: '0.5rem 0.65rem', borderRadius: 6, background: 'var(--card-hover)', border: '1px solid var(--border)' }}>
            <div style={{ minWidth: 0 }}>
              <div className="flex-row" style={{ gap: 8 }}>
                <strong style={{ fontSize: 13 }}>{m.titulo}</strong>
                <span className="badge">{SEGMENTO_LABEL[m.segmento]}</span>
              </div>
              <div className="text-muted" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{m.conteudo}</div>
            </div>
            <div className="flex-row">
              <button className="btn btn-secondary btn-icon" onClick={() => editar(m)}><Pencil size={13} /></button>
              <button className="btn btn-danger btn-icon" onClick={() => excluir(m)}><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>

      <div className="field" style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{editando ? 'Editando modelo' : 'Novo modelo'}</span>
        <div className="flex-row" style={{ gap: 8, marginBottom: 8 }}>
          <select className="field-input" value={novoSeg} onChange={(e) => setNovoSeg(e.target.value as Segmento)} style={{ maxWidth: 160 }}>
            {SEGMENTOS.map((s) => <option key={s} value={s}>{SEGMENTO_LABEL[s]}</option>)}
          </select>
          <input className="field-input" placeholder="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </div>
        <textarea className="field-input" rows={4} placeholder="Conteúdo do material..." value={conteudo} onChange={(e) => setConteudo(e.target.value)} />
      </div>
      <div className="flex-row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        {editando && <button className="btn btn-secondary" onClick={limpar}>Cancelar</button>}
        <button className="btn btn-primary" onClick={salvar} disabled={!titulo.trim() || !conteudo.trim()}>
          <Plus size={15} /> {editando ? 'Salvar' : 'Adicionar'}
        </button>
      </div>
    </div>
  );
}

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
          <div key={cat.id} className="flex-between" style={{ padding: '0.5rem 0.65rem', borderRadius: 6, background: 'var(--card-hover)', border: '1px solid var(--border)' }}>
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
      <p className="page-subtitle">Cadências de acompanhamento, modelos de material e categorias editáveis.</p>

      <div className="section">
        <CadenciasCard />
      </div>

      <div className="section">
        <ModelosCard />
      </div>

      <div className="section">
        <div className="section-header"><h3>Categorias</h3></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {TIPOS.map((tipo) => (
            <CategoriaCard key={tipo} tipo={tipo} />
          ))}
        </div>
      </div>
    </div>
  );
}
