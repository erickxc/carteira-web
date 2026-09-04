import { useMemo, useState, type FormEvent } from 'react';
import { format, parseISO } from 'date-fns';
import { useCarteira } from '../context/CarteiraContext';
import { toastError } from '../utils/toast';
import { ModalShell } from './ModalShell';
import { Button, Field, Input, Textarea } from '../ui';
import { SelectField } from './SelectField';
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
  /** Pré-preenchimento ao criar um lembrete novo (ex.: "programar relatório"). */
  initialTitle?: string;
  initialType?: string;
  initialDescription?: string;
  onClose: () => void;
  /** Chamado após salvar com sucesso (antes de fechar) — ex.: marcar como programado. */
  onSaved?: () => void;
}

export function ReminderFormModal({ initial, initialClientId, initialTitle, initialType, initialDescription, onClose, onSaved }: ReminderFormModalProps) {
  const { clientes, agenda, criarLembrete, atualizarLembrete, opcoesPorTipo } = useCarteira();
  const tipoOpcoes = opcoesPorTipo('tipo_lembrete');
  const [title, setTitle] = useState(initial?.title ?? initialTitle ?? '');
  const [tipo, setTipo] = useState(initial?.type ?? initialType ?? tipoOpcoes[0] ?? '');
  // Inicializador preguiçoso: Date.now() é impuro (não-determinístico) — só deve
  // rodar uma vez, na criação do estado, não a cada render.
  const [datetime, setDatetime] = useState(() =>
    initial ? format(new Date(initial.datetime), "yyyy-MM-dd'T'HH:mm") : format(new Date(Date.now() + 60 * 60 * 1000), "yyyy-MM-dd'T'HH:mm")
  );
  const [clientId, setClientId] = useState(initial?.clientId ?? initialClientId ?? '');
  const [eventId, setEventId] = useState(initial?.eventId ?? '');
  const [recurrence, setRecurrence] = useState<Recorrencia>(initial?.recurrence ?? 'none');
  const [description, setDescription] = useState(initial?.description ?? initialDescription ?? '');
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
      onSaved?.();
      onClose();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao salvar o lembrete.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={initial ? 'Editar Lembrete' : 'Novo Lembrete'}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </>
      }
    >
            <Field label="Título">
              <Input tone="modal" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} required />
            </Field>

            <SelectField
              label="Tipo de lembrete"
              value={tipo}
              onChange={setTipo}
              options={tipoOpcoes.map((t) => ({ value: t, label: t }))}
            />

            <Field label="Data e hora">
              <Input tone="modal" type="datetime-local" value={datetime} onChange={(e) => setDatetime(e.target.value)} required />
            </Field>

            <SelectField
              label="Cliente (opcional)"
              placeholder="Nenhum"
              value={clientId}
              onChange={handleClientChange}
              options={[{ value: '', label: 'Nenhum' }, ...clientes.map((c) => ({ value: c.id, label: c.empresa }))]}
            />

            {clientId && (
              <SelectField
                label="Reunião vinculada (opcional)"
                placeholder="Nenhuma"
                value={eventId}
                onChange={setEventId}
                options={[
                  { value: '', label: 'Nenhuma' },
                  ...eventosDoCliente.map((ev) => ({ value: ev.id, label: `${format(parseISO(ev.date), 'dd/MM/yyyy')} — ${ev.subject || ev.type}` })),
                ]}
              />
            )}

            <SelectField
              label="Recorrência"
              value={recurrence}
              onChange={(v) => setRecurrence(v as Recorrencia)}
              options={RECURRENCE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
            />
            <Field label="Descrição">
              <Textarea tone="modal" value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
    </ModalShell>
  );
}
