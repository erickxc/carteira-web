import { useMemo, useState, type FormEvent } from 'react';
import { format, parse, parseISO, differenceInCalendarDays } from 'date-fns';
import { useCarteira } from '../context/CarteiraContext';
import { toastError } from '../utils/toast';
import { ModalShell } from './ModalShell';
import { Button, Chip, Field, Input, Select, Textarea } from '../ui';
import { buildFilaCadencia, classificarCadencia } from '../utils/cadenciaServico';
import { ACAO_TIPOS, ACAO_TIPO_LABEL, type AcaoTipo, type Segmento } from '../types';

interface AcaoFormModalProps {
  /** 'nova' = ação já realizada; 'agendar' = ação planejada para uma data futura. */
  modo: 'nova' | 'agendar';
  clienteId?: string;
  tipoInicial?: AcaoTipo;
  onClose: () => void;
}

export function AcaoFormModal({ modo, clienteId, tipoInicial, onClose }: AcaoFormModalProps) {
  const { clientes, agenda, cadencias, registrarAcao, criarLembrete, opcoesPorTipo } = useCarteira();
  const servicoOpcoes = opcoesPorTipo('servico');
  const monitorOpcoes = opcoesPorTipo('monitor');
  const [clientId, setClientId] = useState(clienteId ?? clientes[0]?.id ?? '');
  const [tipo, setTipo] = useState<AcaoTipo>(tipoInicial ?? 'contato');
  const [servico, setServico] = useState('');
  const [monitor, setMonitor] = useState(clientes.find((c) => c.id === (clienteId ?? clientes[0]?.id))?.monitor ?? '');
  const [data, setData] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Segmento p/ escolher material/relatório — mesma fonte da fila de cadência do
  // Acompanhamento (antes era um cálculo à parte, com limiar diferente, gerando
  // duas leituras de "saúde do cliente" divergentes no mesmo app).
  const filaCadencia = useMemo(() => buildFilaCadencia(clientes, agenda, cadencias), [clientes, agenda, cadencias]);
  const segmentoDe = useMemo(() => (cid: string): Segmento => {
    const item = filaCadencia.find((f) => f.cliente.id === cid);
    if (!item) {
      // Cliente sem Monitoria/Price cadastrado (fora do modelo de cadência) —
      // cai no fallback antigo por recência simples.
      const datas = agenda
        .filter((a) => a.clientId === cid)
        .map((a) => parseISO(a.date))
        .filter((d) => !isNaN(d.getTime()) && d <= new Date());
      if (datas.length === 0) return 'frio';
      const ultimo = new Date(Math.max(...datas.map((d) => d.getTime())));
      return differenceInCalendarDays(new Date(), ultimo) >= cadencias.esfriando_dias ? 'esfriando' : 'engajado';
    }
    const c = classificarCadencia(item);
    return c === 'vencido' ? 'frio' : c === 'vencendo' ? 'esfriando' : 'engajado';
  }, [filaCadencia, agenda, cadencias]);

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
        servico: servico || undefined,
        monitor: monitor || undefined,
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
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={saving || clientes.length === 0}>
            {saving ? 'Salvando...' : modo === 'nova' ? 'Registrar' : 'Agendar'}
          </Button>
        </>
      }
    >
            <Field label="Cliente">
              <Select tone="modal" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                <option value="" disabled>Selecione...</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.empresa}</option>)}
              </Select>
            </Field>

            <Field as="div" label="Tipo de ação">
              <div className="flex flex-wrap gap-2">
                {ACAO_TIPOS.map((t) => (
                  <Chip variant="toggle" key={t} active={tipo === t} onClick={() => setTipo(t)}>
                    {ACAO_TIPO_LABEL[t]}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label="Serviço">
              <Select tone="modal" value={servico} onChange={(e) => setServico(e.target.value)}>
                <option value="">— nenhum —</option>
                {servicoOpcoes.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>

            <Field label="Monitor">
              <Select tone="modal" value={monitor} onChange={(e) => setMonitor(e.target.value)}>
                <option value="">— nenhum —</option>
                {monitorOpcoes.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </Field>

            <Field label={modo === 'nova' ? 'Data em que foi feita' : 'Data planejada'}>
              <Input tone="modal" type="date" value={data} onChange={(e) => setData(e.target.value)} required />
            </Field>

            <Field label="Observação">
              <Textarea tone="modal" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="O que foi tratado / o que planejar..." />
            </Field>
    </ModalShell>
  );
}
