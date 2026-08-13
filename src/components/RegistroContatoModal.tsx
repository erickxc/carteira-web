import { useMemo, useState, type FormEvent } from 'react';
import { format } from 'date-fns';
import { useCarteira } from '../context/CarteiraContext';
import { ModalShell } from './ModalShell';
import { ClienteCombobox } from './ClienteCombobox';
import { toastError, toastSuccess } from '../utils/toast';
import { contatosVisiveis } from '../utils/contatos';
import { Button, Chip, Field, Input, Select, Textarea } from '../ui';

interface RegistroContatoModalProps {
  /** Pré-seleciona o cliente (vindo da tela de detalhe dele). */
  clienteId?: string;
  onClose: () => void;
}

/**
 * Registro rápido de contato RECEBIDO do cliente (o cliente nos procurou por
 * ligação/mensagem). Proposital que seja um modal separado do EventFormModal:
 * aqui o objetivo é registrar em segundos algo que já aconteceu, sem os campos
 * de planejamento de uma reunião (sala, recorrência, checklist, pré-análise).
 *
 * Grava como um evento normal da agenda (tipo Contato/Ligação) com
 * `origem: 'cliente'` — não é uma entidade nova. Assim a interação já entra no
 * histórico, na cadência e nas métricas sem duplicar modelo de dados; e como o
 * filtro de Tipo da Agenda vem só com "Reunião" por padrão, esses registros não
 * poluem o calendário.
 */
export function RegistroContatoModal({ clienteId, onClose }: RegistroContatoModalProps) {
  const { clientes, criarEvento, opcoesPorTipo } = useCarteira();

  const tiposContato = useMemo(() => {
    const todos = opcoesPorTipo('tipo_evento');
    // Só os tipos que representam interação pontual — Reunião/Relatório têm
    // fluxo próprio (agendamento/entrega) e não cabem num registro rápido.
    const filtrados = todos.filter((t) => /contato|liga/i.test(t));
    return filtrados.length > 0 ? filtrados : ['Contato'];
  }, [opcoesPorTipo]);

  const servicoOpcoes = opcoesPorTipo('servico');
  const monitorOpcoes = opcoesPorTipo('monitor');

  // Status vem das categorias (o usuário pode renomear "Concluído"), então
  // procura por palavra-chave em vez de gravar a string fixa — mesmo padrão do
  // EventFormModal. O fallback só vale se não houver nada parecido cadastrado.
  const statusConcluido = useMemo(
    () => opcoesPorTipo('status_evento').find((s) => /conclu|realiz/i.test(s)) ?? 'Concluído',
    [opcoesPorTipo]
  );

  const [clientId, setClientId] = useState(clienteId ?? '');
  const [tipo, setTipo] = useState(tiposContato[0]);
  const [quem, setQuem] = useState('');
  const [servicos, setServicos] = useState<string[]>([]);
  const [monitor, setMonitor] = useState('');
  const [data, setData] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [hora, setHora] = useState(format(new Date(), 'HH:mm'));
  const [assunto, setAssunto] = useState('');
  const [salvando, setSalvando] = useState(false);

  const cliente = clientes.find((c) => c.id === clientId);
  // Inclui contatos compartilhados por outras lojas do mesmo grupo — quem ligou
  // pode ser a pessoa cadastrada na loja irmã.
  const contatosDoCliente = useMemo(() => contatosVisiveis(cliente, clientes), [cliente, clientes]);

  function toggleServico(s: string) {
    setServicos((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!cliente) { toastError('Selecione o cliente.'); return; }
    setSalvando(true);
    try {
      // `parse` local em vez de new Date(string): "2026-08-12" no construtor é
      // lido como UTC e volta um dia em fuso negativo (bug já visto no projeto).
      const [ano, mes, dia] = data.split('-').map(Number);
      const [h, m] = (hora || '00:00').split(':').map(Number);
      const quando = new Date(ano, (mes || 1) - 1, dia || 1, h || 0, m || 0);
      if (isNaN(quando.getTime())) { toastError('Data inválida.'); return; }

      await criarEvento({
        clientId: cliente.id,
        clientName: cliente.empresa,
        type: tipo,
        subject: assunto.trim(),
        description: quem.trim() ? `Falou com: ${quem.trim()}` : '',
        date: quando.toISOString(),
        time: hora,
        status: statusConcluido, // já aconteceu — não é algo a fazer
        origem: 'cliente',
        servicos,
        monitores: monitor ? [monitor] : [],
      });
      // Fecha ANTES de avisar: se o toast falhar por qualquer motivo, o modal
      // já saiu da frente (o registro está gravado). Na ordem inversa, uma falha
      // no aviso deixava o modal aberto como se nada tivesse sido salvo.
      onClose();
      toastSuccess(`Contato de ${cliente.empresa} registrado.`);
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao registrar o contato.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalShell
      title="Cliente entrou em contato"
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={salvando}>
            {salvando ? 'Registrando...' : 'Registrar'}
          </Button>
        </>
      }
    >
      <Field label="Cliente">
        <ClienteCombobox clientes={clientes} value={clientId} onChange={setClientId} tone="modal" />
      </Field>

      <div className="flex-row" style={{ gap: 10, alignItems: 'flex-start' }}>
        <Field className="flex-1" label="Como">
          <Select tone="modal" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {tiposContato.map((t) => (<option key={t} value={t}>{t}</option>))}
          </Select>
        </Field>
        <Field className="flex-1" label="Data">
          <Input tone="modal" type="date" value={data} onChange={(e) => setData(e.target.value)} required />
        </Field>
        <Field className="w-[110px]" label="Hora">
          <Input tone="modal" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
        </Field>
      </div>

      <Field label="Quem falou">
        {contatosDoCliente.length > 0 ? (
          <Select tone="modal" value={quem} onChange={(e) => setQuem(e.target.value)}>
            <option value="">— não informado —</option>
            {contatosDoCliente.map((c) => (
              <option key={c.id} value={c.nome}>{c.nome}{c.cargo ? ` (${c.cargo})` : ''}</option>
            ))}
            <option value="Outro">Outro (não cadastrado)</option>
          </Select>
        ) : (
          <Input tone="modal" value={quem} onChange={(e) => setQuem(e.target.value)} placeholder="Nome de quem entrou em contato" />
        )}
      </Field>

      <Field label="Monitor que atendeu">
        <Select tone="modal" value={monitor} onChange={(e) => setMonitor(e.target.value)}>
          <option value="">— nenhum —</option>
          {monitorOpcoes.map((m) => (<option key={m} value={m}>{m}</option>))}
        </Select>
      </Field>

      {servicoOpcoes.length > 0 && (
        <Field as="div" label="Sobre qual serviço">
          <div className="flex flex-wrap gap-2">
            {servicoOpcoes.map((s) => (
              <Chip variant="toggle" key={s} active={servicos.includes(s)} onClick={() => toggleServico(s)}>{s}</Chip>
            ))}
          </div>
        </Field>
      )}

      <Field label="O que ele procurou">
        <Textarea
          tone="modal"
          value={assunto}
          onChange={(e) => setAssunto(e.target.value)}
          rows={3}
          placeholder="Resumo em uma linha (ex.: dúvida na tabela de preços, pediu antecipar a reunião)"
        />
      </Field>
    </ModalShell>
  );
}
