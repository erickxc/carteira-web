import { useRef, useState, type FormEvent } from 'react';
import { format, parse } from 'date-fns';
import { Paperclip, Trash2, X } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { urlAnexo } from '../api/client';
import type { EventoAgenda } from '../types';

interface EventFormModalProps {
  initial?: EventoAgenda;
  defaultDate?: Date;
  initialClientId?: string;
  onClose: () => void;
}

export function EventFormModal({ initial, defaultDate, initialClientId, onClose }: EventFormModalProps) {
  const { clientes, agenda, criarEvento, atualizarEvento, removerEvento, enviarAnexoEvento, removerAnexoEvento, opcoesPorTipo } = useCarteira();
  const tipoOpcoes = opcoesPorTipo('tipo_evento');
  const statusOpcoes = opcoesPorTipo('status_evento');
  const [clientId, setClientId] = useState(initial?.clientId ?? initialClientId ?? clientes[0]?.id ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [type, setType] = useState(initial?.type ?? tipoOpcoes[0] ?? '');
  const [date, setDate] = useState(format(initial ? new Date(initial.date) : defaultDate ?? new Date(), 'yyyy-MM-dd'));
  const [description, setDescription] = useState(initial?.description ?? '');
  const [status, setStatus] = useState(initial?.status ?? statusOpcoes[0] ?? 'Agendado');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const eventoAtual = initial ? agenda.find((a) => a.id === initial.id) : undefined;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cliente = clientes.find((c) => c.id === clientId);
    if (!cliente) {
      alert('Selecione um cliente.');
      return;
    }
    if (!subject.trim()) return;
    setSaving(true);
    try {
      const dataLocal = parse(date, 'yyyy-MM-dd', new Date());
      const payload = { clientId, clientName: cliente.empresa, subject, type, date: dataLocal.toISOString(), description, status };
      if (initial) {
        await atualizarEvento(initial.id, payload);
      } else {
        await criarEvento(payload);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial) return;
    if (!confirm('Excluir este evento?')) return;
    await removerEvento(initial.id);
    onClose();
  }

  async function handleFilesSelected(files: FileList | null) {
    if (!initial || !files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await enviarAnexoEvento(initial.id, file);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{initial ? 'Editar Evento' : 'Novo Evento'}</h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <label className="field">
              Cliente
              <select className="field-input custom-select" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                <option value="" disabled>Selecione...</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.empresa}</option>
                ))}
              </select>
            </label>

            <label className="field">
              Assunto
              <input className="field-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex.: Revisão de precificação Q3" required />
            </label>

            <label className="field">
              Tipo
              <select className="field-input custom-select" value={type} onChange={(e) => setType(e.target.value)}>
                {tipoOpcoes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>

            <label className="field">
              Data
              <input type="date" className="field-input" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>

            <label className="field">
              Status
              <select className="field-input custom-select" value={status} onChange={(e) => setStatus(e.target.value)}>
                {statusOpcoes.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>

            <label className="field">
              Descrição
              <textarea className="field-input" value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>

            <div className="field">
              Anexos
              {!initial ? (
                <p className="text-muted" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 'normal' }}>
                  Salve o evento primeiro para anexar arquivos.
                </p>
              ) : (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    {(eventoAtual?.attachments ?? []).map((anexo) => (
                      <span key={anexo.id} className="attachment-chip">
                        <Paperclip size={12} />
                        <a href={urlAnexo(anexo.filename)} target="_blank" rel="noreferrer">{anexo.originalName}</a>
                        <button type="button" onClick={() => removerAnexoEvento(initial.id, anexo)} aria-label="Remover anexo">
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                    {(eventoAtual?.attachments ?? []).length === 0 && (
                      <span className="text-muted" style={{ fontSize: 13, textTransform: 'none' }}>Nenhum anexo.</span>
                    )}
                  </div>
                  <button type="button" className="btn btn-secondary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    <Paperclip size={14} /> {uploading ? 'Enviando...' : 'Adicionar arquivo'}
                  </button>
                  <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => handleFilesSelected(e.target.files)} />
                </>
              )}
            </div>
          </div>

          <div className="modal-footer">
            {initial && (
              <button type="button" className="btn btn-danger" onClick={handleDelete} style={{ marginRight: 'auto' }}>
                <Trash2 size={15} /> Excluir
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving || clientes.length === 0}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
