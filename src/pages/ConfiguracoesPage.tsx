import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { toastError } from '../utils/toast';
import { confirmDialog } from '../utils/confirmDialog';
import { Badge, Button, Card, Field, Input, Select, Textarea } from '../ui';
import { CATEGORIA_TIPO_LABEL, SEGMENTO_LABEL, type Cadencias, type CategoriaTipo, type Modelo, type Segmento } from '../types';

const TIPOS: CategoriaTipo[] = ['servico', 'tipo_evento', 'status_cliente', 'status_evento', 'monitor', 'tipo_lembrete', 'sala'];

const CADENCIA_CAMPOS: { chave: keyof Cadencias; label: string; ajuda: string; min?: number; max?: number }[] = [
  { chave: 'monitoria_dias', label: 'Monitoria a cada (dias)', ajuda: 'Cadência-alvo de reunião de Monitoria. Cliente sem reunião há mais que isso fica vencido na fila de Acompanhamento.' },
  { chave: 'price_dias', label: 'Price a cada (dias)', ajuda: 'Cadência-alvo de Price. Zera com reunião OU relatório de Price. Vencido entra na fila.' },
  { chave: 'reuniao_dias', label: 'Reunião a cada (dias)', ajuda: 'Cliente engajado sem próxima reunião marcada vira recomendação após este intervalo.' },
  { chave: 'relatorio_dias', label: 'Relatório a cada (dias)', ajuda: 'Sugere envio de relatório do período após este intervalo sem contato.' },
  { chave: 'esfriando_dias', label: 'Esfriando após (dias)', ajuda: 'Cliente sem contato há mais que isso entra no segmento Esfriando.' },
  { chave: 'primeiro_contato_dias', label: 'Primeiro contato (dias)', ajuda: 'Janela alvo para buscar clientes nunca atendidos.' },
  { chave: 'recontato_dias', label: 'Aguardando retorno (dias)', ajuda: 'Depois de um contato/ligação sem resposta, o cliente fica nessa janela como "Aguardando Retorno" em vez de "Precisa contato".' },
  { chave: 'peso_contato_recente', label: 'Peso de Aguardando Retorno (%)', ajuda: 'Quanto "Aguardando Retorno" pesa na % de "Carteira no Ritmo" — 100 conta igual reunião/relatório, 0 não conta nada na %.', min: 0, max: 100 },
];

const SEGMENTOS: Segmento[] = ['engajado', 'esfriando', 'frio'];

function CadenciasCard() {
  const { cadencias, salvarCadencias } = useCarteira();
  // Ajuste de estado durante o render (padrão recomendado pelo React p/ "resetar
  // estado local quando um valor externo muda") em vez de useEffect+setState:
  // evita o "flash" de um render extra com o form desatualizado.
  const [cadenciasAnterior, setCadenciasAnterior] = useState(cadencias);
  const [form, setForm] = useState<Cadencias>(cadencias);
  if (cadencias !== cadenciasAnterior) {
    setCadenciasAnterior(cadencias);
    setForm(cadencias);
  }
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

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
    <Card flat>
      <div className="section-header">
        <h3>Cadências de acompanhamento</h3>
      </div>
      <p className="text-text-muted" style={{ fontSize: 12, marginTop: -8, marginBottom: 14 }}>
        Regras que geram as recomendações da Central de Ações.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {CADENCIA_CAMPOS.map(({ chave, label, ajuda, min = 1, max }) => (
          <Field key={chave} label={label}>
            <Input
              type="number"
              min={min}
              max={max}
              value={form[chave]}
              onChange={(e) => setForm((f) => ({ ...f, [chave]: Number(e.target.value) }))}
            />
            <span className="text-text-muted" style={{ fontSize: 11 }}>{ajuda}</span>
          </Field>
        ))}
      </div>
      <div className="flex-row" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
        <Button variant="primary" onClick={salvar} disabled={salvando || !alterado}>
          {salvo ? <><Check size={15} /> Salvo</> : 'Salvar cadências'}
        </Button>
      </div>
    </Card>
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
    if (!(await confirmDialog(`Remover o modelo "${m.titulo}"?`, { danger: true, confirmLabel: 'Remover' }))) return;
    await removerModelo(m.id);
    if (editando?.id === m.id) limpar();
  }

  return (
    <Card flat>
      <div className="section-header">
        <h3>Modelos de material</h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>{modelos.length}</span>
      </div>
      <p className="text-text-muted" style={{ fontSize: 12, marginTop: -8, marginBottom: 14 }}>
        Textos por segmento usados no botão “Material”. Use <code>{'{empresa}'}</code> para inserir o nome do cliente.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {modelos.length === 0 && <div className="empty-state">Nenhum modelo cadastrado.</div>}
        {modelos.map((m) => (
          <div key={m.id} className="flex-between" style={{ padding: '0.5rem 0.65rem', borderRadius: 6, background: 'var(--card-hover)', border: '1px solid var(--border)' }}>
            <div style={{ minWidth: 0 }}>
              <div className="flex-row" style={{ gap: 8 }}>
                <strong style={{ fontSize: 13 }}>{m.titulo}</strong>
                <Badge variant="plain">{SEGMENTO_LABEL[m.segmento]}</Badge>
              </div>
              <div className="text-text-muted" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }}>{m.conteudo}</div>
            </div>
            <div className="flex-row">
              <Button variant="secondary" size="icon" onClick={() => editar(m)}><Pencil size={13} /></Button>
              <Button variant="danger" size="icon" onClick={() => excluir(m)}><Trash2 size={13} /></Button>
            </div>
          </div>
        ))}
      </div>

      <Field as="div" className="mb-2" label={<span style={{ fontSize: 13, fontWeight: 600 }}>{editando ? 'Editando modelo' : 'Novo modelo'}</span>}>
        <div className="flex-row" style={{ gap: 8, marginBottom: 8 }}>
          <Select value={novoSeg} onChange={(e) => setNovoSeg(e.target.value as Segmento)} style={{ maxWidth: 160 }}>
            {SEGMENTOS.map((s) => <option key={s} value={s}>{SEGMENTO_LABEL[s]}</option>)}
          </Select>
          <Input placeholder="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </div>
        <Textarea rows={4} placeholder="Conteúdo do material..." value={conteudo} onChange={(e) => setConteudo(e.target.value)} />
      </Field>
      <div className="flex-row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        {editando && <Button variant="secondary" onClick={limpar}>Cancelar</Button>}
        <Button variant="primary" onClick={salvar} disabled={!titulo.trim() || !conteudo.trim()}>
          <Plus size={15} /> {editando ? 'Salvar' : 'Adicionar'}
        </Button>
      </div>
    </Card>
  );
}

function CategoriaCard({ tipo }: { tipo: CategoriaTipo }) {
  const { categorias, clientes, agenda, lembretes, criarCategoria, atualizarCategoria, removerCategoria } = useCarteira();
  const itens = categorias
    .filter((c) => c.tipo === tipo)
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  // Quantos registros usam este valor hoje — mostrado na confirmação de exclusão
  // para dar noção real do impacto (excluir a categoria não altera esses registros).
  function contarUso(valor: string): number {
    const v = valor.toLowerCase();
    if (tipo === 'monitor') return clientes.filter((c) => (c.monitor || '').toLowerCase() === v).length;
    if (tipo === 'status_cliente') return clientes.filter((c) => (c.status || '').toLowerCase() === v).length;
    if (tipo === 'servico') return clientes.filter((c) => (c.servicos ?? []).some((s) => s.toLowerCase() === v)).length;
    if (tipo === 'tipo_evento') return agenda.filter((a) => (a.type || '').toLowerCase() === v).length;
    if (tipo === 'status_evento') return agenda.filter((a) => (a.status || '').toLowerCase() === v).length;
    if (tipo === 'tipo_lembrete') return lembretes.filter((r) => (r.type || '').toLowerCase() === v).length;
    if (tipo === 'sala') return agenda.filter((a) => (a.sala || '').toLowerCase() === v).length;
    return 0;
  }

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
      toastError(e instanceof Error ? e.message : 'Falha ao adicionar.');
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
    const uso = contarUso(valor);
    const impacto = uso > 0
      ? `${uso} registro(s) usam "${valor}" hoje e não serão alterados — só some da lista de opções.`
      : `Nenhum registro usa "${valor}" hoje.`;
    if (!(await confirmDialog(`Remover "${valor}"? ${impacto}`, { danger: true, confirmLabel: 'Remover' }))) return;
    await removerCategoria(id);
  }

  return (
    <Card flat>
      <div className="section-header">
        <h3>{CATEGORIA_TIPO_LABEL[tipo]}</h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>{itens.length}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {itens.length === 0 && <div className="empty-state">Nenhum item.</div>}
        {itens.map((cat) => (
          <div key={cat.id} className="flex-between" style={{ padding: '0.5rem 0.65rem', borderRadius: 6, background: 'var(--card-hover)', border: '1px solid var(--border)' }}>
            {editandoId === cat.id ? (
              <>
                <Input
                  value={editValor}
                  autoFocus
                  onChange={(e) => setEditValor(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && salvarEdicao(cat.id)}
                  style={{ marginRight: 8 }}
                />
                <div className="flex-row">
                  <Button variant="secondary" size="icon" onClick={() => salvarEdicao(cat.id)}><Check size={14} /></Button>
                  <Button variant="secondary" size="icon" onClick={() => setEditandoId(null)}><X size={14} /></Button>
                </div>
              </>
            ) : (
              <>
                <span>{cat.valor}</span>
                <div className="flex-row">
                  <Button variant="secondary" size="icon" onClick={() => { setEditandoId(cat.id); setEditValor(cat.valor); }}>
                    <Pencil size={13} />
                  </Button>
                  <Button variant="danger" size="icon" onClick={() => excluir(cat.id, cat.valor)}>
                    <Trash2 size={13} />
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex-row">
        <Input
          placeholder="Adicionar..."
          value={novoValor}
          onChange={(e) => setNovoValor(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && adicionar()}
        />
        <Button variant="primary" size="icon" onClick={adicionar} disabled={salvando || !novoValor.trim()}>
          <Plus size={16} />
        </Button>
      </div>
    </Card>
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
