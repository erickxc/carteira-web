import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { FileUp, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { truthy, isStatusAtivo } from '../utils/formatters';
import { clienteStatusBadge } from '../utils/badges';
import { ClientFormModal } from '../components/ClientFormModal';
import type { Cliente, NovoCliente } from '../types';

export default function ClientesPage() {
  const { clientes, agenda, removerCliente, criarClientesEmLote } = useCarteira();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 200);
  const [somenteAtivos, setSomenteAtivos] = useState(true);
  const [modalState, setModalState] = useState<{ editing: Cliente | null } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Última reunião por cliente (data do evento mais recente).
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

  const filtrados = useMemo(() => {
    const termo = debouncedSearch.trim().toLowerCase();
    return clientes
      .filter((c) => (somenteAtivos ? isStatusAtivo(c.status) : true))
      .filter((c) => !termo || c.empresa.toLowerCase().includes(termo) || (c.monitor ?? '').toLowerCase().includes(termo))
      .sort((a, b) => a.empresa.localeCompare(b.empresa));
  }, [clientes, debouncedSearch, somenteAtivos]);

  const totalAtivos = useMemo(() => clientes.filter((c) => isStatusAtivo(c.status)).length, [clientes]);

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
            {somenteAtivos
              ? `${filtrados.length} cliente(s) ativo(s)`
              : `${filtrados.length} de ${clientes.length} · ${totalAtivos} ativos`}
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
      <div className="glass-card glass-card-flat clientes-toolbar">
        <div className="clientes-search">
          <Search size={16} className="text-muted" />
          <input
            placeholder="Buscar empresa ou monitor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="check-row" style={{ whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={somenteAtivos} onChange={(e) => setSomenteAtivos(e.target.checked)} />
          Ver somente ativos
        </label>
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
                  <th>Status</th>
                  <th>Última reunião</th>
                  <th style={{ width: 96 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((cliente) => {
                  const ult = ultimaReuniao.get(cliente.id);
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
