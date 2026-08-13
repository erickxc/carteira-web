import { useState, type FormEvent } from 'react';
import { format, isValid, parse, setHours, setMinutes, subDays, subHours } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { AlertTriangle, Ban, Check, FileText } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { gerarAta } from '../utils/ata';
import { gerarAtaPdf } from '../utils/ataPdf';
import { toastError } from '../utils/toast';
import { confirmDialog } from '../utils/confirmDialog';
import { ModalShell } from './ModalShell';
import { ClienteCombobox } from './ClienteCombobox';
import { useRecorrencia } from './eventForm/useRecorrencia';
import { useChecklist } from './eventForm/useChecklist';
import { usePreAnalise } from './eventForm/usePreAnalise';
import { RecorrenciaFields } from './eventForm/RecorrenciaFields';
import { ChecklistField } from './eventForm/ChecklistField';
import { PreAnaliseField } from './eventForm/PreAnaliseField';
import { AnexosField } from './eventForm/AnexosField';
import { Badge, Button, Chip, Field, Input, Select, Textarea } from '../ui';
import { ORIGEM_LABEL, type EventoAgenda, type OrigemEvento } from '../types';

interface EventFormModalProps {
  initial?: EventoAgenda;
  defaultDate?: Date;
  initialClientId?: string;
  /** Pré-seleciona o Tipo na criação (ex.: atalhos "Criar Relatório"/"Criar
   * Contato" do sidebar) — usuário ainda pode trocar. Ignorado em edição. */
  initialType?: string;
  /** Pré-preenche a Hora na criação (usado pelas sugestões de encaixe da
   *  Agenda, que propõem dia E horário). Ignorado em edição. */
  initialTime?: string;
  onClose: () => void;
  /** Fechar o loop: chamado quando a reunião é concluída e o usuário aceita
   *  agendar o próximo evento — o pai abre uma nova modal para o mesmo cliente. */
  onAgendarProximo?: (clientId: string) => void;
}

export function EventFormModal({ initial, defaultDate, initialClientId, initialType, initialTime, onClose, onAgendarProximo }: EventFormModalProps) {
  const { clientes, agenda, criarEvento, atualizarEvento, enviarAnexoEvento, removerAnexoEvento, criarLembrete, opcoesPorTipo } = useCarteira();
  const tipoOpcoes = opcoesPorTipo('tipo_evento');
  const statusOpcoes = opcoesPorTipo('status_evento');
  const servicoOpcoes = opcoesPorTipo('servico');
  const monitorOpcoes = opcoesPorTipo('monitor');
  const salaOpcoes = opcoesPorTipo('sala');
  const editando = !!initial;

  const [clientId, setClientId] = useState(initial?.clientId ?? initialClientId ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [type, setType] = useState(initial?.type ?? initialType ?? tipoOpcoes[0] ?? '');
  const [date, setDate] = useState(format(initial ? new Date(initial.date) : defaultDate ?? new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(initial?.time ?? initialTime ?? '');
  const [duracao, setDuracao] = useState<number>(initial?.duracao ?? 60);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [status, setStatus] = useState(initial?.status ?? statusOpcoes[0] ?? 'Agendado');
  const [motivo, setMotivo] = useState(initial?.motivo ?? '');
  // Default = monitor do cliente (o mais provável), editável. Múltipla
  // escolha: mais de um monitor pode estar presente na mesma reunião.
  const [monitores, setMonitores] = useState<string[]>(() => {
    if (initial?.monitores && initial.monitores.length > 0) return initial.monitores;
    const doCliente = clientes.find((c) => c.id === (initial?.clientId ?? initialClientId))?.monitor;
    return doCliente ? [doCliente] : [];
  });
  const toggleMonitor = (m: string) =>
    setMonitores((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  const [servicos, setServicos] = useState<string[]>(initial?.servicos ?? []);
  const [sala, setSala] = useState(initial?.sala ?? '');
  // Contato/Ligação criados aqui são, por definição, iniciativa nossa (quem
  // registra é o monitor). Contato recebido do cliente entra pelo
  // RegistroContatoModal, que grava 'cliente'. Em edição, preserva o que já
  // estava gravado (inclusive vazio, nos eventos anteriores ao campo).
  const [origem, setOrigem] = useState<OrigemEvento | ''>(initial ? (initial.origem ?? '') : 'nos');
  const rec = useRecorrencia();
  const ck = useChecklist(initial?.checklist ?? []);
  const pa = usePreAnalise(initial?.preAnalise);
  const [ata, setAta] = useState(initial?.ata ?? '');
  const [resumo, setResumo] = useState(initial?.resumo ?? '');
  const [lembreteAntes, setLembreteAntes] = useState<'none' | '1h' | '1d' | '2d' | '7d'>('none');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const eventoAtual = initial ? agenda.find((a) => a.id === initial.id) : undefined;

  // Contato/Relatório são interações leves — form enxuto, sem toda a maquinaria
  // de reunião (ata, checklist, pré-análise, resumo, serviços, anexos...).
  // Match por palavra-chave porque `type` vem de categorias editáveis (mesmo
  // padrão de src/utils/badges.ts), não igualdade exata.
  const modoSimples = /contato|relat[óo]rio|liga[çc]/i.test(type);
  // Sala só faz sentido pra Reunião (não modoSimples, que já cobre o resto).
  const ehReuniao = /reuni/i.test(type);
  // Interação pontual (Contato/Ligação) — a única em que "quem procurou quem"
  // faz sentido. Relatório é entrega nossa; reunião é agendamento.
  const ehInteracao = /contato|liga[çc]/i.test(type);
  // Status "Reagendado" exige informar o motivo do reagendamento.
  const precisaMotivo = /reagend/i.test(status);
  const naoOcupaHorario = (a: EventoAgenda) => /cancel|reagend/i.test(a.status || '');
  const mesmoDiaHora = (a: EventoAgenda) => Boolean(time) && dataValida && a.time === time && format(dataSegura, 'yyyy-MM-dd') === format(new Date(a.date), 'yyyy-MM-dd');

  const toggleServico = (s: string) =>
    setServicos((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  // Data segura: o <input type="date"> pode emitir um valor momentaneamente
  // inválido/incompleto enquanto o usuário digita os dígitos manualmente (varia
  // por navegador/SO). parse(...).toISOString() numa Data inválida lança
  // RangeError — como isso rodava direto no corpo do render, quebrava a tela
  // inteira. Aqui cai num fallback (hoje) em vez de estourar.
  const dataParseada = parse(date, 'yyyy-MM-dd', new Date());
  const dataValida = isValid(dataParseada);
  const dataSegura = dataValida ? dataParseada : new Date();

  // Ata automática (base para o botão "Gerar" e para preencher se vazia).
  // Passa o cliente no contexto: é dele que saem os participantes (contatos do
  // serviço tratado) no cabeçalho da ata.
  const clienteSelecionado = clientes.find((c) => c.id === clientId);
  const ataAuto = gerarAta(
    {
      clientName: clienteSelecionado?.empresa ?? '',
      date: dataSegura.toISOString(),
      time, duracao, type, sala, monitores, subject, servicos,
      checklist: ck.checklist, resumo, description,
    },
    { cliente: clienteSelecionado }
  );

  // Conflito de MONITOR: só Reunião ocupa horário de fato (é a única que trava
  // a agenda do monitor) — Contato/Relatório/Ligação são registros rápidos e
  // podem coexistir com qualquer outra coisa no mesmo dia/hora, inclusive entre
  // si. Por isso o conflito só existe quando AMBOS os lados são Reunião. Com
  // múltiplos monitores, conflita se QUALQUER monitor em comum já está ocupado.
  const monitorConflitante = ehReuniao && monitores.length > 0
    ? agenda.find((a) =>
        a.id !== initial?.id && /reuni/i.test(a.type) && !naoOcupaHorario(a) && mesmoDiaHora(a)
        && (a.monitores ?? []).some((m) => monitores.includes(m))
      )
    : undefined;
  const conflitoMonitor = Boolean(monitorConflitante);
  const nomeMonitorConflitante = monitorConflitante
    ? (monitorConflitante.monitores ?? []).find((m) => monitores.includes(m))
    : undefined;
  // Conflito de SALA: a mesma sala não pode ter 2 reuniões no mesmo dia/horário
  // (recurso físico único), independente do monitor.
  const conflitoSala = ehReuniao && Boolean(sala) && agenda.some((a) =>
    a.id !== initial?.id && a.sala === sala && !naoOcupaHorario(a) && mesmoDiaHora(a)
  );

  const statusConcluido = statusOpcoes.find((s) => /conclu|realiz/i.test(s)) ?? 'Concluído';
  const statusCancelado = statusOpcoes.find((s) => /cancel/i.test(s)) ?? 'Cancelado';

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void salvar();
  }
  function handleConcluir() {
    setStatus(statusConcluido);
    void salvar(statusConcluido);
  }

  async function salvar(statusOverride?: string) {
    const cliente = clientes.find((c) => c.id === clientId);
    if (!cliente) { toastError('Selecione um cliente.'); return; }
    if (!dataValida) { toastError('Data inválida — confira o dia informado.'); return; }
    // Contato/Relatório não têm assunto — o display cai pro tipo (subject || type).
    if (!modoSimples && !subject.trim()) { toastError('Informe o assunto da reunião.'); return; }
    // Reunião sem serviço tratado marcado cai no fallback genérico "Reunião"
    // nos cards da Agenda (semana/mês) — obrigatório pra sempre saber o que foi tratado.
    if (ehReuniao && servicos.length === 0) { toastError('Marque ao menos um serviço tratado.'); return; }
    const statusFinalPre = statusOverride ?? status;
    if (/reagend/i.test(statusFinalPre) && !motivo.trim()) { toastError('Informe o motivo do reagendamento.'); return; }
    // Bloqueia de verdade (não só avisa): mesmo monitor ou mesma sala não podem
    // ocupar o mesmo dia/horário duas vezes.
    if (conflitoMonitor) { toastError(`${nomeMonitorConflitante} já tem outro evento marcado nesse dia e horário.`); return; }
    if (conflitoSala) { toastError(`A sala "${sala}" já está ocupada nesse dia e horário.`); return; }
    const statusFinal = statusOverride ?? status;
    setSaving(true);
    try {
      const baseData = dataSegura;
      const comum = {
        clientId, clientName: cliente.empresa, subject, type, time,
        duracao: duracao || undefined, description, status: statusFinal, servicos, preAnalise: pa.preAnalise, resumo,
        monitores,
        sala: ehReuniao ? (sala || undefined) : undefined,
        motivo: /reagend/i.test(statusFinal) ? motivo : undefined,
        // Só faz sentido em interação pontual (Contato/Ligação): reunião e
        // relatório não são "quem procurou quem".
        origem: ehInteracao ? (origem || undefined) : undefined,
      };
      // Contato/Relatório não têm ata. Fora isso: ata manual tem prioridade;
      // se vazia, gera automaticamente.
      const ataDe = (iso: string, cl: EventoAgenda['checklist']) =>
        modoSimples ? '' : (ata.trim() ? ata : gerarAta(
          {
            clientName: cliente.empresa, date: iso, time, duracao, type, sala, monitores, subject, servicos,
            checklist: cl, resumo, description,
          },
          { cliente }
        ));
      async function lembretePara(evId: string, d: Date) {
        if (lembreteAntes === 'none') return;
        const [h, m] = (time || '09:00').split(':').map(Number);
        let alvo = setMinutes(setHours(d, isNaN(h) ? 9 : h), isNaN(m) ? 0 : m);
        if (lembreteAntes === '1h') alvo = subHours(alvo, 1);
        else if (lembreteAntes === '1d') alvo = subDays(alvo, 1);
        else if (lembreteAntes === '2d') alvo = subDays(alvo, 2);
        else if (lembreteAntes === '7d') alvo = subDays(alvo, 7);
        await criarLembrete({ title: `${type} — ${cliente!.empresa}${subject ? ': ' + subject : ''}`, type, datetime: alvo.toISOString(), clientId, eventId: evId, recurrence: 'none', description });
      }
      if (editando) {
        const iso = baseData.toISOString();
        await atualizarEvento(initial.id, { ...comum, date: iso, checklist: ck.checklist, ata: ataDe(iso, ck.checklist) });
      } else if (rec.recorrente) {
        const serie = uuidv4();
        for (const d of rec.gerarDatas(baseData)) {
          const cl = ck.checklist.map((i) => ({ id: uuidv4(), text: i.text, done: false }));
          const iso = d.toISOString();
          const salvo = await criarEvento({ ...comum, date: iso, serie, checklist: cl, ata: ataDe(iso, cl) });
          await lembretePara(salvo.id, d);
        }
      } else {
        const iso = baseData.toISOString();
        const salvo = await criarEvento({ ...comum, date: iso, checklist: ck.checklist, ata: ataDe(iso, ck.checklist) });
        await lembretePara(salvo.id, baseData);
      }
      // Fechar o loop: virou concluída agora (não estava concluída antes) → oferece
      // agendar o próximo evento pro mesmo cliente.
      const virouConcluido = /conclu|realiz/i.test(statusFinal) && !/conclu|realiz/i.test(initial?.status || '');
      if (virouConcluido && onAgendarProximo && await confirmDialog(`Reunião concluída. Deseja agendar o próximo evento para ${cliente.empresa}?`, { confirmLabel: 'Agendar próximo' })) {
        onAgendarProximo(clientId);
        return; // o pai abre uma nova modal (limpa); não fecha aqui
      }
      onClose();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao salvar o evento.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial) return;
    // Soft delete: em vez de apagar, marca como Cancelado (preserva o histórico).
    if (!(await confirmDialog('Cancelar este evento? Ele fica no histórico marcado como Cancelado (não é apagado).', { danger: true, confirmLabel: 'Sim, cancelar', cancelLabel: 'Voltar' }))) return;
    await atualizarEvento(initial.id, { status: statusCancelado });
    onClose();
  }

  async function handleFilesSelected(files: FileList | null) {
    if (!initial || !files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) await enviarAnexoEvento(initial.id, file);
    } finally {
      setUploading(false);
    }
  }

  return (
    <ModalShell
      title={`${editando ? 'Editar' : 'Novo'} ${modoSimples ? type : 'Evento'}`}
      onClose={onClose}
      onSubmit={handleSubmit}
      size="lg"
      footer={
        <>
          {editando && (
            <Button variant="danger" onClick={handleDelete} style={{ marginRight: 'auto' }}>
              <Ban size={15} /> Cancelar evento
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="success" onClick={handleConcluir} disabled={saving || clientes.length === 0} title="Salvar marcando a reunião como concluída">
            <Check size={15} /> Concluir
          </Button>
          <Button type="submit" variant="primary" disabled={saving || clientes.length === 0}>
            {saving ? 'Salvando...' : rec.recorrente && !editando && rec.qtdeEventos > 1 ? `Criar ${rec.qtdeEventos} eventos` : 'Salvar'}
          </Button>
        </>
      }
    >
            <Field label="Cliente">
              <ClienteCombobox clientes={clientes} value={clientId} onChange={setClientId} tone="modal" />
            </Field>

            <Field as="div" label="Monitor(es)">
              {monitorOpcoes.length === 0 ? (
                <p className="text-text-muted" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 'normal' }}>Nenhum monitor cadastrado — adicione em Configurações.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {monitorOpcoes.map((m) => (
                    <Chip variant="toggle" key={m} active={monitores.includes(m)} onClick={() => toggleMonitor(m)}>{m}</Chip>
                  ))}
                </div>
              )}
            </Field>

            {!modoSimples && (
              <Field label="Assunto">
                <Input tone="modal" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex.: Revisão de precificação Q3" required />
              </Field>
            )}

            <Field label="Tipo">
              <Select tone="modal" value={type} onChange={(e) => setType(e.target.value)}>
                {tipoOpcoes.map((t) => (<option key={t} value={t}>{t}</option>))}
              </Select>
            </Field>

            <div className="flex-row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <Field className="flex-1" label="Data">
                <Input tone="modal" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </Field>
              <Field className="w-[110px]" label="Hora">
                <Input tone="modal" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </Field>
              {!modoSimples && (
                <Field className="w-[120px]" label="Duração">
                  <Select tone="modal" value={duracao} onChange={(e) => setDuracao(Number(e.target.value))}>
                    <option value={0}>—</option>
                    <option value={30}>30 min</option>
                    <option value={60}>1h</option>
                    <option value={90}>1h30</option>
                    <option value={120}>2h</option>
                  </Select>
                </Field>
              )}
            </div>

            {ehInteracao && (
              <Field label="Quem procurou">
                <Select tone="modal" value={origem} onChange={(e) => setOrigem(e.target.value as OrigemEvento | '')}>
                  <option value="">— não informado —</option>
                  <option value="nos">{ORIGEM_LABEL.nos}</option>
                  <option value="cliente">{ORIGEM_LABEL.cliente}</option>
                </Select>
              </Field>
            )}

            {ehReuniao && (
              <Field label="Sala">
                <Select tone="modal" value={sala} onChange={(e) => setSala(e.target.value)}>
                  <option value="">— nenhuma —</option>
                  {salaOpcoes.map((s) => (<option key={s} value={s}>{s}</option>))}
                </Select>
              </Field>
            )}

            {conflitoMonitor && (
              <Badge variant="danger" style={{ marginBottom: 8 }}>
                <AlertTriangle size={12} /> {nomeMonitorConflitante} já tem outro evento nesse dia e horário — não vai dar pra salvar.
              </Badge>
            )}
            {conflitoSala && (
              <Badge variant="danger" style={{ marginBottom: 12 }}>
                <AlertTriangle size={12} /> Sala "{sala}" já ocupada nesse dia e horário — não vai dar pra salvar.
              </Badge>
            )}

            <Field label="Status">
              <Select tone="modal" value={status} onChange={(e) => setStatus(e.target.value)}>
                {statusOpcoes.map((s) => (<option key={s} value={s}>{s}</option>))}
              </Select>
            </Field>

            {precisaMotivo && (
              <Field label="Motivo do reagendamento *">
                <Textarea tone="modal" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Por que a reunião foi reagendada?" />
              </Field>
            )}

            {!editando && <RecorrenciaFields rec={rec} />}

            {/* Lembrete: mantido também no modo enxuto (follow-up do contato), só em criação */}
            {!editando && (
              <Field label="Lembrete automático">
                <Select tone="modal" value={lembreteAntes} onChange={(e) => setLembreteAntes(e.target.value as typeof lembreteAntes)}>
                  <option value="none">Sem lembrete</option>
                  <option value="1h">1 hora antes</option>
                  <option value="1d">1 dia antes</option>
                  <option value="2d">2 dias antes</option>
                  <option value="7d">1 semana antes</option>
                </Select>
              </Field>
            )}

            {!modoSimples && (<>
            <Field as="div" label="Serviços tratados">
              {servicoOpcoes.length === 0 ? (
                <p className="text-text-muted" style={{ fontSize: 13, textTransform: 'none', letterSpacing: 'normal' }}>Nenhum serviço cadastrado — adicione em Configurações.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {servicoOpcoes.map((s) => (
                    <Chip variant="toggle" key={s} active={servicos.includes(s)} onClick={() => toggleServico(s)}>{s}</Chip>
                  ))}
                </div>
              )}
            </Field>

            <ChecklistField ck={ck} />

            {editando && <PreAnaliseField pa={pa} />}

            <Field label="Resumo da Reunião">
              <Textarea tone="modal" value={resumo} onChange={(e) => setResumo(e.target.value)} rows={3} placeholder="Resumo do que foi tratado na reunião..." />
            </Field>

            <Field as="div" label={
              <span className="flex-between" style={{ marginBottom: 2 }}>
                <span>Ata <span className="text-text-muted" style={{ fontSize: 12, textTransform: 'none', letterSpacing: 'normal' }}>· observações, editável</span></span>
                <Button variant="secondary" style={{ padding: '0.25rem 0.55rem', fontSize: 12 }} onClick={() => setAta(ataAuto)}>
                  Preencher automático
                </Button>
              </span>
            }>
              <Textarea tone="modal" value={ata} onChange={(e) => setAta(e.target.value)} rows={4} placeholder="Observações da reunião (entram na ata em PDF). Vazia = gera automática ao salvar." />
              <Button
                variant="primary"
                style={{ marginTop: 8, alignSelf: 'flex-start' }}
                onClick={() => {
                  if (!dataValida) { toastError('Data inválida — confira o dia informado.'); return; }
                  gerarAtaPdf(
                    {
                      clientName: clienteSelecionado?.empresa ?? '',
                      date: dataSegura.toISOString(),
                      time, duracao, type, status, subject, servicos, sala, monitores,
                      checklist: ck.checklist, preAnalise: pa.preAnalise, resumo,
                      ata: ata.trim() ? ata : ataAuto,
                      description,
                    },
                    { cliente: clienteSelecionado }
                  );
                }}
              >
                <FileText size={15} /> Gerar Ata (PDF)
              </Button>
            </Field>
            </>)}

            <Field label={modoSimples ? 'Observação' : 'Descrição'}>
              <Textarea tone="modal" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={modoSimples ? 'O que foi tratado no contato...' : undefined} />
            </Field>

            {!modoSimples && (
              <AnexosField
                editando={editando}
                attachments={eventoAtual?.attachments ?? []}
                uploading={uploading}
                onRemove={(anexo) => initial && removerAnexoEvento(initial.id, anexo)}
                onFilesSelected={handleFilesSelected}
              />
            )}
    </ModalShell>
  );
}
