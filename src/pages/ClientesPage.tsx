import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { Bot, FileUp, LayoutDashboard, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { useSearchFilter } from '../hooks/useSearchFilter';
import { usePersistedState } from '../hooks/usePersistedState';
import { truthy } from '../utils/formatters';
import { clienteStatusBadge, isGratuidade } from '../utils/badges';
import { toastError, toastSuccess } from '../utils/toast';
import { confirmDialog } from '../utils/confirmDialog';
import { ClientFormModal } from '../components/ClientFormModal';
import PainelCadastroAlvos from '../components/alvos/PainelCadastroAlvos';
import { AnaliseIACard } from '../components/cliente/AnaliseIACard';
import { buscarAnalisesIA } from '../api/client';
import { calcularPosicaoPopover } from '../utils/popoverPosicao';
import { corDoServico, hexParaRgb } from '../utils/corServico';
import { Dropdown } from '../components/Dropdown';
import { Badge, Button, Card, Td, Th } from '../ui';
import { CLIENTE_ESTADO_OPCOES, CLIENTE_STATUS_OPCOES, TIPO_ANALISE_LABEL, type AnaliseIA, type Cliente, type EventoAgenda, type NovoCliente } from '../types';

type SortCol = 'empresa' | 'monitor' | 'servicos' | 'analise' | 'risco' | 'estado' | 'status' | 'anotacoes' | 'ultimaReuniao' | 'proximo' | 'ultimoContato' | 'diasSemContato';

const PERIODOS = [
  { valor: 'Todos', label: 'Últ. reunião: todas' },
  { valor: '7', label: 'Sem reunião +7d' },
  { valor: '15', label: 'Sem reunião +15d' },
  { valor: '30', label: 'Sem reunião +30d' },
  { valor: '60', label: 'Sem reunião +60d' },
];

/**
 * Célula "Serviços" da tabela: no máximo 2 badges visíveis + "+N" quando há
 * mais — a lista completa (Monitoria/Precificação e os "outros serviços" que
 * não entram na cadência) aparece num popover ao passar o mouse no "+N", sem
 * precisar clicar. Evita que um cliente com 5-6 serviços contratados alargue
 * a linha inteira da tabela.
 */
/** Badge de serviço com cor própria (configurável em Configurações →
 *  Categorias → Serviço; sem configuração, cai num fallback estável por
 *  nome — ver `corDoServico`). Fundo suave na cor + texto/borda na cor
 *  sólida, mesmo espírito visual dos outros `Badge`, só que por serviço em
 *  vez de semântico (sucesso/atenção/perigo). */
function BadgeServico({ servico, cor }: { servico: string; cor: string }) {
  const rgb = hexParaRgb(cor);
  return (
    <Badge variant="plain" style={{ background: `rgba(${rgb}, 0.16)`, color: cor, border: `1px solid rgba(${rgb}, 0.4)` }}>
      {servico}
    </Badge>
  );
}

function ServicosCell({ servicos, corPorServico }: { servicos: string[]; corPorServico: Map<string, string> }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  if (servicos.length === 0) return <span className="text-text-muted">—</span>;

  const cor = (s: string) => corDoServico(s, corPorServico.get(s));
  const visiveis = servicos.slice(0, 2);
  const resto = servicos.slice(2);

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {visiveis.map((s) => <BadgeServico key={s} servico={s} cor={cor(s)} />)}
      {resto.length > 0 && (
        <span
          ref={ref}
          onMouseEnter={() => { setRect(ref.current?.getBoundingClientRect() ?? null); setOpen(true); }}
          onMouseLeave={() => setOpen(false)}
          style={{ display: 'inline-block' }}
        >
          <Badge variant="muted" style={{ cursor: 'default' }}>+{resto.length}</Badge>
          {open && rect && createPortal(
            <div
              className="filter-pop"
              style={{ position: 'fixed', ...calcularPosicaoPopover(rect, { alturaEstimativa: 150 }), display: 'flex', flexDirection: 'column', gap: 5, padding: '8px 10px', overflowY: 'auto' }}
            >
              {resto.map((s) => <BadgeServico key={s} servico={s} cor={cor(s)} />)}
            </div>,
            document.body
          )}
        </span>
      )}
    </div>
  );
}

/** Cor do círculo por nível de risco — mesma paleta semântica dos badges
 *  (verde/amarelo/vermelho); sem análise ainda = contorno neutro, não cor
 *  nenhuma (evita sugerir "baixo risco" pra quem simplesmente não foi
 *  analisado ainda). */
const COR_RISCO: Record<AnaliseIA['nivelRisco'], string> = {
  baixo: 'var(--success)',
  medio: 'var(--warning)',
  alto: 'var(--danger)',
};

/**
 * Célula "IA" da tabela: o ícone já vem com um círculo colorido pelo nível
 * de risco (verde/amarelo/vermelho) da última análise automática — dá pra
 * escanear a carteira toda sem passar o mouse em cada linha. O dossiê
 * completo (resumo + fatores) continua aparecendo num popover ao hover, sem
 * precisar clicar em botão nenhum.
 *
 * Posicionamento "inteligente": abre pra CIMA quando não há espaço embaixo
 * (linha perto do fim da tabela/tela) — calculado na hora de abrir, com o
 * espaço disponível de cada lado, não sempre para baixo. `maxHeight` com
 * rolagem própria é a rede de segurança pro caso de um dossiê muito longo
 * (muitos fatores) mesmo assim não estourar a tela.
 */
function AnaliseIACell({ clienteId, risco }: { clienteId: string; risco?: AnaliseIA['nivelRisco'] }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  const cor = risco ? COR_RISCO[risco] : 'var(--border-strong)';

  return (
    <span
      ref={ref}
      onMouseEnter={() => { setRect(ref.current?.getBoundingClientRect() ?? null); setOpen(true); }}
      onMouseLeave={() => setOpen(false)}
      style={{ display: 'inline-flex' }}
      title={risco ? `Risco ${risco === 'medio' ? 'médio' : risco}` : 'Ainda não analisado'}
    >
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 24, height: 24, borderRadius: '50%', border: `1.5px solid ${cor}`,
        }}
      >
        <Bot size={13} style={{ color: cor }} />
      </span>
      {open && rect && createPortal(
        <div
          className="filter-pop"
          style={{ position: 'fixed', ...calcularPosicaoPopover(rect, { largura: 300, alinhar: 'right', alturaEstimativa: 320 }), overflowY: 'auto', padding: 8 }}
        >
          <AnaliseIACard clienteId={clienteId} variante="popover" />
        </div>,
        document.body
      )}
    </span>
  );
}

export default function ClientesPage() {
  const { clientes, agenda, cadencias, removerCliente, criarClientesEmLote, opcoesPorTipo, categoriasPorTipo } = useCarteira();
  const navigate = useNavigate();
  const hoje = new Date();

  const { value: search, debounced: debouncedSearch, setValue: setSearch } = useSearchFilter();
  const [fMonitores, setFMonitores] = usePersistedState<string[]>('filtro:clientes:monitores', []);
  const [fTipoAnalise, setFTipoAnalise] = usePersistedState<string>('filtro:clientes:analise', 'Todos');
  const [fServicos, setFServicos] = usePersistedState<string[]>('filtro:clientes:servicos', []);
  const [fEstado, setFEstado] = usePersistedState<string>('filtro:clientes:estado:v2', 'Ativo');
  const [fStatus, setFStatus] = usePersistedState<string>('filtro:clientes:status:v2', 'Todos');
  const [fPeriodo, setFPeriodo] = usePersistedState<string>('filtro:clientes:periodo', 'Todos');
  const [sortBy, setSortBy] = usePersistedState<SortCol>('filtro:clientes:sortBy', 'empresa');
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>('filtro:clientes:sortDir', 'asc');
  const [modalState, setModalState] = useState<{ editing: Cliente | null } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Uma chamada só, no mount da tela — não por linha — pra colorir o ícone
  // "IA" pelo risco e permitir ordenar a coluna. `Map` por clientId: leitura
  // O(1) por linha ao renderizar a tabela inteira.
  const [analisesPorCliente, setAnalisesPorCliente] = useState<Map<string, AnaliseIA>>(new Map());
  useEffect(() => {
    let cancelado = false;
    buscarAnalisesIA()
      .then((lista) => { if (!cancelado) setAnalisesPorCliente(new Map(lista.map((a) => [a.clientId, a]))); })
      .catch(() => { /* coluna cai pra "sem análise" em todo mundo — não é crítico pra tela funcionar */ });
    return () => { cancelado = true; };
  }, []);

  // Última reunião por cliente (reunião mais recente que JÁ ACONTECEU). SÓ
  // conta eventos do tipo Reunião — Contato/Relatório são eventos de agenda
  // mas não são reunião, então não atualizam esta coluna. Match por
  // palavra-chave (tipos são editáveis). Reunião futura com status Agendado
  // não conta (ainda não aconteceu) mesmo tendo a maior data; Cancelado/
  // Reagendado também não conta.
  const ultimaReuniao = useMemo(() => {
    const map = new Map<string, Date>();
    const concluida = (a: EventoAgenda) => /conclu|realiz/i.test(a.status || '');
    const cancelada = (a: EventoAgenda) => /cancel|reagend/i.test(a.status || '');
    agenda.forEach((a) => {
      if (!/reuni/i.test(a.type) || cancelada(a)) return;
      const d = parseISO(a.date);
      if (isNaN(d.getTime())) return;
      if (!concluida(a) && differenceInCalendarDays(d, hoje) >= 0) return;
      const atual = map.get(a.clientId);
      if (!atual || d > atual) map.set(a.clientId, d);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenda]);

  // Próximo agendamento (ainda vai acontecer) e último contato (já aconteceu)
  // por cliente — mais amplo que "Última reunião" acima, que só considera
  // eventos do tipo Reunião. A separação usa STATUS, não só a data: um evento
  // de hoje já marcado Concluído é último contato, não "próximo" (já foi
  // tratado por data ontem/hoje e ficava preso em próximo agendamento até o
  // dia virar). Cancelado/Reagendado nunca é "próximo" (evento morto), mas
  // CONTA como último contato: cancelar/reagendar sempre envolveu falar com
  // o cliente — motivo é obrigatório nos dois casos (ver `EventFormModal`).
  const { proximoAgendamento, ultimoContato } = useMemo(() => {
    const proximoMap = new Map<string, EventoAgenda>();
    const ultimoMap = new Map<string, EventoAgenda>();
    const concluido = (a: EventoAgenda) => /conclu|realiz/i.test(a.status || '');
    const cancelado = (a: EventoAgenda) => /cancel|reagend/i.test(a.status || '');
    const marcarUltimo = (a: EventoAgenda, d: Date) => {
      const atual = ultimoMap.get(a.clientId);
      if (!atual || d > parseISO(atual.date)) ultimoMap.set(a.clientId, a);
    };
    agenda.forEach((a) => {
      const d = parseISO(a.date);
      if (isNaN(d.getTime())) return;
      if (cancelado(a)) { marcarUltimo(a, d); return; }
      if (!concluido(a) && differenceInCalendarDays(d, hoje) >= 0) {
        const atual = proximoMap.get(a.clientId);
        if (!atual || d < parseISO(atual.date)) proximoMap.set(a.clientId, a);
      } else {
        marcarUltimo(a, d);
      }
    });
    return { proximoAgendamento: proximoMap, ultimoContato: ultimoMap };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenda]);

  // Opções derivadas dos dados / categorias.
  const monitorOpcoes = useMemo(
    () => [...new Set(clientes.map((c) => c.monitor).filter(Boolean))].sort(),
    [clientes]
  );
  const servicoOpcoes = useMemo(() => opcoesPorTipo('servico'), [opcoesPorTipo]);
  // Cor de referência por serviço (Configurações → Categorias → Serviço) —
  // pra colorir os badges da coluna Serviços sem cada célula precisar
  // filtrar a lista de categorias por conta própria.
  const corPorServico = useMemo(
    () => new Map(categoriasPorTipo('servico').filter((c) => c.cor).map((c) => [c.valor, c.cor as string])),
    [categoriasPorTipo]
  );
  const statusOpcoes = useMemo(() => ['Todos', ...CLIENTE_STATUS_OPCOES], []);

  const filtrosAtivos =
    !!debouncedSearch.trim() || fMonitores.length > 0 || fTipoAnalise !== 'Todos' ||
    fServicos.length > 0 || fEstado !== 'Todos' && fEstado !== 'Ativo' || fStatus !== 'Todos' || fPeriodo !== 'Todos';

  function limparFiltros() {
    setSearch(''); setFMonitores([]); setFTipoAnalise('Todos'); setFServicos([]); setFEstado('Ativo'); setFStatus('Todos'); setFPeriodo('Todos');
  }

  // Valor comparável de cada coluna, pra ordenação por clique no cabeçalho.
  function valorOrdenacao(c: Cliente, col: SortCol): string | number {
    switch (col) {
      case 'empresa': return c.empresa.toLowerCase();
      case 'monitor': return (c.monitor || '').toLowerCase();
      case 'servicos': return (c.servicos ?? []).join(', ').toLowerCase();
      case 'analise': return c.tipoAnalise === 'segmentado' || !!c.grupo ? 1 : 0;
      case 'risco': {
        const nivel = analisesPorCliente.get(c.id)?.nivelRisco;
        // Sem análise fica no início (mais baixo que "baixo") — não é risco
        // baixo de verdade, é ausência de informação, e não deve se misturar
        // com quem foi analisado e está OK.
        return nivel === 'alto' ? 3 : nivel === 'medio' ? 2 : nivel === 'baixo' ? 1 : 0;
      }
      case 'estado': return (c.estado || '').toLowerCase();
      case 'status': return (c.status || '').toLowerCase();
      case 'anotacoes': return (c.observacao || '').toLowerCase();
      case 'ultimaReuniao': return ultimaReuniao.get(c.id)?.getTime() ?? -Infinity;
      case 'proximo': {
        const p = proximoAgendamento.get(c.id);
        return p ? parseISO(p.date).getTime() : Infinity; // sem agendamento vai pro fim
      }
      case 'ultimoContato': {
        const u = ultimoContato.get(c.id);
        return u ? parseISO(u.date).getTime() : -Infinity;
      }
      case 'diasSemContato': {
        const u = ultimoContato.get(c.id);
        return u ? differenceInCalendarDays(hoje, parseISO(u.date)) : Infinity; // nunca = sempre no fim
      }
    }
  }

  function ordenarPor(col: SortCol) {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('asc'); }
  }
  const seta = (col: SortCol) => (sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  const filtrados = useMemo(() => {
    const termo = debouncedSearch.trim().toLowerCase();
    return clientes
      .filter((c) => fEstado === 'Todos' || (c.estado || (c.status === 'Suspenso' ? 'Inativo' : 'Ativo')) === fEstado)
      .filter((c) => fStatus === 'Todos' || c.status === fStatus)
      .filter((c) => !termo || c.empresa?.toLowerCase().includes(termo) || (c.monitor ?? '').toLowerCase().includes(termo))
      .filter((c) => fMonitores.length === 0 || fMonitores.includes(c.monitor))
      .filter((c) => fTipoAnalise === 'Todos' || (c.tipoAnalise ?? 'unitaria') === fTipoAnalise)
      .filter((c) => fServicos.length === 0 || fServicos.some((s) => (c.servicos ?? []).includes(s)))
      .filter((c) => {
        if (fPeriodo === 'Todos') return true;
        const n = Number(fPeriodo);
        const ult = ultimaReuniao.get(c.id);
        const dias = ult ? differenceInCalendarDays(hoje, ult) : Infinity; // nunca = sempre "vencido"
        return dias > n;
      })
      .sort((a, b) => {
        const va = valorOrdenacao(a, sortBy);
        const vb = valorOrdenacao(b, sortBy);
        let r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
        if (r === 0) r = a.empresa.localeCompare(b.empresa);
        return sortDir === 'asc' ? r : -r;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes, debouncedSearch, fMonitores, fTipoAnalise, fServicos, fEstado, fStatus, fPeriodo, ultimaReuniao, proximoAgendamento, ultimoContato, sortBy, sortDir, analisesPorCliente]);

  async function handleDelete(cliente: Cliente) {
    if (!(await confirmDialog(`Excluir o cliente "${cliente.empresa}"? Isso também remove os eventos de agenda vinculados.`, { danger: true, confirmLabel: 'Excluir' }))) return;
    await removerCliente(cliente.id);
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    const parsed: NovoCliente[] = rows
      .map((row) => {
        const servicos: string[] = [];
        if (truthy(row.Monitoria ?? row.monitoria)) servicos.push('Monitoria');
        if (truthy(row.Price ?? row.price ?? row.Precificacao ?? row.Precificação)) servicos.push('Precificação');
        return {
          empresa: String(row.Empresa ?? row.empresa ?? '').trim(),
          monitor: String(row.Monitor ?? row.monitor ?? '').trim(),
          servicos,
          observacao: String(row.Observacao ?? row.Observação ?? row.observacao ?? ''),
          status: String(row.Status ?? row.status ?? 'Regular').trim() || 'Regular',
        };
      })
      .filter((c) => c.empresa);

    if (parsed.length === 0) {
      toastError('Nenhum cliente válido encontrado na planilha (coluna "Empresa" é obrigatória).');
    } else {
      await criarClientesEmLote(parsed);
      toastSuccess(`${parsed.length} cliente(s) importado(s) com sucesso.`);
    }
    e.target.value = '';
  }

  return (
    <div className="page-container">
      <div className="flex-between" style={{ marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>Carteira</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>
            {filtrados.length} de {clientes.length} cliente(s)
          </p>
        </div>
        <div className="flex-row" style={{ gap: 10 }}>
          <Button variant="secondary" onClick={() => navigate('/clientes/dashboard')}>
            <LayoutDashboard size={16} /> Dashboard da Carteira
          </Button>
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
            <FileUp size={16} /> Importar
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={handleImportFile} />
          <Button variant="primary" onClick={() => setModalState({ editing: null })}>
            <Plus size={16} /> Novo Cliente
          </Button>
        </div>
      </div>

      <PainelCadastroAlvos />

      {/* Barra de filtros */}
      <Card flat className="mb-4">
        <div className="filter-grid">
          <label className="filter-ctl filter-search">
            <Search size={16} />
            <input
              placeholder="Buscar cliente ou monitor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <Dropdown
            label="Monitor"
            multiple
            options={monitorOpcoes.map((m) => ({ value: m, label: m }))}
            value={fMonitores}
            onChange={(v) => setFMonitores(v as string[])}
          />

          <Dropdown
            label="Análise: todas"
            defaultValue="Todos"
            options={[
              { value: 'Todos', label: 'Análise: todas' },
              { value: 'unitaria', label: TIPO_ANALISE_LABEL.unitaria },
              { value: 'segmentado', label: 'Segmentado' },
            ]}
            value={fTipoAnalise}
            onChange={(v) => setFTipoAnalise(v as string)}
          />

          <Dropdown
            label="Serviços"
            multiple
            options={servicoOpcoes.map((s) => ({ value: s, label: s }))}
            value={fServicos}
            onChange={(v) => setFServicos(v as string[])}
          />

          <Dropdown
            label="Estado: ativos"
            options={['Todos', ...CLIENTE_ESTADO_OPCOES].map((e) => ({ value: e, label: e === 'Todos' ? 'Estado: todos' : e }))}
            value={fEstado}
            onChange={(v) => setFEstado(v as string)}
          />

          <Dropdown
            label="Status: todos"
            options={statusOpcoes.map((s) => ({ value: s, label: s === 'Todos' ? 'Status: todos' : s }))}
            value={fStatus}
            onChange={(v) => setFStatus(v as string)}
          />

          <Dropdown
            label="Últ. reunião: todas"
            defaultValue="Todos"
            options={PERIODOS.map((p) => ({ value: p.valor, label: p.label }))}
            value={fPeriodo}
            onChange={(v) => setFPeriodo(v as string)}
          />
        </div>

        {filtrosAtivos && (
          <div className="flex items-center justify-end gap-3 mt-3 pt-3 border-t border-border">
            <span className="text-[0.8rem] text-text-muted">{filtrados.length} resultado(s)</span>
            <Button variant="secondary" onClick={limparFiltros}>
              <X size={15} /> Limpar filtros
            </Button>
          </div>
        )}
      </Card>

      <Card flat style={{ padding: 0, overflow: 'hidden' }}>
        {filtrados.length === 0 ? (
          <div className="empty-state">Nenhum cliente encontrado.</div>
        ) : (
          <div className="overflow-auto rounded">
            <table className="w-full border-collapse text-[0.9rem]">
              <thead>
                <tr>
                  <Th sortable onClick={() => ordenarPor('empresa')}>Empresa{seta('empresa')}</Th>
                  <Th sortable onClick={() => ordenarPor('monitor')}>Monitor{seta('monitor')}</Th>
                  <Th sortable onClick={() => ordenarPor('servicos')}>Serviços{seta('servicos')}</Th>
                  <Th sortable onClick={() => ordenarPor('risco')} style={{ textAlign: 'center' }} title="Análise de IA (risco + resumo) deste cliente">IA{seta('risco')}</Th>
                  <Th sortable onClick={() => ordenarPor('status')}>Situação{seta('status')}</Th>
                  <Th sortable onClick={() => ordenarPor('anotacoes')}>Anotações{seta('anotacoes')}</Th>
                  <Th>Cadência</Th>
                  <Th sortable onClick={() => ordenarPor('diasSemContato')}>Dias sem contato{seta('diasSemContato')}</Th>
                  <Th style={{ width: 96 }}></Th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((cliente) => {
                  const ult = ultimaReuniao.get(cliente.id);
                  const prox = proximoAgendamento.get(cliente.id);
                  const ultC = ultimoContato.get(cliente.id);
                  const ultCData = ultC ? parseISO(ultC.date) : null;
                  const diasSemContato = ultCData ? differenceInCalendarDays(hoje, ultCData) : null;
                  const inativo = (cliente.estado || 'Ativo') !== 'Ativo';
                  return (
                    <tr
                      key={cliente.id}
                      className="group [&:last-child>td]:border-b-0"
                      style={isGratuidade(cliente.status) ? { background: 'var(--gratuidade-pastel-bg)' } : undefined}
                    >
                      <Td first>
                        <button className="link-button" style={{ fontWeight: 600 }} onClick={() => navigate(`/clientes/${cliente.id}`)}>
                          {cliente.empresa}
                        </button>
                      </Td>
                      <Td className="text-text-muted">{cliente.monitor || '—'}</Td>
                      <Td>
                        <ServicosCell servicos={cliente.servicos} corPorServico={corPorServico} />
                      </Td>
                      <Td style={{ textAlign: 'center' }}>
                        <AnaliseIACell clienteId={cliente.id} risco={analisesPorCliente.get(cliente.id)?.nivelRisco} />
                      </Td>
                      <Td>
                        <div className="flex-row" style={{ gap: 5, flexWrap: 'wrap' }}>
                          <Badge variant={clienteStatusBadge(cliente.status)}>{cliente.status || '—'}</Badge>
                          {inativo && <Badge variant="danger">Inativo</Badge>}
                        </div>
                      </Td>
                      <Td className="text-text-muted" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cliente.observacao || undefined}>
                        {cliente.observacao?.trim() || '—'}
                      </Td>
                      <Td className="text-text-muted" style={{ fontSize: '0.8rem', lineHeight: 1.5 }}>
                        <div>Últ. reunião: {ult ? format(ult, 'dd/MM/yyyy') : '—'}</div>
                        <div>Próximo: {prox ? `${prox.type} · ${format(parseISO(prox.date), 'dd/MM/yyyy')}` : '—'}</div>
                        <div>Últ. contato: {ultCData ? format(ultCData, 'dd/MM/yyyy') : '—'}</div>
                      </Td>
                      <Td>
                        {diasSemContato === null ? (
                          <span className="text-text-muted">—</span>
                        ) : (
                          <Badge variant={
                            diasSemContato > cadencias.reuniao_dias ? 'danger'
                              : diasSemContato > cadencias.reuniao_dias * 0.7 ? 'warning'
                              : 'muted'
                          }>
                            {diasSemContato}d
                          </Badge>
                        )}
                      </Td>
                      <Td>
                        <div className="flex-row" style={{ justifyContent: 'flex-end' }}>
                          <Button variant="secondary" size="icon" onClick={() => setModalState({ editing: cliente })} aria-label="Editar">
                            <Pencil size={15} />
                          </Button>
                          <Button variant="danger" size="icon" onClick={() => handleDelete(cliente)} aria-label="Excluir">
                            <Trash2 size={15} />
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {modalState && (
        <ClientFormModal initial={modalState.editing ?? undefined} onClose={() => setModalState(null)} />
      )}
    </div>
  );
}
