import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { AlertTriangle, ArrowLeft, Bell as BellIcon, CalendarPlus, MessageCircle, Paperclip, Pencil, PhoneCall, PhoneIncoming, Save, Trash2, UserPlus, Users2 } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { urlAnexo } from '../api/client';
import { clienteStatusBadge, eventoStatusBadge, isGratuidade } from '../utils/badges';
import { confirmDialog } from '../utils/confirmDialog';
import { linkWhatsApp } from '../utils/whatsapp';
import { contatosVisiveis, servicosSemResponsavel } from '../utils/contatos';
import { Dropdown } from '../components/Dropdown';
import { ClientFormModal } from '../components/ClientFormModal';
import { EventFormModal } from '../components/EventFormModal';
import { ReminderFormModal } from '../components/ReminderFormModal';
import { RegistroContatoModal } from '../components/RegistroContatoModal';
import { WhatsAppMensagemModal } from '../components/WhatsAppMensagemModal';
import { usePersistedState } from '../hooks/usePersistedState';
import { Badge, Button, Card, Chip, Input, Textarea } from '../ui';
import { CLIENTE_ESTADO_OPCOES, ORIGEM_LABEL, type Contato, type EventoAgenda, type Lembrete } from '../types';

/** Mesma regra usada em src/components/agenda/CardEvento.tsx: concluído/realizado
 * ou cancelado/reagendado são status finais — fora isso, o evento ainda está
 * em aberto ("agendado") e pode ser editado. */
const eventoAgendado = (ev: EventoAgenda) => !/conclu|realiz|cancel|reagend/i.test(ev.status || '');

type TimelineFiltro = 'tudo' | 'reunioes' | 'contatos' | 'relatorios' | 'lembretes';

const TIMELINE_FILTROS: { valor: TimelineFiltro; label: string }[] = [
  { valor: 'tudo', label: 'Tudo' },
  { valor: 'reunioes', label: 'Reuniões' },
  { valor: 'contatos', label: 'Contatos' },
  { valor: 'relatorios', label: 'Relatórios' },
  { valor: 'lembretes', label: 'Lembretes' },
];

/** Item da linha do tempo — evento de agenda ou lembrete, unificados. */
type TimelineItem =
  | { kind: 'evento'; id: string; quando: Date; evento: EventoAgenda }
  | { kind: 'lembrete'; id: string; quando: Date; lembrete: Lembrete };

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

      <Card flat style={{ marginBottom: 24 }}>
        <div className="section-header">
          <h3>Contatos</h3>
          <span className="text-text-muted" style={{ fontSize: 12 }}>{contatos.length}</span>
        </div>

        {servicosSemContato.length > 0 && (
          <div className="flex-row" style={{ gap: 6, alignItems: 'center', marginBottom: 12, fontSize: 13 }}>
            <AlertTriangle size={14} className="text-[color:var(--warning)] shrink-0" />
            <span className="text-text-secondary">
              Sem contato responsável por <strong>{servicosSemContato.join(', ')}</strong> — só há contatos de outros serviços.
            </span>
          </div>
        )}

        {contatos.length === 0 ? (
          <div className="empty-state" style={{ marginBottom: 12 }}>Nenhum contato cadastrado.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {contatos.map((c) => (
              <div key={c.id} className="flex-between" style={{ gap: 12, flexWrap: 'wrap', padding: '10px 12px', background: 'var(--card-hover)', borderRadius: 6 }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: 14 }}>{c.nome}</strong>
                  {c.cargo && <span className="text-text-muted" style={{ fontSize: 13 }}> · {c.cargo}</span>}
                  {c.telefone && <div className="text-text-muted" style={{ fontSize: 13 }}>{c.telefone}</div>}
                  <div className="flex-row" style={{ gap: 5, flexWrap: 'wrap', marginTop: 4 }}>
                    {(c.servicos ?? []).length === 0 ? (
                      <Badge variant="muted" style={{ fontSize: 10 }}>Geral</Badge>
                    ) : (
                      (c.servicos ?? []).map((s) => (<Badge key={s} variant="accent" style={{ fontSize: 10 }}>{s}</Badge>))
                    )}
                    {/* Herdado de outra loja do grupo: mostra de onde vem, porque
                        editar/remover só é possível na loja de origem. */}
                    {c.doGrupo ? (
                      <Badge variant="success" style={{ fontSize: 10 }} title={`Cadastrado em ${c.origemEmpresa} e compartilhado com o grupo`}>
                        <Users2 size={10} /> do grupo · {c.origemEmpresa}
                      </Badge>
                    ) : c.escopo === 'grupo' ? (
                      <Badge variant="success" style={{ fontSize: 10 }} title="Aparece em todas as lojas deste grupo">
                        <Users2 size={10} /> vale para o grupo
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <div className="flex-row" style={{ gap: 6 }}>
                  <Button
                    variant="success"
                    onClick={() => (linkWhatsApp(c.telefone) ? setWaContato(c) : undefined)}
                    disabled={!linkWhatsApp(c.telefone)}
                    title={linkWhatsApp(c.telefone) ? 'Enviar mensagem no WhatsApp' : 'Telefone inválido'}
                  >
                    <MessageCircle size={15} /> WhatsApp
                  </Button>
                  {/* Compartilhar/parar de compartilhar só faz sentido em cliente
                      de grupo, e só no contato gravado aqui. */}
                  {!c.doGrupo && cliente.grupo && (
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={() => alternarEscopo(c.id)}
                      title={c.escopo === 'grupo'
                        ? 'Deixar de compartilhar com as outras lojas do grupo'
                        : 'Compartilhar este contato com todas as lojas do grupo'}
                    >
                      <Users2 size={15} />
                    </Button>
                  )}
                  {!c.doGrupo ? (
                    <Button variant="danger" size="icon" onClick={() => removerContato(c.id)} title="Remover contato">
                      <Trash2 size={15} />
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={() => navigate(`/clientes/${c.origemClienteId}`, { state: { from: location.pathname, fromLabel: cliente.empresa } })}
                      title={`Editar em ${c.origemEmpresa}`}
                    >
                      <Pencil size={15} />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <div className="flex-row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ flex: '1 1 180px' }}>
              <Input placeholder="Nome" value={contatoNome} onChange={(e) => setContatoNome(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && adicionarContato()} />
            </div>
            <div style={{ flex: '1 1 140px' }}>
              <Input placeholder="Cargo" value={contatoCargo} onChange={(e) => setContatoCargo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && adicionarContato()} />
            </div>
            <div style={{ flex: '1 1 140px' }}>
              <Input placeholder="Telefone (DDD + número)" value={contatoTelefone} onChange={(e) => setContatoTelefone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && adicionarContato()} />
            </div>
          </div>
          {servicoOpcoes.length > 0 && (
            <div className="flex-row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
              <span className="text-text-muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                Atende
              </span>
              {servicoOpcoes.map((s) => (
                <Chip variant="toggle" key={s} active={contatoServicos.includes(s)} onClick={() => toggleContatoServico(s)}>{s}</Chip>
              ))}
              <span className="text-text-muted" style={{ fontSize: 12 }}>
                {contatoServicos.length === 0 ? '(nenhum marcado = contato geral)' : ''}
              </span>
            </div>
          )}
          {/* Só aparece em cliente de grupo: é o caso em que a mesma pessoa pode
              atender mais de uma loja. */}
          {cliente.grupo && (
            <label className="check-row" style={{ fontSize: 13, marginBottom: 12 }}>
              <input type="checkbox" checked={contatoDoGrupo} onChange={(e) => setContatoDoGrupo(e.target.checked)} />
              Este contato atende todas as lojas do grupo <strong>{cliente.grupo}</strong>
            </label>
          )}
          <Button variant="primary" onClick={adicionarContato} disabled={!contatoNome.trim()}>
            <UserPlus size={15} /> Adicionar contato
          </Button>
        </div>
      </Card>

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

        <Card flat>
          <div className="section-header" style={{ flexWrap: 'wrap', gap: 8 }}>
            <h3>Linha do tempo</h3>
            <span className="text-text-muted" style={{ fontSize: 12 }}>{timeline.length}</span>
          </div>
          <div className="flex-row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {TIMELINE_FILTROS.map((f) => (
              <button
                key={f.valor}
                className={`filtro-btn${filtroTimeline === f.valor ? ' is-active' : ''}`}
                onClick={() => setFiltroTimeline(f.valor)}
              >
                {f.label}
              </button>
            ))}
          </div>
          {timeline.length === 0 ? (
            <div className="empty-state">Nada registrado para este cliente com esse filtro.</div>
          ) : (
            <div>
              {timeline.map((item) => {
                if (item.kind === 'lembrete') {
                  const l = item.lembrete;
                  return (
                    <div key={`l-${item.id}`} className="history-item">
                      <div className="flex-between" style={{ marginBottom: 6 }}>
                        <strong style={{ fontSize: 14 }}>{l.title}</strong>
                        <Badge variant="accent">{format(item.quando, 'dd/MM/yyyy')}</Badge>
                      </div>
                      <div className="flex-row" style={{ marginBottom: l.description ? 6 : 0 }}>
                        <Badge variant="muted"><BellIcon size={10} /> Lembrete</Badge>
                        <Badge variant={l.status === 'concluido' ? 'success' : 'warning'}>
                          {l.status === 'concluido' ? 'Concluído' : 'Ativo'}
                        </Badge>
                      </div>
                      {l.description && <p className="text-text-muted" style={{ fontSize: 13, margin: 0 }}>{l.description}</p>}
                    </div>
                  );
                }

                const evento = item.evento;
                const editavel = eventoAgendado(evento);
                return (
                <div
                  key={evento.id}
                  className={`history-item${editavel ? ' history-item-editavel' : ''}`}
                  role={editavel ? 'button' : undefined}
                  tabIndex={editavel ? 0 : undefined}
                  title={editavel ? 'Clique para editar este evento agendado' : undefined}
                  onClick={editavel ? () => setEventoEditando(evento) : undefined}
                  onKeyDown={editavel ? (e) => { if (e.key === 'Enter') setEventoEditando(evento); } : undefined}
                >
                  <div className="flex-between" style={{ marginBottom: 6 }}>
                    <strong style={{ fontSize: 14 }}>{evento.subject || evento.type}</strong>
                    <Badge variant="accent">{format(parseISO(evento.date), 'dd/MM/yyyy')}</Badge>
                  </div>
                  <div className="flex-row" style={{ marginBottom: evento.description ? 6 : 0, flexWrap: 'wrap' }}>
                    <Badge variant="accent">{evento.type}</Badge>
                    <Badge variant={eventoStatusBadge(evento.status)}>{evento.status}</Badge>
                    {/* Só aparece onde faz sentido (Contato/Ligação) e onde foi
                        informado — eventos antigos não têm origem. */}
                    {evento.origem && (
                      <Badge variant={evento.origem === 'cliente' ? 'success' : 'muted'}>
                        {evento.origem === 'cliente' ? <PhoneIncoming size={10} /> : <PhoneCall size={10} />}
                        {ORIGEM_LABEL[evento.origem]}
                      </Badge>
                    )}
                  </div>
                  {evento.description && <p className="text-text-muted" style={{ fontSize: 13, margin: 0 }}>{evento.description}</p>}
                  {evento.attachments.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {evento.attachments.map((anexo) => (
                        <a key={anexo.id} className="attachment-chip" href={urlAnexo(anexo.filename)} target="_blank" rel="noreferrer">
                          <Paperclip size={12} /> {anexo.originalName}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

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
