import { useEffect, useRef, useState } from 'react';
import { Check, Download, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { toastError, toastInfo } from '../utils/toast';
import { confirmDialog } from '../utils/confirmDialog';
import {
  verificarStatusAtualizacao, aplicarAtualizacao, verificarStatusBase, type StatusAtualizacao,
  verificarIniciarComWindows, definirIniciarComWindows, type StatusIniciarComWindows,
} from '../api/client';
import { Badge, Button, Card, Field, Input, Select, Textarea } from '../ui';
import ProvedorIACard from '../components/config/ProvedorIACard';
import LimiteContaCard from '../components/config/LimiteContaCard';
import McpClaudeCard from '../components/config/McpClaudeCard';
import UsoIACard from '../components/config/UsoIACard';
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

/**
 * Checagem automática JÁ existe (o launcher se atualiza sozinho a cada
 * abertura, lendo `releases/latest.json` — ver `launcher/atualizar.cjs`).
 * Este card torna isso visível e dá o "atualizar agora" sem esperar a próxima
 * abertura: o servidor fecha e o `.exe` reabre sozinho (quem troca os
 * arquivos continua sendo o launcher — ver `server/routes/atualizacao.cjs`).
 * Enquanto isso a API fica fora do ar, então a tela espera o app voltar e
 * recarrega — o front carregado na memória ainda é o da versão antiga.
 */
function AtualizacaoCard() {
  const [status, setStatus] = useState<StatusAtualizacao | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [reiniciando, setReiniciando] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  function buscar() {
    return verificarStatusAtualizacao()
      .then(setStatus)
      .catch(() => toastError('Não foi possível verificar atualizações agora.'));
  }

  useEffect(() => { buscar(); }, []);

  function verificar() {
    setVerificando(true);
    buscar().finally(() => setVerificando(false));
  }

  /** Espera a API voltar depois do reinício e recarrega. Só começa depois de
   * alguns segundos: o servidor antigo ainda responde por um instante após a
   * resposta do /aplicar, e recarregar nele traria a versão velha de volta. */
  function esperarVoltar(inicio = Date.now()) {
    timerRef.current = window.setTimeout(() => {
      if (Date.now() - inicio > 3 * 60_000) {
        setReiniciando(false);
        toastError('O sistema demorou pra voltar. Abra de novo pelo atalho do Carteira.');
        return;
      }
      verificarStatusBase()
        .then(() => window.location.reload())
        .catch(() => esperarVoltar(inicio));
    }, 6000);
  }

  async function aplicar() {
    const ok = await confirmDialog(
      `Atualizar para a versão ${status?.disponivel}? O sistema fecha e abre de novo — quem estiver usando pela rede fica alguns segundos sem acesso.`,
      { confirmLabel: 'Atualizar agora' },
    );
    if (!ok) return;
    setReiniciando(true);
    try {
      await aplicarAtualizacao();
      toastInfo('Baixando a atualização... o sistema reinicia sozinho.');
      esperarVoltar();
    } catch (err) {
      setReiniciando(false);
      toastError(err instanceof Error ? err.message : 'Não foi possível atualizar agora.');
    }
  }

  const temNova = Boolean(status && !status.atualizada && status.disponivel);
  const publicadoEm = status?.publicadoEm ? new Date(status.publicadoEm).toLocaleString('pt-BR') : null;

  return (
    <Card flat>
      <div className="section-header">
        <h3>Versão e atualizações</h3>
        {status && (
          <Badge variant={temNova ? 'warning' : 'success'}>
            {temNova ? 'Atualização disponível' : 'Em dia'}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4 mb-4">
        <div>
          <span className="block text-[0.72rem] uppercase tracking-wide text-text-muted">Versão em uso</span>
          <strong className="block text-[1.35rem] font-semibold leading-tight">{status ? status.instalada : '—'}</strong>
        </div>
        <div>
          <span className="block text-[0.72rem] uppercase tracking-wide text-text-muted">Última publicada</span>
          <strong className="block text-[1.35rem] font-semibold leading-tight">{status?.disponivel ?? '—'}</strong>
          {publicadoEm && <span className="block text-[0.72rem] text-text-muted">em {publicadoEm}</span>}
        </div>
      </div>

      <p className="text-text-secondary" style={{ fontSize: '0.85rem', margin: '0 0 12px' }}>
        {!status && 'Consultando...'}
        {status && !temNova && 'O sistema já está na versão mais recente.'}
        {temNova && status?.podeAplicar && 'Ao atualizar, o sistema fecha e abre sozinho — leva poucos segundos.'}
        {temNova && !status?.podeAplicar && (
          <>
            Esta tela foi aberta pela rede (ou em desenvolvimento), então a atualização não pode ser aplicada daqui.
            Atualize na máquina onde o sistema está instalado — basta fechar e abrir o <code>2D_Carteira.exe</code>.
          </>
        )}
      </p>

      {reiniciando && (
        <p className="text-text-secondary" style={{ fontSize: '0.85rem', marginBottom: 12 }}>
          Atualizando e reiniciando — a página recarrega sozinha quando o sistema voltar.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button variant="secondary" onClick={verificar} disabled={verificando || reiniciando}>
          <RefreshCw size={15} /> {verificando ? 'Verificando...' : 'Verificar agora'}
        </Button>
        {temNova && status?.podeAplicar && (
          <Button variant="primary" onClick={aplicar} disabled={reiniciando}>
            <Download size={15} /> {reiniciando ? 'Atualizando...' : `Atualizar para ${status.disponivel}`}
          </Button>
        )}
      </div>
    </Card>
  );
}

/**
 * Configuração LOCAL desta máquina (não é dado da carteira — nunca vai pro
 * SQLite/fila). Só aparece de fato quando o app foi aberto pelo `.exe` local
 * (`suportado`): via navegador na LAN (Apache), a máquina que abriu o
 * navegador pode não ser a que deveria iniciar o app sozinha — nesse caso o
 * card mostra a explicação em vez do toggle.
 */
function IniciarComWindowsCard() {
  const [status, setStatus] = useState<StatusIniciarComWindows | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    verificarIniciarComWindows().then(setStatus).catch(() => setStatus({ suportado: false, ativo: false }));
  }, []);

  function alternar() {
    if (!status) return;
    setSalvando(true);
    definirIniciarComWindows(!status.ativo)
      .then(setStatus)
      .catch(() => toastError('Não foi possível salvar essa configuração.'))
      .finally(() => setSalvando(false));
  }

  if (!status) return null;

  return (
    <Card flat>
      <div className="section-header">
        <h3>Iniciar com o Windows</h3>
      </div>
      {status.suportado ? (
        <label className="check-row" style={{ fontSize: '0.85rem' }}>
          <input type="checkbox" checked={status.ativo} disabled={salvando} onChange={alternar} />
          Abrir a CARTEIRA 2D automaticamente quando o Windows iniciar (nesta máquina)
        </label>
      ) : (
        <p className="text-text-secondary" style={{ fontSize: '0.85rem' }}>
          Disponível só abrindo o sistema pelo <code>2D_Carteira.exe</code> local — acessando pelo navegador/rede
          não é possível saber qual máquina deveria iniciar o app sozinha.
        </p>
      )}
    </Card>
  );
}

type AbaConfig = 'sistema' | 'cadencias' | 'modelos' | 'categorias';

const ABAS: { chave: AbaConfig; label: string }[] = [
  { chave: 'sistema', label: 'Sistema' },
  { chave: 'cadencias', label: 'Cadências' },
  { chave: 'modelos', label: 'Modelos' },
  { chave: 'categorias', label: 'Categorias' },
];

const SUBTITULO: Record<AbaConfig, string> = {
  sistema: 'Versão instalada, atualizações, provedor de IA e comportamento desta máquina.',
  cadencias: 'Intervalos-alvo que definem a fila de acompanhamento.',
  modelos: 'Modelos de material por segmento.',
  categorias: 'Valores editáveis usados nos formulários (serviços, status, monitores...).',
};

/**
 * Aba "Sistema" é a parte dedicada a versão/atualização — separada das
 * configurações de negócio (cadências/modelos/categorias) de propósito: é a
 * única parte da tela que fala do software em si, e é pra onde o rodapé
 * (versão, em `Sidebar.tsx`) manda quem clica.
 */
export default function ConfiguracoesPage() {
  const [aba, setAba] = useState<AbaConfig>('sistema');

  return (
    <div className="page-container">
      <h1 className="page-title">Configurações</h1>
      <p className="page-subtitle">{SUBTITULO[aba]}</p>

      <div className="tabs" style={{ margin: '1.25rem 0 2rem' }}>
        {ABAS.map(({ chave, label }) => (
          <button key={chave} className={`tab${aba === chave ? ' is-active' : ''}`} onClick={() => setAba(chave)}>
            {label}
          </button>
        ))}
      </div>

      {aba === 'sistema' && (
        <>
          <div className="section">
            <AtualizacaoCard />
          </div>
          <div className="section">
            <IniciarComWindowsCard />
          </div>
          <div className="section">
            <ProvedorIACard />
          </div>
          <div className="section">
            <LimiteContaCard />
          </div>
          <div className="section">
            <McpClaudeCard />
          </div>
          <div className="section">
            <UsoIACard />
          </div>
        </>
      )}

      {aba === 'cadencias' && (
        <div className="section">
          <CadenciasCard />
        </div>
      )}

      {aba === 'modelos' && (
        <div className="section">
          <ModelosCard />
        </div>
      )}

      {aba === 'categorias' && (
        <div className="section">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            {TIPOS.map((tipo) => (
              <CategoriaCard key={tipo} tipo={tipo} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
