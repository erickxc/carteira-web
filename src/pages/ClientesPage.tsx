import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { FileUp, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { truthy } from '../utils/formatters';
import { clienteStatusBadge } from '../utils/badges';
import { ClientFormModal } from '../components/ClientFormModal';
import { MultiSelect } from '../components/MultiSelect';
import { TIPO_ANALISE_LABEL, type Cliente, type NovoCliente } from '../types';

const PERIODOS = [
  { valor: 'Todos', label: 'Últ. reunião: todas' },
  { valor: '7', label: 'Sem reunião +7d' },
  { valor: '15', label: 'Sem reunião +15d' },
  { valor: '30', label: 'Sem reunião +30d' },
  { valor: '60', label: 'Sem reunião +60d' },
];

export default function ClientesPage() {
  const { clientes, agenda, removerCliente, criarClientesEmLote, opcoesPorTipo } = useCarteira();
  const navigate = useNavigate();
  const hoje = new Date();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 200);
  const [fMonitores, setFMonitores] = useState<string[]>([]);
  const [fTipoAnalise, setFTipoAnalise] = useState<string>('Todos');
  const [fServicos, setFServicos] = useState<string[]>([]);
  const [fStatus, setFStatus] = useState<string>('Ativo');
  const [fPeriodo, setFPeriodo] = useState<string>('Todos');
  const [modalState, setModalState] = useState<{ editing: Cliente | null } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Última reunião por cliente (evento mais recente).
  const ultimaReuniao = useMemo(() => {
    const map = new Map<string, Date>();
    agenda.forEach((a) => {
      const d = parseISO(a.date);
      if (isNaN(d.getTime())) return;
      const atual = map.get(a.clientId);
      if (!atual || d > atual) map.set(a.clientId, d);
    });
    return map;
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

  const filtrados = useMemo(() => {
    const termo = debouncedSearch.trim().toLowerCase();
    return clientes
      .filter((c) => fStatus === 'Todos' || c.status === fStatus)
      .filter((c) => !termo || c.empresa.toLowerCase().includes(termo) || (c.monitor ?? '').toLowerCase().includes(termo))
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
      .sort((a, b) => a.empresa.localeCompare(b.empresa));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes, debouncedSearch, fMonitores, fTipoAnalise, fServicos, fStatus, fPeriodo, ultimaReuniao]);

  async function handleDelete(cliente: Cliente) {
    if (!confirm(`Excluir o cliente "${cliente.empresa}"? Isso também remove os eventos de agenda vinculados.`)) return;
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
      alert('Nenhum cliente válido encontrado na planilha (coluna "Empresa" é obrigatória).');
    } else {
      await criarClientesEmLote(parsed);
      alert(`${parsed.length} cliente(s) importado(s) com sucesso.`);
    }
    e.target.value = '';
  }

  return (
    <div className="page-container">
      <div className="flex-between" style={{ marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>Clientes</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>
            {filtrados.length} de {clientes.length} cliente(s)
          </p>
        </div>
        <div className="flex-row" style={{ gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
            <FileUp size={16} /> Importar
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={handleImportFile} />
          <button className="btn btn-primary" onClick={() => setModalState({ editing: null })}>
            <Plus size={16} /> Novo Cliente
          </button>
        </div>
      </div>

      {/* Barra de filtros */}
      <div className="glass-card glass-card-flat mb-4">
        <div className="filter-grid">
          <label className="filter-ctl filter-search">
            <Search size={16} />
            <input
              placeholder="Buscar cliente ou monitor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <MultiSelect label="Monitor" options={monitorOpcoes} selected={fMonitores} onChange={setFMonitores} />

          <select
            className={`filter-ctl${fTipoAnalise !== 'Todos' ? ' is-active' : ''}`}
            value={fTipoAnalise}
            onChange={(e) => setFTipoAnalise(e.target.value)}
          >
            <option value="Todos">Análise: todas</option>
            <option value="unitaria">{TIPO_ANALISE_LABEL.unitaria}</option>
            <option value="segmentado">Segmentado</option>
          </select>

          <MultiSelect label="Serviços" options={servicoOpcoes} selected={fServicos} onChange={setFServicos} />

          <select
            className={`filter-ctl${fStatus !== 'Ativo' ? ' is-active' : ''}`}
            value={fStatus}
            onChange={(e) => setFStatus(e.target.value)}
          >
            {statusOpcoes.map((s) => <option key={s} value={s}>{s === 'Todos' ? 'Status: todos' : s}</option>)}
          </select>

          <select
            className={`filter-ctl${fPeriodo !== 'Todos' ? ' is-active' : ''}`}
            value={fPeriodo}
            onChange={(e) => setFPeriodo(e.target.value)}
          >
            {PERIODOS.map((p) => <option key={p.valor} value={p.valor}>{p.label}</option>)}
          </select>
        </div>

        {filtrosAtivos && (
          <div className="flex items-center justify-end gap-3 mt-3 pt-3 border-t border-border">
            <span className="text-[0.8rem] text-text-muted">{filtrados.length} resultado(s)</span>
            <button className="btn btn-secondary" onClick={limparFiltros}>
              <X size={15} /> Limpar filtros
            </button>
          </div>
        )}
      </div>

      <div className="glass-card glass-card-flat" style={{ padding: 0, overflow: 'hidden' }}>
        {filtrados.length === 0 ? (
          <div className="empty-state">Nenhum cliente encontrado.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Monitor</th>
                  <th>Serviços</th>
                  <th>Análise</th>
                  <th>Status</th>
                  <th>Última reunião</th>
                  <th style={{ width: 96 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((cliente) => {
                  const ult = ultimaReuniao.get(cliente.id);
                  const segmentado = cliente.tipoAnalise === 'segmentado';
                  return (
                    <tr key={cliente.id}>
                      <td>
                        <button className="link-button" style={{ fontWeight: 600 }} onClick={() => navigate(`/clientes/${cliente.id}`)}>
                          {cliente.empresa}
                        </button>
                      </td>
                      <td className="text-muted">{cliente.monitor || '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {cliente.servicos.length > 0
                            ? cliente.servicos.map((s) => <span key={s} className="badge badge-accent">{s}</span>)
                            : <span className="text-muted">—</span>}
                        </div>
                      </td>
                      <td>
                        {segmentado
                          ? <span className="badge badge-warning">Segmentado · {cliente.lojas?.length ?? 0}</span>
                          : <span className="text-muted">Unitária</span>}
                      </td>
                      <td>
                        <span className={`badge ${clienteStatusBadge(cliente.status)}`}>{cliente.status || '—'}</span>
                      </td>
                      <td className="text-muted">{ult ? format(ult, 'dd/MM/yyyy') : '—'}</td>
                      <td>
                        <div className="flex-row" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn btn-secondary btn-icon" onClick={() => setModalState({ editing: cliente })} aria-label="Editar">
                            <Pencil size={15} />
                          </button>
                          <button className="btn btn-danger btn-icon" onClick={() => handleDelete(cliente)} aria-label="Excluir">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalState && (
        <ClientFormModal initial={modalState.editing ?? undefined} onClose={() => setModalState(null)} />
      )}
    </div>
  );
}
