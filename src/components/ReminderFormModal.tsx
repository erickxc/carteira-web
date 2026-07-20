import { useMemo, useState, type FormEvent } from 'react';
import { format, parseISO } from 'date-fns';
import { useCarteira } from '../context/CarteiraContext';
import { toastError } from '../utils/toast';
import type { Lembrete, Recorrencia } from '../types';

const RECURRENCE_OPTIONS: { value: Recorrencia; label: string }[] = [
  { value: 'none', label: 'Não repetir' },
  { value: 'daily', label: 'Diariamente' },
  { value: 'weekly', label: 'Semanalmente' },
  { value: 'monthly', label: 'Mensalmente' },
];

interface ReminderFormModalProps {
  initial?: Lembrete;
  initialClientId?: string;
  onClose: () => void;
}

export function ReminderFormModal({ initial, initialClientId, onClose }: ReminderFormModalProps) {
  const { clientes, agenda, criarLembrete, atualizarLembrete, opcoesPorTipo } = useCarteira();
  const tipoOpcoes = opcoesPorTipo('tipo_lembrete');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [tipo, setTipo] = useState(initial?.type ?? tipoOpcoes[0] ?? '');
  const [datetime, setDatetime] = useState(
    initial ? format(new Date(initial.datetime), "yyyy-MM-dd'T'HH:mm") : format(new Date(Date.now() + 60 * 60 * 1000), "yyyy-MM-dd'T'HH:mm")
  );
  const [clientId, setClientId] = useState(initial?.clientId ?? initialClientId ?? '');
  const [eventId, setEventId] = useState(initial?.eventId ?? '');
  const [recurrence, setRecurrence] = useState<Recorrencia>(initial?.recurrence ?? 'none');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [saving, setSaving] = useState(false);

  const eventosDoCliente = useMemo(
    () =>
      agenda
        .filter((a) => a.clientId === clientId)
        .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime()),
    [agenda, clientId]
  );

  function handleClientChange(novoClientId: string) {
    setClientId(novoClientId);
    setEventId('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const payload = { title, type: tipo, datetime: new Date(datetime).toISOString(), clientId, eventId: eventId || undefined, recurrence, description };
      if (initial) {
        await atualizarLembrete(initial.id, payload);
      } else {
        await criarLembrete(payload);
      }
      onClose();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao salvar o lembrete.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{initial ? 'Editar Lembrete' : 'Novo Lembrete'}</h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <label className="field">
              Título
              <input className="field-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>

            <label className="field">
              Tipo de alerta
              <select className="field-input custom-select" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {tipoOpcoes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>

            <label className="field">
              Data e hora
              <input type="datetime-local" className="field-input" value={datetime} onChange={(e) => setDatetime(e.target.value)} required />
            </label>

            <label className="field">
              Cliente (opcional)
              <select className="field-input custom-select" value={clientId} onChange={(e) => handleClientChange(e.target.value)}>
                <option value="">Nenhum</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.empresa}</option>
                ))}
              </select>
            </label>

            {clientId && (
              <label className="field">
                Reunião vinculada (opcional)
                <select className="field-input custom-select" value={eventId} onChange={(e) => setEventId(e.target.value)}>
                  <option value="">Nenhuma</option>
                  {eventosDoCliente.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {format(parseISO(ev.date), 'dd/MM/yyyy')} — {ev.subject || ev.type}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="field">
              Recorrência
              <select className="field-input custom-select" value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recorrencia)}>
                {RECURRENCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>

            <label className="field">
              Descrição
              <textarea className="field-input" value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
