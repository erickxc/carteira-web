import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { addDays, parseISO, subDays } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { ArrowLeft, Bell as BellIcon, CalendarPlus, FileSpreadsheet, NotebookPen, PhoneIncoming, Save, Trash2, Users } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { confirmDialog } from '../utils/confirmDialog';
import { contatosVisiveis, servicosSemResponsavel } from '../utils/contatos';
import { CadastroCliente } from '../components/cliente/CadastroCliente';
import { EventFormModal } from '../components/EventFormModal';
import { ReminderFormModal } from '../components/ReminderFormModal';
import { RegistroContatoModal } from '../components/RegistroContatoModal';
import { WhatsAppMensagemModal } from '../components/WhatsAppMensagemModal';
import { ContatosCard } from '../components/cliente/ContatosCard';
import { TimelineCard } from '../components/cliente/TimelineCard';
import { AnaliseIACard } from '../components/cliente/AnaliseIACard';
import { AgilTarefasCard } from '../components/cliente/AgilTarefasCard';
import { RelatoriosClienteModal } from '../components/cliente/RelatoriosClienteModal';
import { AcessosExternosButton } from '../components/cliente/AcessosExternosButton';
import { agruparLembretes, type TimelineFiltro, type TimelineItem } from '../utils/timelineCliente';
import { usePersistedState } from '../hooks/usePersistedState';
import { ModalShell } from '../components/ModalShell';
import { Badge, Button, Card, Textarea } from '../ui';
import type { Contato, EventoAgenda } from '../types';
import { buscarCatalogoAlvos } from '../api/client';
import { comPrecificacaoDoGrupo } from '../utils/cadenciaServico';

export default function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const voltar = (location.state as { from?: string; fromLabel?: string } | null) ?? null;
  const backTo = voltar?.from ?? '/clientes';
  const backLabel = voltar?.fromLabel ?? 'Carteira';
  const { clientes, agenda, lembretes, removerCliente, atualizarCliente, opcoesPorTipo } = useCarteira();
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [eventoEditando, setEventoEditando] = useState<EventoAgenda | null>(null);
  const [eventoKey, setEventoKey] = useState(0); // muda p/ remontar a modal limpa (fechar o loop)
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [registroContatoOpen, setRegistroContatoOpen] = useState(false);
  const [contatosOpen, setContatosOpen] = useState(false);
  const [anotacoesOpen, setAnotacoesOpen] = useState(false);
  const [relatoriosOpen, setRelatoriosOpen] = useState(false);

  // Memoizado: sem isso, `cliente` é recalculado (nova referência) a cada
  // render, e o compilador do React não consegue provar que memos que dependem
  // de `cliente?.algumCampo` (ex.: lojasDoGrupo) são estáveis.
  const cliente = useMemo(() => clientes.find((c) => c.id === id), [clientes, id]);

  /**
   * Aquece o cache dos Dados Alvos deste cliente ao abrir a ficha —
   * silenciosamente, sem bloquear nada na tela. É o único lugar do app onde
   * vale pagar o custo de ler o xlsx (até ~20s em arquivo grande): faz isso
   * ANTES do monitor abrir o formulário de reunião, cujo seletor de
   * produto/cliente nunca aquece por conta própria (ver server/alvos/consulta.cjs).
   * Resultado descartado de propósito — só o efeito colateral (cache gravado
   * em disco) importa aqui.
   */
  useEffect(() => {
    if (!id) return;
    buscarCatalogoAlvos(id, true).catch(() => { /* integração opcional — falha aqui não afeta a ficha */ });
  }, [id]);

  const [observacao, setObservacao] = useState(cliente?.observacao ?? '');
  const [salvandoObs, setSalvandoObs] = useState(false);

  const [contatoNome, setContatoNome] = useState('');
  const [contatoCargo, setContatoCargo] = useState('');
  const [contatoTelefone, setContatoTelefone] = useState('');
  const [contatoServicos, setContatoServicos] = useState<string[]>([]);
  const [contatoDoGrupo, setContatoDoGrupo] = useState(false);
  const [waContato, setWaContato] = useState<Contato | null>(null);

  // Inclui os contatos herdados de outras lojas do mesmo grupo (escopo 'grupo').
  const contatos = useMemo(() => contatosVisiveis(cliente, clientes), [cliente, clientes]);
  /** Só os gravados NESTE cliente — é o que pode ser editado/removido aqui. */
  const contatosProprios = useMemo(() => cliente?.contatos ?? [], [cliente]);
  const servicoOpcoes = opcoesPorTipo('servico');

  // Cobertura considera também os contatos do grupo: se a pessoa que cuida de
  // Precificação está cadastrada na loja irmã, este serviço não está descoberto.
  const servicosSemContato = useMemo(() => servicosSemResponsavel(cliente, contatos), [cliente, contatos]);

  const historico = useMemo(
    // Inclui a precificação do grupo salva numa loja-irmã (`doGrupo`).
    () => comPrecificacaoDoGrupo(agenda, clientes).filter((a) => a.clientId === id).sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime()),
    [agenda, clientes, id]
  );

  // Linha do tempo unificada: antes o histórico mostrava só eventos de agenda,
  // e os lembretes do cliente ficavam invisíveis aqui — quem abria a tela antes
  // de falar com o cliente tinha que cruzar duas telas pra saber o que já houve.
  const [filtroTimeline, setFiltroTimeline] = usePersistedState<TimelineFiltro>('filtro:cliente:timeline', 'tudo');
  // Janela padrão da linha do tempo: sem limite, um cliente com reunião
  // recorrente marcada até o fim do ano (ou um histórico de anos) enchia a
  // tela de itens distantes, empurrando o que aconteceu/vai acontecer de
  // verdade pra baixo. 30 dias passados cobre "o que já rolou recentemente";
  // 15 à frente é suficiente pra ver a PRÓXIMA reunião marcada sem mostrar
  // toda uma série recorrente futura. "Expandir" mostra tudo sob pedido.
  const [timelineExpandida, setTimelineExpandida] = useState(false);
  const JANELA_TIMELINE_DIAS_PASSADO = 30;
  const JANELA_TIMELINE_DIAS_FUTURO = 10;

  const timelineCompleta = useMemo(() => {
    const itens: TimelineItem[] = historico.map((ev) => ({
      kind: 'evento',
      id: ev.id,
      quando: parseISO(ev.date),
      evento: ev,
    }));
    lembretes
      .filter((l) => l.clientId === id)
      .forEach((l) => {
        const d = parseISO(l.datetime);
        if (!isNaN(d.getTime())) itens.push({ kind: 'lembrete', id: l.id, quando: d, lembrete: l });
      });
    return itens
      .filter((i) => {
        if (filtroTimeline === 'tudo') return true;
        if (i.kind === 'lembrete') return filtroTimeline === 'lembretes';
        const t = i.evento.type || '';
        if (filtroTimeline === 'reunioes') return /reuni/i.test(t);
        if (filtroTimeline === 'contatos') return /contato|liga[çc]/i.test(t);
        if (filtroTimeline === 'relatorios') return /relat/i.test(t);
        return true;
      })
      .sort((a, b) => b.quando.getTime() - a.quando.getTime());
  }, [historico, lembretes, id, filtroTimeline]);

  const timelineNaJanela = useMemo(() => {
    if (timelineExpandida) return timelineCompleta;
    const agora = new Date();
    const limiteInicio = subDays(agora, JANELA_TIMELINE_DIAS_PASSADO);
    const limiteFim = addDays(agora, JANELA_TIMELINE_DIAS_FUTURO);
    return timelineCompleta.filter((i) => i.quando >= limiteInicio && i.quando <= limiteFim);
  }, [timelineCompleta, timelineExpandida]);

  // Conta antes de agrupar: lembrete que entrou no card do evento não está oculto.
  const timelineOcultos = timelineCompleta.length - timelineNaJanela.length;
  // Agrupa só o que sobrou da janela: reunião fora dela com lembrete dentro (ex.:
  // reunião daqui a 12 dias, lembrete daqui a 5) levaria o lembrete junto e ele sumiria.
  const timeline = useMemo(() => agruparLembretes(timelineNaJanela), [timelineNaJanela]);

  // Lojas do mesmo grupo (rede) — cada loja é um cliente próprio.
  const lojasDoGrupo = useMemo(() => {
    if (!cliente?.grupo) return [];
    return clientes.filter((c) => c.grupo === cliente.grupo).sort((a, b) => a.empresa.localeCompare(b.empresa));
  }, [clientes, cliente]);

  if (!cliente) {
    return (
      <div className="page-container">
        <Button variant="secondary" onClick={() => navigate(backTo)}>
          <ArrowLeft size={15} /> Voltar
        </Button>
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

  async function adicionarContato() {
    if (!id || !contatoNome.trim()) return;
    const novo: Contato = {
      id: uuidv4(),
      nome: contatoNome.trim(),
      cargo: contatoCargo.trim(),
      telefone: contatoTelefone.trim(),
      servicos: contatoServicos,
      escopo: contatoDoGrupo ? 'grupo' : 'loja',
    };
    // Grava sempre nos contatos DESTE cliente (não em `contatos`, que também
    // traz os herdados do grupo — salvar aquela lista duplicaria os herdados
    // dentro desta loja).
    await atualizarCliente(id, { contatos: [...contatosProprios, novo] });
    setContatoNome('');
    setContatoCargo('');
    setContatoTelefone('');
    setContatoServicos([]);
    setContatoDoGrupo(false);
  }

  /** Alterna o escopo (loja x grupo) de um contato gravado neste cliente. */
  async function alternarEscopo(contatoId: string) {
    if (!id) return;
    await atualizarCliente(id, {
      contatos: contatosProprios.map((c) =>
        c.id === contatoId ? { ...c, escopo: c.escopo === 'grupo' ? 'loja' : 'grupo' } : c
      ),
    });
  }

  function toggleContatoServico(s: string) {
    setContatoServicos((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  async function removerContato(contatoId: string) {
    if (!id) return;
    const contato = contatosProprios.find((c) => c.id === contatoId);
    if (!(await confirmDialog(`Remover o contato "${contato?.nome ?? ''}"?`, { danger: true, confirmLabel: 'Remover' }))) return;
    await atualizarCliente(id, { contatos: contatosProprios.filter((c) => c.id !== contatoId) });
  }

  async function handleExcluir() {
    if (!id) return;
    // Seguro: o guard `if (!cliente) return` acima já garante isto no momento do render.
    const ok = await confirmDialog(`Excluir o cliente "${cliente!.empresa}"? Isso também remove os eventos de agenda vinculados.`, { danger: true, confirmLabel: 'Excluir' });
    if (!ok) return;
    await removerCliente(id);
    navigate('/clientes');
  }

  return (
    <div className="page-container">
      <Button variant="secondary" onClick={() => navigate(backTo)} style={{ marginBottom: 20 }}>
        <ArrowLeft size={15} /> Voltar para {backLabel}
      </Button>

      <Card style={{ marginBottom: 16 }}>
        <div className="flex-between" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: 4 }}>{cliente.empresa}</h1>
            {cliente.grupo && <span className="text-text-muted" style={{ fontSize: 13 }}>Rede {cliente.grupo}</span>}
          </div>
          <div className="flex-row">
            <AcessosExternosButton cliente={cliente} />
            <Button variant="danger" onClick={handleExcluir}>
              <Trash2 size={15} /> Excluir
            </Button>
          </div>
        </div>
      </Card>

      <div className="dash-two-col">
        <AnaliseIACard clienteId={cliente.id} />
        <AgilTarefasCard cliente={cliente} />
      </div>

      {/* Cadastro editável na própria ficha (1.6.11) — sem lápis nem modal. */}
      <CadastroCliente key={cliente.id} cliente={cliente} />

      <div className="flex-row" style={{ marginBottom: 24 }}>
        <Button variant="primary" onClick={() => setEventModalOpen(true)}>
          <CalendarPlus size={15} /> Novo Evento
        </Button>
        <Button variant="secondary" onClick={() => setReminderModalOpen(true)}>
          <BellIcon size={15} /> Novo Lembrete
        </Button>
        <Button variant="secondary" onClick={() => setRegistroContatoOpen(true)} title="Registrar que o cliente entrou em contato">
          <PhoneIncoming size={15} /> Cliente entrou em contato
        </Button>
        <Button variant="secondary" onClick={() => setContatosOpen(true)}>
          <Users size={15} /> Contatos {contatos.length > 0 && `(${contatos.length})`}
        </Button>
        <Button variant="secondary" onClick={() => setRelatoriosOpen(true)} title="Relatórios deste cliente (prévia + exportar Excel)">
          <FileSpreadsheet size={15} /> Relatórios
        </Button>
        <Button variant="secondary" onClick={() => setAnotacoesOpen(true)}>
          <NotebookPen size={15} /> Anotações
        </Button>
      </div>

      {contatosOpen && (
        <ContatosCard
          onClose={() => setContatosOpen(false)}
          cliente={cliente}
          contatos={contatos}
          servicosSemContato={servicosSemContato}
          servicoOpcoes={servicoOpcoes}
          onWhatsApp={setWaContato}
          onAlternarEscopo={alternarEscopo}
          onRemover={removerContato}
          onIrParaOrigem={(clienteId) => navigate(`/clientes/${clienteId}`, { state: { from: location.pathname, fromLabel: cliente.empresa } })}
          contatoNome={contatoNome}
          setContatoNome={setContatoNome}
          contatoCargo={contatoCargo}
          setContatoCargo={setContatoCargo}
          contatoTelefone={contatoTelefone}
          setContatoTelefone={setContatoTelefone}
          contatoServicos={contatoServicos}
          onToggleServico={toggleContatoServico}
          contatoDoGrupo={contatoDoGrupo}
          setContatoDoGrupo={setContatoDoGrupo}
          onAdicionar={adicionarContato}
        />
      )}

      {cliente.grupo && lojasDoGrupo.length > 1 && (
        <Card flat style={{ marginBottom: 24 }}>
          <div className="section-header">
            <h3>Lojas do grupo <span className="text-text-muted" style={{ fontWeight: 400, fontSize: 13 }}>· {cliente.grupo}</span></h3>
            <span className="text-text-muted" style={{ fontSize: 12 }}>{lojasDoGrupo.length}</span>
          </div>
          <div className="flex-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {lojasDoGrupo.map((l) => (
              l.id === cliente.id ? (
                <Badge key={l.id} variant="accent" style={{ cursor: 'default' }}>
                  {l.empresa.replace(`${cliente.grupo} - `, '') || l.empresa}
                </Badge>
              ) : (
                <Badge as={Link} key={l.id} variant="muted" to={`/clientes/${l.id}`} style={{ cursor: 'pointer' }}>
                  {l.empresa.replace(`${cliente.grupo} - `, '') || l.empresa}
                </Badge>
              )
            ))}
          </div>
        </Card>
      )}

      <TimelineCard
        cliente={cliente}
        timeline={timeline}
        filtro={filtroTimeline}
        onFiltroChange={setFiltroTimeline}
        onEditarEvento={(ev) => setEventoEditando(ev.doGrupo ? agenda.find((a) => a.id === ev.doGrupo!.origemId) ?? null : ev)}
        expandida={timelineExpandida}
        onToggleExpandir={() => setTimelineExpandida((v) => !v)}
        totalOcultos={timelineOcultos}
        janelaDiasPassado={JANELA_TIMELINE_DIAS_PASSADO}
        janelaDiasFuturo={JANELA_TIMELINE_DIAS_FUTURO}
      />

      {relatoriosOpen && (
        <RelatoriosClienteModal cliente={cliente} onClose={() => setRelatoriosOpen(false)} />
      )}

      {anotacoesOpen && (
        <ModalShell
          title="Anotações"
          onClose={() => setAnotacoesOpen(false)}
          onSubmit={(e) => e.preventDefault()}
          footer={
            <>
              <Button variant="secondary" onClick={() => setAnotacoesOpen(false)}>Fechar</Button>
              <Button variant="primary" onClick={salvarObservacao} disabled={salvandoObs || !obsMudou}>
                <Save size={14} /> {salvandoObs ? 'Salvando...' : 'Salvar anotação'}
              </Button>
            </>
          }
        >
          <Textarea
            tone="modal"
            placeholder="Anotações sobre este cliente..."
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            style={{ minHeight: 220 }}
          />
        </ModalShell>
      )}

      {eventoEditando && <EventFormModal initial={eventoEditando} onClose={() => setEventoEditando(null)} />}
      {eventModalOpen && (
        <EventFormModal
          key={eventoKey}
          initialClientId={cliente.id}
          onClose={() => setEventModalOpen(false)}
          onAgendarProximo={() => setEventoKey((k) => k + 1)}
        />
      )}
      {reminderModalOpen && <ReminderFormModal initialClientId={cliente.id} onClose={() => setReminderModalOpen(false)} />}
      {registroContatoOpen && <RegistroContatoModal clienteId={cliente.id} onClose={() => setRegistroContatoOpen(false)} />}
      {waContato && <WhatsAppMensagemModal contato={waContato} empresa={cliente.empresa} onClose={() => setWaContato(null)} />}
    </div>
  );
}
