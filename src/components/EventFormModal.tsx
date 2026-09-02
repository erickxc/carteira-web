import { useEffect, useState, type FormEvent } from 'react';
import { format, isValid, parse, setHours, setMinutes } from 'date-fns';
import { AlertTriangle, Ban, Bot, Check, FileText, Loader2 } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { gerarAta } from '../utils/ata';
import { registrarRemarcacao } from '../utils/reagendamento';
import { ehServicoDeReuniao } from '../utils/cadenciaServico';
import { gerarAtaPdf } from '../utils/ataPdf';
import {
  gerarAtaComIA, buscarCatalogoAlvos, buscarTagsClienteFinal,
  type CatalogoAlvosCliente, type TagClienteFinal,
} from '../api/client';
import { toastError, toastInfo, toastSuccess } from '../utils/toast';
import { confirmDialog } from '../utils/confirmDialog';
import { ModalShell } from './ModalShell';
import { ClienteCombobox } from './ClienteCombobox';
import { useRecorrencia } from './eventForm/useRecorrencia';
import { useChecklist } from './eventForm/useChecklist';
import { usePreAnalise } from './eventForm/usePreAnalise';
import { useProdutosSituacao } from './eventForm/useProdutosSituacao';
import { usePrecificacao } from './eventForm/usePrecificacao';
import { RecorrenciaFields } from './eventForm/RecorrenciaFields';
import { AnexosField } from './eventForm/AnexosField';
import { ProdutosSituacaoField } from './eventForm/ProdutosSituacaoField';
import { PrecificacaoField } from './eventForm/PrecificacaoField';
import { Badge, Button, Chip, Field, Input, SecaoLabel, Select, Textarea } from '../ui';
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
  const { clientes, agenda, criarEvento, atualizarEvento, enviarAnexoEvento, removerAnexoEvento, criarLembrete, criarAgendaSerie, opcoesPorTipo } = useCarteira();
  const tipoOpcoes = opcoesPorTipo('tipo_evento');
  const statusOpcoes = opcoesPorTipo('status_evento');
  // "Serviços tratados" de um evento é só Monitoria/Precificação — os outros
  // serviços do cadastro são informacionais (ver `ehServicoDeReuniao`).
  const servicoOpcoes = opcoesPorTipo('servico').filter(ehServicoDeReuniao);
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
  // Filtra também o que já estava GRAVADO: um serviço informacional marcado
  // antes desta regra ficaria invisível nos chips e seria regravado a cada
  // Salvar (mesma armadilha do monitor fora do cadastro).
  const [servicos, setServicos] = useState<string[]>((initial?.servicos ?? []).filter(ehServicoDeReuniao));
  const [sala, setSala] = useState(initial?.sala ?? '');
  // Contato/Ligação criados aqui são, por definição, iniciativa nossa (quem
  // registra é o monitor). Contato recebido do cliente entra pelo
  // RegistroContatoModal, que grava 'cliente'. Em edição, preserva o que já
  // estava gravado (inclusive vazio, nos eventos anteriores ao campo).
  const [origem, setOrigem] = useState<OrigemEvento | ''>(initial ? (initial.origem ?? '') : 'nos');
  const rec = useRecorrencia();
  const ck = useChecklist(initial?.checklist ?? []);
  const pa = usePreAnalise(initial?.preAnalise);
  const ps = useProdutosSituacao(initial?.produtosSituacao ?? []);
  const pc = usePrecificacao(initial?.precificacoes ?? []);
  const [ata, setAta] = useState(initial?.ata ?? '');
  const [resumo, setResumo] = useState(initial?.resumo ?? '');
  const [transcricao, setTranscricao] = useState(initial?.transcricao ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [gerandoAtaIA, setGerandoAtaIA] = useState(false);
  const [catalogoAlvos, setCatalogoAlvos] = useState<{ clientId: string; catalogo: CatalogoAlvosCliente | null } | null>(null);
  const [tagsClienteFinal, setTagsClienteFinal] = useState<TagClienteFinal[]>([]);

  const eventoAtual = initial ? agenda.find((a) => a.id === initial.id) : undefined;

  // Contato/Relatório/Precificação são interações leves — form enxuto, sem
  // toda a maquinaria de reunião (ata, checklist, pré-análise, resumo,
  // serviços, anexos...). Precificação = entrega avulsa nossa (fora de
  // reunião), mesmo espírito de Relatório. Match por palavra-chave porque
  // `type` vem de categorias editáveis (mesmo padrão de src/utils/badges.ts),
  // não igualdade exata.
  const modoSimples = /contato|relat[óo]rio|liga[çc]|precific/i.test(type);
  // Sala só faz sentido pra Reunião (não modoSimples, que já cobre o resto).
  const ehReuniao = /reuni/i.test(type);
  // Marcadores de produto/margem só no tipo avulso "Precificação" (registro
  // leve, sem ata/resumo) — decisão do usuário, não duplica no serviço
  // "Precificação" de dentro de uma Reunião.
  const ehPrecificacaoTipo = /precific/i.test(type);
  // Tabela "Produtos — Situação" só quando Monitoria está marcada como serviço
  // tratado numa Reunião — cliente segmentado (rede/grupo) ganha a coluna
  // extra "Cliente" (cada loja tem clientes finais próprios).
  const ehMonitoriaServico = !modoSimples && servicos.some((s) => /monitoria/i.test(s));
  // Catálogo de Dados Alvos (produtos/clientes finais) pro autocomplete do
  // Registro da Monitoria + tags compartilhadas do Ecossistema. NUNCA aquece o
  // cache aqui (`aquecer` fica de fora de propósito): pode custar ~20s em
  // arquivo grande. Com cache frio o backend devolve o ESPELHO persistido
  // (`alvos/catalogoSnapshot.cjs`), atualizado a cada reunião concluída/
  // cancelada — então a lista não desaparece por causa de cache.
  // Guarda o clientId junto do resultado: sem isso, trocar de cliente no
  // combobox deixaria a sugestão do cliente ANTERIOR na tela até a resposta
  // nova chegar (e limpar com setState síncrono dentro do efeito é justamente
  // o padrão que o lint do projeto proíbe).
  useEffect(() => {
    if (!clientId) return;
    buscarCatalogoAlvos(clientId)
      .then((c) => setCatalogoAlvos({ clientId, catalogo: c }))
      .catch(() => setCatalogoAlvos({ clientId, catalogo: null }));
  }, [clientId]);

  useEffect(() => {
    buscarTagsClienteFinal().then(setTagsClienteFinal).catch(() => setTagsClienteFinal([]));
  }, []);

  // Interação pontual (Contato/Ligação) — a única em que "quem procurou quem"
  // faz sentido. Relatório é entrega nossa; reunião é agendamento.
  const ehInteracao = /contato|liga[çc]/i.test(type);
  // Status "Reagendado" ou "Cancelado" exige informar o motivo — pedido do
  // usuário: o dossiê precisa poder dizer "já cancelou 2x por tal motivo", e
  // isso só existe se o motivo do cancelamento também for capturado (antes só
  // reagendamento pedia). `ehCancelamento` separa o texto do label/placeholder
  // do de reagendamento sem duplicar a checagem regex pelo componente inteiro.
  const ehCancelamento = /cancel/i.test(status);
  const precisaMotivo = /reagend|cancel/i.test(status);
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

  // Só as seções 2-4 (o que foi tratado/decisões/próximos passos) vêm da IA —
  // cabeçalho/participantes/pauta continuam montados por `gerarAta` sempre da
  // mesma forma determinística. Sobrescreve a ata direto (sem confirmação):
  // decisão do usuário, o campo continua editável depois.
  async function gerarAtaComIAHandler() {
    setGerandoAtaIA(true);
    try {
      const secoes = await gerarAtaComIA({
        clientId, subject, resumo, description, checklist: ck.checklist,
        produtosSituacao: ehMonitoriaServico ? ps.itens : [],
        transcricao,
      });
      const novaAta = gerarAta(
        {
          clientName: clienteSelecionado?.empresa ?? '',
          date: dataSegura.toISOString(),
          time, duracao, type, sala, monitores, subject, servicos,
          checklist: ck.checklist, resumo, description,
        },
        { cliente: clienteSelecionado },
        secoes
      );
      setAta(novaAta);

      // Grava na hora quando o evento já existe. Sem isso, gerar a ata
      // preenchia o campo na tela e PARECIA concluído, mas fechar o modal
      // jogava tudo fora em silêncio — inclusive a transcrição colada
      // (aconteceu de verdade: reunião da Gisalto de 01/09 ficou com a
      // ata-esqueleto e sem transcrição nenhuma no banco). Só estes três
      // campos: nada de status/data, que são decisão do usuário no Salvar.
      if (editando) {
        await atualizarEvento(initial.id, { ata: novaAta, resumo, transcricao });
        toastSuccess('Ata gerada e salva.');
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Falha ao gerar ata com IA.');
    } finally {
      setGerandoAtaIA(false);
    }
  }

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
    // Contato/Relatório podem ficar sem descrição — o display cai pro tipo (subject || type).
    if (!modoSimples && !subject.trim()) { toastError('Informe a descrição da reunião.'); return; }
    // Reunião sem serviço tratado marcado cai no fallback genérico "Reunião"
    // nos cards da Agenda (semana/mês) — obrigatório pra sempre saber o que foi tratado.
    if (ehReuniao && servicos.length === 0) { toastError('Marque ao menos um serviço tratado.'); return; }
    const statusFinalPre = statusOverride ?? status;
    if (/reagend/i.test(statusFinalPre) && !motivo.trim()) { toastError('Informe o motivo do reagendamento.'); return; }
    if (/cancel/i.test(statusFinalPre) && !motivo.trim()) { toastError('Informe o motivo do cancelamento.'); return; }
    // Bloqueia de verdade (não só avisa): mesmo monitor ou mesma sala não podem
    // ocupar o mesmo dia/horário duas vezes.
    if (conflitoMonitor) { toastError(`${nomeMonitorConflitante} já tem outro evento marcado nesse dia e horário.`); return; }
    if (conflitoSala) { toastError(`A sala "${sala}" já está ocupada nesse dia e horário.`); return; }
    const statusFinal = statusOverride ?? status;
    setSaving(true);
    try {
      const baseData = dataSegura;
      // Campos exclusivos de reunião são zerados nos tipos simples — antes iam
      // com o valor residual do state, então trocar Reunião→Contato gravava
      // serviços/resumo/duração/pré-análise que não pertencem ao registro
      // (mesmo tratamento que `sala` e `origem` já tinham).
      const comum = {
        clientId, clientName: cliente.empresa, subject, type, time,
        duracao: modoSimples ? undefined : (duracao || undefined),
        description,
        status: statusFinal,
        servicos: modoSimples ? [] : servicos,
        preAnalise: modoSimples ? undefined : pa.preAnalise,
        resumo: modoSimples ? '' : resumo,
        monitores,
        sala: ehReuniao ? (sala || undefined) : undefined,
        motivo: /reagend|cancel/i.test(statusFinal) ? motivo : undefined,
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
      // Um lembrete por antecedência marcada (permite mais de um: ex.: "1 dia
      // antes" + "1 hora antes" no mesmo evento — antes só dava pra marcar um).
      const OFFSET_MS: Record<string, number> = { '1h': 3600e3, '1d': 86400e3, '2d': 2 * 86400e3, '7d': 7 * 86400e3 };
      async function lembretesPara(evId: string, d: Date) {
        if (rec.lembretesOffsets.length === 0) return;
        const [h, m] = (time || '09:00').split(':').map(Number);
        const base = setMinutes(setHours(d, isNaN(h) ? 9 : h), isNaN(m) ? 0 : m);
        for (const offset of rec.lembretesOffsets) {
          const alvo = new Date(base.getTime() - OFFSET_MS[offset]);
          await criarLembrete({ title: `${type} — ${cliente!.empresa}${subject ? ': ' + subject : ''}`, type, datetime: alvo.toISOString(), clientId, eventId: evId, recurrence: 'none', description });
        }
      }
      const produtosSituacao = ehMonitoriaServico ? ps.itens : [];
      const precificacoes = ehPrecificacaoTipo ? pc.itens : [];
      if (editando) {
        const iso = baseData.toISOString();
        // Editar a data pelo formulário é tão remarcação quanto arrastar no
        // calendário — antes só o drag contava, então a mesma reunião
        // remarcada pela tela tinha `reagendamentos` divergente do real.
        await atualizarEvento(initial.id, {
          ...comum, date: iso, checklist: ck.checklist, ata: ataDe(iso, ck.checklist), produtosSituacao, precificacoes,
          ...registrarRemarcacao(initial, iso),
        });
      } else if (rec.recorrente) {
        // Salva só a REGRA — o servidor materializa o mês corrente na hora
        // (e os meses seguintes conforme chegam), em vez do form gerar aqui
        // até 744 eventos num laço sequencial de requisições.
        const regra = rec.montarRegra(baseData);
        if (!regra) { toastError('Configure a recorrência antes de salvar.'); return; }
        await criarAgendaSerie({
          clientId, clientName: cliente.empresa, subject, type, time,
          duracao: modoSimples ? undefined : (duracao || undefined),
          monitores,
          servicos: modoSimples ? [] : servicos,
          sala: ehReuniao ? (sala || undefined) : undefined,
          regra, lembretes: rec.lembretesOffsets,
          inicio: format(baseData, 'yyyy-MM-dd'),
        });
      } else {
        const iso = baseData.toISOString();
        const salvo = await criarEvento({ ...comum, date: iso, checklist: ck.checklist, ata: ataDe(iso, ck.checklist), produtosSituacao, precificacoes });
        await lembretesPara(salvo.id, baseData);
      }
      // Dossiê e catálogo NÃO são atualizados aqui: quem dispara é o backend, ao
      // gravar o evento (`server/ia/posEvento.cjs`), em segundo plano. Antes
      // isto era uma chamada síncrona daqui e o modal ficava travado em
      // "Atualizando dossiê..." esperando análise + leitura de xlsx.
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

  /**
   * "Cancelar evento" NÃO cancela direto: motivo é obrigatório no cancelamento
   * (o dossiê precisa poder dizer "cancelou 2x por tal motivo"), e este botão
   * gravava status Cancelado sem perguntar nada — o cancelamento entrava no
   * histórico sem justificativa (reportado pelo usuário). Agora ele coloca o
   * formulário em modo cancelamento: o campo Motivo aparece obrigatório (mesma
   * validação do Salvar), o usuário justifica e salva.
   */
  async function handleDelete() {
    if (!initial) return;
    if (!(await confirmDialog(
      'Cancelar este evento? Ele fica no histórico marcado como Cancelado (não é apagado) — você precisa informar o motivo.',
      { danger: true, confirmLabel: 'Sim, informar motivo', cancelLabel: 'Voltar' },
    ))) return;
    setStatus(statusCancelado);
    toastInfo('Informe o motivo do cancelamento e clique em Salvar.');
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
            <Button variant="danger" onClick={handleDelete} disabled={saving} style={{ marginRight: 'auto' }}>
              <Ban size={15} /> Cancelar evento
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="success" onClick={handleConcluir} disabled={saving || clientes.length === 0} title="Salvar marcando a reunião como concluída">
            <Check size={15} /> Concluir
          </Button>
          <Button type="submit" variant="primary" disabled={saving || clientes.length === 0}>
            {saving ? 'Salvando...' : rec.recorrente && !editando ? 'Salvar recorrência' : 'Salvar'}
          </Button>
        </>
      }
    >
            <div className="flex-row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <Field className="flex-1" labelSize="sm" label="Cliente">
                <ClienteCombobox clientes={clientes} value={clientId} onChange={setClientId} tone="modal" />
              </Field>

              {/* Tipo vem logo depois do Cliente porque é ele que define quanta
                  informação o formulário pede (Contato/Relatório são enxutos) —
                  antes ficava em 4º lugar, depois de campos que ele mesmo
                  esconde, e trocar o tipo fazia o formulário "pular". */}
              <Field className="w-[160px]" labelSize="sm" label="Tipo">
                <Select tone="modal" value={type} onChange={(e) => setType(e.target.value)}>
                  {tipoOpcoes.map((t) => (<option key={t} value={t}>{t}</option>))}
                </Select>
              </Field>
            </div>

            {/* Campo de texto principal do evento (`subject`), agora em todos os
                tipos. Antes, Reunião usava "Assunto" e os tipos simples usavam
                um segundo campo (`description`) rotulado "Observação" — duas
                caixas de texto para o mesmo papel. */}
            <Field label="Descrição">
              <Input
                tone="modal"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={modoSimples ? 'Ex.: Ligação para retomar contato' : 'Ex.: Revisão de precificação Q3'}
                required={!modoSimples}
              />
            </Field>

            {ehPrecificacaoTipo && <PrecificacaoField pc={pc} />}

            <div className="flex-row" style={{ gap: 10, alignItems: 'flex-start' }}>
              <Field className="flex-1" labelSize="sm" label="Data">
                <Input tone="modal" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </Field>
              <Field className="w-[100px]" labelSize="sm" label="Hora">
                <Input tone="modal" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </Field>
              {!modoSimples && (
                <Field className="w-[110px]" labelSize="sm" label="Duração">
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

            {ehInteracao && (
              <Field label="Quem procurou">
                <Select tone="modal" value={origem} onChange={(e) => setOrigem(e.target.value as OrigemEvento | '')}>
                  <option value="">— não informado —</option>
                  <option value="nos">{ORIGEM_LABEL.nos}</option>
                  <option value="cliente">{ORIGEM_LABEL.cliente}</option>
                </Select>
              </Field>
            )}

            <div className="flex-row" style={{ gap: 10, alignItems: 'flex-start' }}>
              {ehReuniao && (
                <Field className="flex-1" labelSize="sm" label="Sala">
                  <Select tone="modal" value={sala} onChange={(e) => setSala(e.target.value)}>
                    <option value="">— nenhuma —</option>
                    {salaOpcoes.map((s) => (<option key={s} value={s}>{s}</option>))}
                  </Select>
                </Field>
              )}

              <Field className="flex-1" labelSize="sm" label="Status">
                <Select tone="modal" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {statusOpcoes.map((s) => (<option key={s} value={s}>{s}</option>))}
                </Select>
              </Field>
            </div>

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

            {precisaMotivo && (
              <Field label={ehCancelamento ? 'Motivo do cancelamento *' : 'Motivo do reagendamento *'}>
                <Textarea
                  tone="modal"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={2}
                  placeholder={ehCancelamento ? 'Por que a reunião foi cancelada?' : 'Por que a reunião foi reagendada?'}
                />
              </Field>
            )}

            {/* Recorrência + lembrete automático (agora multi-seleção): mantido
                também no modo enxuto (follow-up do contato), só em criação. */}
            {!editando && <RecorrenciaFields rec={rec} baseData={dataValida ? dataSegura : null} />}

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

            {ehMonitoriaServico && (
              <ProdutosSituacaoField
                ps={ps}
                produtosDisponiveis={catalogoAlvos?.clientId === clientId ? (catalogoAlvos.catalogo?.produtos ?? []) : []}
                clientesDisponiveis={catalogoAlvos?.clientId === clientId ? (catalogoAlvos.catalogo?.clientes ?? []) : []}
                tags={tagsClienteFinal}
              />
            )}

            <SecaoLabel>Registro da reunião</SecaoLabel>

            <Field
              label={
                <>
                  Resumo{' '}
                  <span className="text-text-muted" style={{ fontSize: 12, textTransform: 'none', letterSpacing: 'normal' }}>
                    · o que foi tratado
                  </span>
                </>
              }
            >
              <Textarea tone="modal" value={resumo} onChange={(e) => setResumo(e.target.value)} rows={3} placeholder="Resumo do que foi tratado na reunião..." />
            </Field>

            {/* Transcrição bruta (colada de Otter/Fireflies/Gemini Notes ou
                digitada) — opcional, só alimenta o botão "Gerar ata com IA"
                abaixo; não entra em nenhum outro lugar (dossiê/relatório
                continuam lendo ata/resumo, não este campo). */}
            <Field
              label={
                <>
                  Transcrição{' '}
                  <span className="text-text-muted" style={{ fontSize: 12, textTransform: 'none', letterSpacing: 'normal' }}>
                    · opcional, usada pelo "Gerar ata com IA"
                  </span>
                </>
              }
            >
              <Textarea tone="modal" value={transcricao} onChange={(e) => setTranscricao(e.target.value)} rows={3} placeholder="Cole aqui a transcrição da reunião (Otter, Fireflies, Gemini Notes...), se houver." />
            </Field>

            {/* Ata: um só significado. O texto aqui É a ata; vazia, ela é gerada
                a partir de pauta/resumo ao salvar. Antes o rótulo dizia
                "observações, editável" e o placeholder dizia outra coisa, o que
                fazia o campo parecer um terceiro lugar para escrever texto. */}
            <Field as="div" label={
              <span className="flex-between" style={{ marginBottom: 2 }}>
                <span>Ata <span className="text-text-muted" style={{ fontSize: 12, textTransform: 'none', letterSpacing: 'normal' }}>· vazia = gerada da pauta e do resumo</span></span>
                <span className="flex-row" style={{ gap: 6 }}>
                  <Button variant="secondary" style={{ padding: '0.25rem 0.55rem', fontSize: 12 }} onClick={() => setAta(ataAuto)}>
                    Preencher com a automática
                  </Button>
                  <Button
                    variant="secondary"
                    style={{ padding: '0.25rem 0.55rem', fontSize: 12 }}
                    disabled={gerandoAtaIA}
                    onClick={() => void gerarAtaComIAHandler()}
                    title="A IA lê resumo, pauta, produtos/situação e a transcrição (se houver) e escreve o que foi tratado, decisões e próximos passos — substitui o texto da ata."
                  >
                    {gerandoAtaIA ? (<><Loader2 size={12} className="animate-spin" /> Gerando...</>) : (<><Bot size={12} /> Gerar ata com IA</>)}
                  </Button>
                </span>
              </span>
            }>
              <Textarea tone="modal" value={ata} onChange={(e) => setAta(e.target.value)} rows={4} placeholder="Deixe vazio para gerar automaticamente ao salvar, ou escreva a ata aqui." />
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

            {/* Campo antigo (`description`): saiu do formulário porque "Descrição"
                agora é um só. Continua aparecendo — e editável — nos eventos que
                já têm texto gravado nele, para não esconder o que alguém
                escreveu. Segue sendo lido pela timeline do cliente, busca
                global, relatórios e pela ata. */}
            {description.trim() && (
              <Field
                label={
                  <>
                    Observações{' '}
                    <span className="text-text-muted" style={{ fontSize: 12, textTransform: 'none', letterSpacing: 'normal' }}>
                      · registro antigo deste evento
                    </span>
                  </>
                }
              >
                <Textarea tone="modal" value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
            )}

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
