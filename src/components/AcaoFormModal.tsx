import { useMemo, useState, type FormEvent } from 'react';
import { format, parse, parseISO, differenceInCalendarDays } from 'date-fns';
import { useCarteira } from '../context/CarteiraContext';
import { toastError } from '../utils/toast';
import { ModalShell } from './ModalShell';
import { ACAO_TIPOS, ACAO_TIPO_LABEL, type AcaoTipo, type Segmento } from '../types';

interface AcaoFormModalProps {
  /** 'nova' = ação já realizada; 'agendar' = ação planejada para uma data futura. */
  modo: 'nova' | 'agendar';
  clienteId?: string;
  tipoInicial?: AcaoTipo;
  onClose: () => void;
}

export function AcaoFormModal({ modo, clienteId, tipoInicial, onClose }: AcaoFormModalProps) {
  const { clientes, agenda, cadencias, registrarAcao, criarLembrete } = useCarteira();
  const [clientId, setClientId] = useState(clienteId ?? clientes[0]?.id ?? '');
  const [tipo, setTipo] = useState<AcaoTipo>(tipoInicial ?? 'contato');
  const [data, setData] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Segmento estimado a partir da última reunião do cliente (só p/ material/relatório).
  const segmentoDe = useMemo(() => (cid: string): Segmento => {
    const datas = agenda
      .filter((a) => a.clientId === cid)
      .map((a) => parseISO(a.date))
      .filter((d) => !isNaN(d.getTime()) && d <= new Date());
    if (datas.length === 0) return 'frio';
    const ultimo = new Date(Math.max(...datas.map((d) => d.getTime())));
    const dias = differenceInCalendarDays(new Date(), ultimo);
    return dias >= cadencias.esfriando_dias ? 'esfriando' : 'engajado';
  }, [agenda, cadencias]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cliente = clientes.find((c) => c.id === clientId);
    if (!cliente) { toastError('Selecione um cliente.'); return; }
    setSaving(true);
    try {
      const dataIso = parse(data, 'yyyy-MM-dd', new Date()).toISOString();
      await registrarAcao({
        clientId,
        tipo,
        segmento: segmentoDe(clientId),
        status: modo === 'nova' ? 'concluido' : 'programado',
        notes,
        dueAt: dataIso,
      });
      if (modo === 'agendar') {
        await criarLembrete({
          title: `${ACAO_TIPO_LABEL[tipo]} — ${cliente.empresa}`,
          type: ACAO_TIPO_LABEL[tipo],
          datetime: dataIso,
          clientId,
          recurrence: 'none',
          description: notes,
        });
      }
      onClose();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao salvar a ação.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      title={modo === 'nova' ? 'Nova ação (realizada)' : 'Agendar ação'}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving || clientes.length === 0}>
            {saving ? 'Salvando...' : modo === 'nova' ? 'Registrar' : 'Agendar'}
          </button>
        </>
      }
    >
            <label className="field">
              Cliente
              <select className="field-input custom-select" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                <option value="" disabled>Selecione...</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.empresa}</option>)}
              </select>
            </label>

            <div className="field">
              Tipo de ação
              <div className="chip-select">
                {ACAO_TIPOS.map((t) => (
                  <button type="button" key={t} className={`chip-toggle${tipo === t ? ' is-on' : ''}`} onClick={() => setTipo(t)}>
                    {ACAO_TIPO_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>

            <label className="field">
              {modo === 'nova' ? 'Data em que foi feita' : 'Data planejada'}
              <input type="date" className="field-input" value={data} onChange={(e) => setData(e.target.value)} required />
            </label>

            <label className="field">
              Observação
              <textarea className="field-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="O que foi tratado / o que planejar..." />
            </label>
    </ModalShell>
  );
}
