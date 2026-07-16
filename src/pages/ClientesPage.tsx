import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { useNavigate } from 'react-router-dom';
import { FileUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { truthy } from '../utils/formatters';
import { clienteStatusBadge } from '../utils/badges';
import { ClientFormModal } from '../components/ClientFormModal';
import type { Cliente, NovoCliente } from '../types';

export default function ClientesPage() {
  const { clientes, removerCliente, criarClientesEmLote, opcoesPorTipo } = useCarteira();
  const navigate = useNavigate();
  const statusOpcoes = opcoesPorTipo('status_cliente');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 200);
  const [statusFiltro, setStatusFiltro] = useState<string>('');
  const [modalState, setModalState] = useState<{ editing: Cliente | null } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtrados = useMemo(() => {
    const termo = debouncedSearch.trim().toLowerCase();
    return clientes.filter((c) => {
      const combinaTermo = !termo || c.empresa.toLowerCase().includes(termo) || (c.monitor ?? '').toLowerCase().includes(termo);
      const combinaStatus = !statusFiltro || c.status === statusFiltro;
      return combinaTermo && combinaStatus;
    });
  }, [clientes, debouncedSearch, statusFiltro]);

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
        if (truthy(row.Controladoria ?? row.controladoria)) servicos.push('Controladoria');
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
      <div className="flex-between" style={{ marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>Clientes</h1>
          <p className="text-muted" style={{ fontSize: 14 }}>{clientes.length} cliente(s) cadastrado(s)</p>
        </div>
        <div className="flex-row">
          <input
            className="field-input"
            placeholder="Buscar empresa ou monitor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 220 }}
          />
          <select
            className="field-input custom-select"
            style={{ width: 170 }}
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value)}
          >
            <option value="">Todos os status</option>
            {statusOpcoes.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
            <FileUp size={16} /> Importar Excel
          </button>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={handleImportFile} />
          <button className="btn btn-primary" onClick={() => setModalState({ editing: null })}>
            <Plus size={16} /> Novo Cliente
          </button>
        </div>
      </div>

      <div className="glass-card glass-card-flat" style={{ padding: 8 }}>
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
                  <th style={{ width: 100 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((cliente) => (
                  <tr key={cliente.id}>
                    <td>
                      <button className="link-button" onClick={() => navigate(`/clientes/${cliente.id}`)}>
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
                    <td>
                      <div className="flex-row">
                        <button className="btn btn-secondary btn-icon" onClick={() => setModalState({ editing: cliente })}>
                          <Pencil size={15} />
                        </button>
                        <button className="btn btn-danger btn-icon" onClick={() => handleDelete(cliente)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
