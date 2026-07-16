import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, Bell as BellIcon, CalendarPlus, Paperclip, Pencil, Save, Trash2 } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { urlAnexo } from '../api/client';
import { clienteStatusBadge, eventoStatusBadge } from '../utils/badges';
import { ClientFormModal } from '../components/ClientFormModal';
import { EventFormModal } from '../components/EventFormModal';
import { ReminderFormModal } from '../components/ReminderFormModal';

export default function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { clientes, agenda, removerCliente, atualizarCliente, opcoesPorTipo } = useCarteira();
  const statusOpcoes = opcoesPorTipo('status_cliente');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [reminderModalOpen, setReminderModalOpen] = useState(false);

  const cliente = clientes.find((c) => c.id === id);

  const [observacao, setObservacao] = useState(cliente?.observacao ?? '');
  const [salvandoObs, setSalvandoObs] = useState(false);

  const historico = useMemo(
    () => agenda.filter((a) => a.clientId === id).sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime()),
    [agenda, id]
  );

  if (!cliente) {
    return (
      <div className="page-container">
        <button className="btn btn-secondary" onClick={() => navigate('/clientes')}>
          <ArrowLeft size={15} /> Voltar
        </button>
        <div className="empty-state">Cliente não encontrado.</div>
      </div>
    );
  }

  const obsMudou = observacao !== (cliente.observacao ?? '');

  async function salvarObservacao() {
    if (!id) return;
    setSalvandoObs(true);
    try {
      await atualizarCliente(id, { observacao });
    } finally {
      setSalvandoObs(false);
    }
  }

  async function handleExcluir() {
    if (!id) return;
    if (!confirm(`Excluir o cliente "${cliente!.empresa}"? Isso também remove os eventos de agenda vinculados.`)) return;
    await removerCliente(id);
    navigate('/clientes');
  }

  return (
    <div className="page-container">
      <button className="btn btn-secondary" onClick={() => navigate('/clientes')} style={{ marginBottom: 20 }}>
        <ArrowLeft size={15} /> Voltar para Clientes
      </button>

      <div className="glass-card" style={{ marginBottom: 24 }}>
        <div className="flex-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: 8 }}>{cliente.empresa}</h1>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                className="field-input custom-select"
                style={{ width: 'auto' }}
                value={cliente.status}
                onChange={(e) => atualizarCliente(cliente.id, { status: e.target.value })}
              >
                {statusOpcoes.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
                {!statusOpcoes.includes(cliente.status) && cliente.status && (
                  <option value={cliente.status}>{cliente.status}</option>
                )}
              </select>
              <span className={`badge ${clienteStatusBadge(cliente.status)}`}>{cliente.status || '—'}</span>
              {cliente.monitor && <span className="badge badge-muted">Monitor: {cliente.monitor}</span>}
              {cliente.servicos.map((s) => <span key={s} className="badge badge-accent">{s}</span>)}
            </div>
          </div>
          <div className="flex-row">
            <button className="btn btn-secondary" onClick={() => setEditModalOpen(true)}>
              <Pencil size={15} /> Editar
            </button>
            <button className="btn btn-danger" onClick={handleExcluir}>
              <Trash2 size={15} /> Excluir
            </button>
          </div>
        </div>
      </div>

      <div className="flex-row" style={{ marginBottom: 24 }}>
        <button className="btn btn-primary" onClick={() => setEventModalOpen(true)}>
          <CalendarPlus size={15} /> Novo Evento
        </button>
        <button className="btn btn-secondary" onClick={() => setReminderModalOpen(true)}>
          <BellIcon size={15} /> Novo Lembrete
        </button>
      </div>

      <div className="two-col-grid">
        <div className="glass-card glass-card-flat">
          <div className="section-header"><h3>Anotações</h3></div>
          <textarea
            className="field-input"
            placeholder="Anotações sobre este cliente..."
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            style={{ minHeight: 160, marginBottom: 12 }}
          />
          <button className="btn btn-primary" onClick={salvarObservacao} disabled={salvandoObs || !obsMudou}>
            <Save size={14} /> {salvandoObs ? 'Salvando...' : 'Salvar anotação'}
          </button>
        </div>

        <div className="glass-card glass-card-flat">
          <div className="section-header"><h3>Histórico</h3></div>
          {historico.length === 0 ? (
            <div className="empty-state">Nenhum evento registrado para este cliente.</div>
          ) : (
            <div>
              {historico.map((evento) => (
                <div key={evento.id} className="history-item">
                  <div className="flex-between" style={{ marginBottom: 6 }}>
                    <strong style={{ fontSize: 14 }}>{evento.subject || evento.type}</strong>
                    <span className="badge badge-accent">{format(parseISO(evento.date), 'dd/MM/yyyy')}</span>
                  </div>
                  <div className="flex-row" style={{ marginBottom: evento.description ? 6 : 0 }}>
                    <span className="badge badge-accent">{evento.type}</span>
                    <span className={`badge ${eventoStatusBadge(evento.status)}`}>{evento.status}</span>
                  </div>
                  {evento.description && <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>{evento.description}</p>}
                  {evento.attachments.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {evento.attachments.map((anexo) => (
                        <a key={anexo.id} className="attachment-chip" href={urlAnexo(anexo.filename)} target="_blank" rel="noreferrer">
                          <Paperclip size={12} /> {anexo.originalName}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editModalOpen && <ClientFormModal initial={cliente} onClose={() => setEditModalOpen(false)} />}
      {eventModalOpen && <EventFormModal initialClientId={cliente.id} onClose={() => setEventModalOpen(false)} />}
      {reminderModalOpen && <ReminderFormModal initialClientId={cliente.id} onClose={() => setReminderModalOpen(false)} />}
    </div>
  );
}
