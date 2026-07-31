import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { FileUp, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { useSearchFilter } from '../hooks/useSearchFilter';
import { usePersistedState } from '../hooks/usePersistedState';
import { truthy } from '../utils/formatters';
import { clienteStatusBadge, isGratuidade } from '../utils/badges';
import { toastError, toastSuccess } from '../utils/toast';
import { confirmDialog } from '../utils/confirmDialog';
import { ClientFormModal } from '../components/ClientFormModal';
import { Dropdown } from '../components/Dropdown';
import { Badge, Button, Card, Td, Th } from '../ui';
import { TIPO_ANALISE_LABEL, type Cliente, type EventoAgenda, type NovoCliente } from '../types';

type SortCol = 'empresa' | 'monitor' | 'servicos' | 'analise' | 'status' | 'anotacoes' | 'ultimaReuniao' | 'proximo' | 'ultimoContato' | 'diasSemContato';

const PERIODOS = [
  { valor: 'Todos', label: 'Últ. reunião: todas' },
  { valor: '7', label: 'Sem reunião +7d' },
  { valor: '15', label: 'Sem reunião +15d' },
  { valor: '30', label: 'Sem reunião +30d' },
  { valor: '60', label: 'Sem reunião +60d' },
];

export default function ClientesPage() {
  const { clientes, agenda, cadencias, removerCliente, criarClientesEmLote, opcoesPorTipo } = useCarteira();
  const navigate = useNavigate();
  const hoje = new Date();

  const { value: search, debounced: debouncedSearch, setValue: setSearch } = useSearchFilter();
  const [fMonitores, setFMonitores] = usePersistedState<string[]>('filtro:clientes:monitores', []);
  const [fTipoAnalise, setFTipoAnalise] = usePersistedState<string>('filtro:clientes:analise', 'Todos');
  const [fServicos, setFServicos] = usePersistedState<string[]>('filtro:clientes:servicos', []);
  const [fStatus, setFStatus] = usePersistedState<string>('filtro:clientes:status', 'Ativo');
  const [fPeriodo, setFPeriodo] = usePersistedState<string>('filtro:clientes:periodo', 'Todos');
  const [sortBy, setSortBy] = usePersistedState<SortCol>('filtro:clientes:sortBy', 'empresa');
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>('filtro:clientes:sortDir', 'asc');
  const [modalState, setModalState] = useState<{ editing: Cliente | null } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  // dia virar). Cancelado/Reagendado não conta como contato nem como próximo.
  const { proximoAgendamento, ultimoContato } = useMemo(() => {
    const proximoMap = new Map<string, EventoAgenda>();
    const ultimoMap = new Map<string, EventoAgenda>();
    const concluido = (a: EventoAgenda) => /conclu|realiz/i.test(a.status || '');
    const cancelado = (a: EventoAgenda) => /cancel|reagend/i.test(a.status || '');
    agenda.forEach((a) => {
      if (cancelado(a)) return;
      const d = parseISO(a.date);
      if (isNaN(d.getTime())) return;
      if (!concluido(a) && differenceInCalendarDays(d, hoje) >= 0) {
        const atual = proximoMap.get(a.clientId);
        if (!atual || d < parseISO(atual.date)) proximoMap.set(a.clientId, a);
      } else {
        const atual = ultimoMap.get(a.clientId);
        if (!atual || d > parseISO(atual.date)) ultimoMap.set(a.clientId, a);
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
  const statusOpcoes = useMemo(() => ['Todos', ...opcoesPorTipo('status_cliente')], [opcoesPorTipo]);

  const filtrosAtivos =
    !!debouncedSearch.trim() || fMonitores.length > 0 || fTipoAnalise !== 'Todos' ||
    fServicos.length > 0 || fStatus !== 'Ativo' || fPeriodo !== 'Todos';

  function limparFiltros() {
    setSearch(''); setFMonitores([]); setFTipoAnalise('Todos'); setFServicos([]); setFStatus('Ativo'); setFPeriodo('Todos');
  }

  // Valor comparável de cada coluna, pra ordenação por clique no cabeçalho.
  function valorOrdenacao(c: Cliente, col: SortCol): string | number {
    switch (col) {
      case 'empresa': return c.empresa.toLowerCase();
      case 'monitor': return (c.monitor || '').toLowerCase();
      case 'servicos': return (c.servicos ?? []).join(', ').toLowerCase();
      case 'analise': return c.tipoAnalise === 'segmentado' || !!c.grupo ? 1 : 0;
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
  }, [clientes, debouncedSearch, fMonitores, fTipoAnalise, fServicos, fStatus, fPeriodo, ultimaReuniao, proximoAgendamento, ultimoContato, sortBy, sortDir]);

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
          status: String(row.Status ?? row.status ?? 'Ativo').trim() || 'Ativo',
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
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
            <FileUp size={16} /> Importar
          </Button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={handleImportFile} />
          <Button variant="primary" onClick={() => setModalState({ editing: null })}>
            <Plus size={16} /> Novo Cliente
          </Button>
        </div>
      </div>

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
            label="Status: todos"
            defaultValue="Ativo"
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
                  <Th sortable onClick={() => ordenarPor('analise')}>Análise{seta('analise')}</Th>
                  <Th sortable onClick={() => ordenarPor('status')}>Status{seta('status')}</Th>
                  <Th sortable onClick={() => ordenarPor('anotacoes')}>Anotações{seta('anotacoes')}</Th>
                  <Th sortable onClick={() => ordenarPor('ultimaReuniao')}>Última reunião{seta('ultimaReuniao')}</Th>
                  <Th sortable onClick={() => ordenarPor('proximo')}>Próximo agendamento{seta('proximo')}</Th>
                  <Th sortable onClick={() => ordenarPor('ultimoContato')}>Último contato{seta('ultimoContato')}</Th>
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
                  const segmentado = cliente.tipoAnalise === 'segmentado' || !!cliente.grupo;
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
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {cliente.servicos.length > 0
                            ? cliente.servicos.map((s) => <Badge key={s} variant="accent">{s}</Badge>)
                            : <span className="text-text-muted">—</span>}
                        </div>
                      </Td>
                      <Td>
                        {segmentado
                          ? <Badge variant="warning">Segmentado</Badge>
                          : <span className="text-text-muted">Unitária</span>}
                      </Td>
                      <Td>
                        <Badge variant={clienteStatusBadge(cliente.status)}>{cliente.status || '—'}</Badge>
                      </Td>
                      <Td className="text-text-muted" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cliente.observacao || undefined}>
                        {cliente.observacao?.trim() || '—'}
                      </Td>
                      <Td className="text-text-muted">{ult ? format(ult, 'dd/MM/yyyy') : '—'}</Td>
                      <Td className="text-text-muted">
                        {prox ? `${prox.type} - ${format(parseISO(prox.date), 'dd/MM/yyyy')}` : '—'}
                      </Td>
                      <Td className="text-text-muted">{ultCData ? format(ultCData, 'dd/MM/yyyy') : '—'}</Td>
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
