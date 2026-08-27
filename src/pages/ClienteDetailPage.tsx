import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { parseISO } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { ArrowLeft, Bell as BellIcon, CalendarPlus, Pencil, PhoneIncoming, Save, Trash2 } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { clienteStatusBadge, isGratuidade } from '../utils/badges';
import { confirmDialog } from '../utils/confirmDialog';
import { contatosVisiveis, servicosSemResponsavel } from '../utils/contatos';
import { Dropdown } from '../components/Dropdown';
import { ClientFormModal } from '../components/ClientFormModal';
import { EventFormModal } from '../components/EventFormModal';
import { ReminderFormModal } from '../components/ReminderFormModal';
import { RegistroContatoModal } from '../components/RegistroContatoModal';
import { WhatsAppMensagemModal } from '../components/WhatsAppMensagemModal';
import { ContatosCard } from '../components/cliente/ContatosCard';
import { TimelineCard } from '../components/cliente/TimelineCard';
import { AnaliseIACard } from '../components/cliente/AnaliseIACard';
import type { TimelineFiltro, TimelineItem } from '../utils/timelineCliente';
import { usePersistedState } from '../hooks/usePersistedState';
import { Badge, Button, Card, Textarea } from '../ui';
import { CLIENTE_ESTADO_OPCOES, type Contato, type EventoAgenda } from '../types';

export default function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const voltar = (location.state as { from?: string; fromLabel?: string } | null) ?? null;
  const backTo = voltar?.from ?? '/clientes';
  const backLabel = voltar?.fromLabel ?? 'Carteira';
  const { clientes, agenda, lembretes, removerCliente, atualizarCliente, opcoesPorTipo } = useCarteira();
  const statusOpcoes = opcoesPorTipo('status_cliente');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [eventoEditando, setEventoEditando] = useState<EventoAgenda | null>(null);
  const [eventoKey, setEventoKey] = useState(0); // muda p/ remontar a modal limpa (fechar o loop)
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [registroContatoOpen, setRegistroContatoOpen] = useState(false);

  // Memoizado: sem isso, `cliente` é recalculado (nova referência) a cada
  // render, e o compilador do React não consegue provar que memos que dependem
  // de `cliente?.algumCampo` (ex.: lojasDoGrupo) são estáveis.
  const cliente = useMemo(() => clientes.find((c) => c.id === id), [clientes, id]);

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
    () => agenda.filter((a) => a.clientId === id).sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime()),
    [agenda, id]
  );

  // Linha do tempo unificada: antes o histórico mostrava só eventos de agenda,
  // e os lembretes do cliente ficavam invisíveis aqui — quem abria a tela antes
  // de falar com o cliente tinha que cruzar duas telas pra saber o que já houve.
  const [filtroTimeline, setFiltroTimeline] = usePersistedState<TimelineFiltro>('filtro:cliente:timeline', 'tudo');

  const timeline = useMemo(() => {
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

      <Card style={{ marginBottom: 24, background: isGratuidade(cliente.status) ? 'var(--gratuidade-pastel-bg)' : undefined }}>
        <div className="flex-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: 8 }}>{cliente.empresa}</h1>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ minWidth: 150 }}>
                <Dropdown
                  label="Status"
                  options={(statusOpcoes.includes(cliente.status) || !cliente.status ? statusOpcoes : [...statusOpcoes, cliente.status]).map((s) => ({ value: s, label: s }))}
                  value={cliente.status}
                  onChange={(v) => atualizarCliente(cliente.id, { status: v as string })}
                />
              </div>
              <div style={{ minWidth: 130 }}>
                <Dropdown
                  label="Estado"
                  options={CLIENTE_ESTADO_OPCOES.map((e) => ({ value: e, label: e }))}
                  value={cliente.estado || 'Ativo'}
                  onChange={(v) => atualizarCliente(cliente.id, { estado: v as string })}
                />
              </div>
              <Badge variant={clienteStatusBadge(cliente.status)}>{cliente.status || '—'}</Badge>
              {cliente.monitor && <Badge variant="muted">Monitor: {cliente.monitor}</Badge>}
              {cliente.servicos.map((s) => <Badge key={s} variant="accent">{s}</Badge>)}
              {cliente.grupo && (
                <Badge variant="warning">Grupo: {cliente.grupo}</Badge>
              )}
            </div>
          </div>
          <div className="flex-row">
            <Button variant="secondary" onClick={() => setEditModalOpen(true)}>
              <Pencil size={15} /> Editar
            </Button>
            <Button variant="danger" onClick={handleExcluir}>
              <Trash2 size={15} /> Excluir
            </Button>
          </div>
        </div>
      </Card>

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
      </div>

      <ContatosCard
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

      {cliente.grupo && lojasDoGrupo.length > 1 && (
        <Card flat style={{ marginBottom: 24 }}>
          <div className="section-header">
            <h3>Lojas do grupo <span className="text-text-muted" style={{ fontWeight: 400, fontSize: 13 }}>· {cliente.grupo}</span></h3>
            <span className="text-text-muted" style={{ fontSize: 12 }}>{lojasDoGrupo.length}</span>
          </div>
          <div className="flex-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {lojasDoGrupo.map((l) => (
              <Badge
                as="button"
                key={l.id}
                variant={l.id === cliente.id ? 'accent' : 'muted'}
                style={{ cursor: l.id === cliente.id ? 'default' : 'pointer' }}
                onClick={() => l.id !== cliente.id && navigate(`/clientes/${l.id}`)}
              >
                {l.empresa.replace(`${cliente.grupo} - `, '') || l.empresa}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      <div className="two-col-grid">
        <Card flat>
          <div className="section-header"><h3>Anotações</h3></div>
          <Textarea
            placeholder="Anotações sobre este cliente..."
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            style={{ minHeight: 160, marginBottom: 12 }}
          />
          <Button variant="primary" onClick={salvarObservacao} disabled={salvandoObs || !obsMudou}>
            <Save size={14} /> {salvandoObs ? 'Salvando...' : 'Salvar anotação'}
          </Button>
        </Card>

        <TimelineCard
          timeline={timeline}
          filtro={filtroTimeline}
          onFiltroChange={setFiltroTimeline}
          onEditarEvento={setEventoEditando}
        />
      </div>

      <AnaliseIACard clienteId={cliente.id} />

      {editModalOpen && <ClientFormModal initial={cliente} onClose={() => setEditModalOpen(false)} />}
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
