import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, CalendarPlus, Check, Plus, Search, Trash2, X } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { AcaoFormModal } from '../components/AcaoFormModal';
import { Dropdown } from '../components/Dropdown';
import { CardCliente } from '../components/acoes/CardCliente';
import { Grupo } from '../components/acoes/Grupo';
import { useSearchFilter } from '../hooks/useSearchFilter';
import { usePersistedState } from '../hooks/usePersistedState';
import { buildUltimaInteracaoMap } from '../utils/ultimaInteracao';
import { buildFilaCadencia, classificarCadencia, type FilaCadItem } from '../utils/cadenciaServico';
import { confirmDialog } from '../utils/confirmDialog';
import { isStatusAtivo } from '../utils/formatters';
import { eventoStatusBadge } from '../utils/badges';
import { type Item } from '../utils/acoesHelpers';
import { Badge, Button, Card, Chip, Td, Th, type BadgeVariant } from '../ui';
import { ACAO_TIPO_LABEL, type AcaoTipo, type Cliente } from '../types';

const ACAO_STATUS_BADGE: Record<string, BadgeVariant> = { programado: 'accent', concluido: 'success', dispensado: 'muted' };
const ACAO_STATUS_LABEL: Record<string, string> = { programado: 'Programada', concluido: 'Concluída', dispensado: 'Dispensada' };

export default function AcoesPage() {
  const { clientes, agenda, acoes, cadencias, atualizarAcao, removerAcao } = useCarteira();
  const navigate = useNavigate();
  const [aba, setAba] = usePersistedState<'acompanhamento' | 'acoes'>('filtro:acoes:aba', 'acompanhamento');
  const [visaoAcompanhamento, setVisaoAcompanhamento] = usePersistedState<'grupos' | 'sugestoes'>('filtro:acoes:visao', 'grupos');
  const [modal, setModal] = useState<{ modo: 'nova' | 'agendar'; clienteId?: string; tipo?: AcaoTipo } | null>(null);
  const { value: fCliente, debounced: debouncedFCliente, setValue: setFCliente } = useSearchFilter();
  const [fTipos, setFTipos] = usePersistedState<string[]>('filtro:acoes:tipos', []);
  const [fOrigem, setFOrigem] = usePersistedState<string[]>('filtro:acoes:origem', []);
  const [fStatus, setFStatus] = usePersistedState<string[]>('filtro:acoes:status', []);
  const [sortBy, setSortBy] = usePersistedState<'data' | 'cliente' | 'tipo' | 'origem' | 'status'>('filtro:acoes:sortBy', 'data');
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>('filtro:acoes:sortDir', 'desc'); // padrão: mais recente
  // filtros da aba Acompanhamento
  const { value: acCliente, debounced: debouncedAcCliente, setValue: setAcCliente } = useSearchFilter();
  const [acMonitores, setAcMonitores] = usePersistedState<string[]>('filtro:acoes:acMonitores', []);
  const [acProduto, setAcProduto] = usePersistedState<'Monitoria' | 'Price'>('filtro:acoes:acProduto', 'Monitoria');
  const [acOrd, setAcOrd] = usePersistedState('filtro:acoes:acOrd', 'contato-recente');

  const nomeCliente = (id: string) => clientes.find((c) => c.id === id)?.empresa ?? '—';

  // Histórico unificado: reuniões + ações registradas (reunião também é ação).
  const itens = useMemo<Item[]>(() => {
    const arr: Item[] = [];
    agenda.forEach((e) => arr.push({
      key: 'r' + e.id, refId: e.id, clientId: e.clientId, tipoLabel: e.type || 'Reunião',
      date: parseISO(e.date), statusLabel: e.status || '—', statusBadge: eventoStatusBadge(e.status),
      obs: e.subject || '', origem: 'reuniao', eventDate: e.date,
    }));
    acoes.forEach((a) => arr.push({
      key: 'a' + a.id, refId: a.id, clientId: a.clientId, tipoLabel: ACAO_TIPO_LABEL[a.tipo] ?? a.tipo,
      date: parseISO(a.dueAt || a.createdAt), statusLabel: ACAO_STATUS_LABEL[a.status] ?? a.status,
      statusBadge: ACAO_STATUS_BADGE[a.status] ?? 'muted', obs: a.notes || '', origem: 'acao', acaoStatus: a.status,
    }));
    return arr.sort((x, y) => y.date.getTime() - x.date.getTime());
  }, [agenda, acoes]);

  const itensPorCliente = useMemo(() => {
    const m = new Map<string, Item[]>();
    itens.forEach((i) => { if (!m.has(i.clientId)) m.set(i.clientId, []); m.get(i.clientId)!.push(i); });
    return m;
  }, [itens]);

  const info = useMemo(() => {
    const ult = buildUltimaInteracaoMap(agenda, acoes);
    const nReun = new Map<string, number>();
    agenda.forEach((a) => nReun.set(a.clientId, (nReun.get(a.clientId) ?? 0) + 1));
    return { ult, nReun };
  }, [agenda, acoes]);

  // Clientes atendidos diretamente pelo Marco (fora do modelo de cadência).
  const marco = useMemo(
    () => clientes.filter((c) => isStatusAtivo(c.status) && c.atendidoMarco).sort((a, b) => a.empresa.localeCompare(b.empresa)),
    [clientes]
  );

  // Fila de priorização por ADERÊNCIA À CADÊNCIA por serviço (Monitoria/Price).
  // Cada serviço do cliente tem um "relógio": vencido/vencendo/nunca pede ação;
  // reunião futura marcada (ou relatório, no caso de Price) cobre o relógio.
  // Ordena do mais vencido para o menos. Substitui a antiga "sugestão por recência".
  const filaCadencia = useMemo(() => buildFilaCadencia(clientes, agenda, acoes, cadencias, new Date()), [clientes, agenda, acoes, cadencias]);

  const tipoOpcoes = useMemo(() => [...new Set(itens.map((i) => i.tipoLabel))].sort(), [itens]);
  const statusOpcoes = useMemo(() => [...new Set(itens.map((i) => i.statusLabel))].filter(Boolean).sort(), [itens]);

  const itensFiltrados = useMemo(() => {
    const termo = debouncedFCliente.trim().toLowerCase();
    const lista = itens
      .filter((i) => !termo || nomeCliente(i.clientId).toLowerCase().includes(termo))
      .filter((i) => fTipos.length === 0 || fTipos.includes(i.tipoLabel))
      .filter((i) => fOrigem.length === 0 || fOrigem.includes(i.origem))
      .filter((i) => fStatus.length === 0 || fStatus.includes(i.statusLabel));
    lista.sort((a, b) => {
      let r = 0;
      if (sortBy === 'data') r = a.date.getTime() - b.date.getTime();
      else if (sortBy === 'cliente') r = nomeCliente(a.clientId).localeCompare(nomeCliente(b.clientId));
      else if (sortBy === 'tipo') r = a.tipoLabel.localeCompare(b.tipoLabel);
      else if (sortBy === 'origem') r = a.origem.localeCompare(b.origem);
      else if (sortBy === 'status') r = a.statusLabel.localeCompare(b.statusLabel);
      if (r === 0) r = a.date.getTime() - b.date.getTime();
      return sortDir === 'asc' ? r : -r;
    });
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, debouncedFCliente, fTipos, fOrigem, fStatus, sortBy, sortDir, clientes]);

  const filtrosAcoesAtivos = !!debouncedFCliente.trim() || fTipos.length > 0 || fOrigem.length > 0 || fStatus.length > 0;
  function limparFiltrosAcoes() { setFCliente(''); setFTipos([]); setFOrigem([]); setFStatus([]); }

  function ordenarPor(col: typeof sortBy) {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir(col === 'data' ? 'desc' : 'asc'); }
  }
  const seta = (col: typeof sortBy) => (sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');
  const preset = sortBy === 'data' ? (sortDir === 'desc' ? 'recente' : 'antiga') : sortBy === 'cliente' ? 'cliente' : sortBy === 'status' ? 'status' : '';
  function aplicarPreset(v: string) {
    if (v === 'recente') { setSortBy('data'); setSortDir('desc'); }
    else if (v === 'antiga') { setSortBy('data'); setSortDir('asc'); }
    else if (v === 'cliente') { setSortBy('cliente'); setSortDir('asc'); }
    else if (v === 'status') { setSortBy('status'); setSortDir('asc'); }
  }

  const produtos = (c: Cliente) => {
    const out: string[] = [];
    const has = (re: RegExp, f: keyof Cliente) => (c.servicos ?? []).some((s) => re.test(s)) || Boolean(c[f]);
    if (has(/monitor/i, 'monitoria')) out.push('Monitoria');
    if (has(/(price|prec)/i, 'price')) out.push('Price');
    return out;
  };

  const monitorOpcoes = useMemo(() => [...new Set(clientes.map((c) => c.monitor).filter(Boolean) as string[])].sort(), [clientes]);

  // Filtro comum (busca/monitor/serviço) da aba Acompanhamento. Serviço
  // (Monitoria/Price) é segmentado por sub-aba, não mais dropdown — os dois
  // fluxos de cadência têm prazos e ritmos diferentes, faz sentido olhar um
  // de cada vez em vez de misturado.
  const passaFiltro = (c: Cliente) => {
    const termo = debouncedAcCliente.trim().toLowerCase();
    return (!termo || c.empresa?.toLowerCase().includes(termo)) &&
      (acMonitores.length === 0 || acMonitores.includes(c.monitor || '')) &&
      produtos(c).includes(acProduto);
  };

  // Mesmo filtro (busca/monitor/serviço) aplicado à fila — a badge "Precisam
  // de ação" tem que contar exatamente quem aparece na lista, senão o número
  // não bate com o filtro ativo (já foi bug real relatado).
  const filaVisivel = useMemo(
    () => filaCadencia.filter((f) => passaFiltro(f.cliente)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filaCadencia, debouncedAcCliente, acMonitores, acProduto]
  );
  const nPrecisaAcao = useMemo(() => filaVisivel.filter((f) => f.precisaAcao).length, [filaVisivel]);
  const filtrosAcompanhamentoAtivos = !!debouncedAcCliente.trim() || acMonitores.length > 0;
  function limparFiltrosAcompanhamento() { setAcCliente(''); setAcMonitores([]); }

  function filtrarOrdenar(lista: Cliente[]): Cliente[] {
    const out = lista.filter(passaFiltro);
    const t = (c: Cliente) => info.ult.get(c.id)?.getTime() ?? 0;
    out.sort((a, b) => {
      if (acOrd === 'contato-recente') return t(b) - t(a);
      if (acOrd === 'contato-antigo') return t(a) - t(b);
      if (acOrd === 'cliente') return a.empresa.localeCompare(b.empresa);
      if (acOrd === 'reunioes') return (info.nReun.get(b.id) ?? 0) - (info.nReun.get(a.id) ?? 0);
      return 0;
    });
    return out;
  }

  // Card de um item da fila (com os relógios de cadência).
  const cardDeFila = (f: FilaCadItem) => (
    <CardCliente
      key={f.cliente.id}
      c={f.cliente}
      comHistorico
      relogios={f.relogios}
      severidade={classificarCadencia(f)}
      ultimoContato={info.ult.get(f.cliente.id) ?? null}
      totalReunioes={info.nReun.get(f.cliente.id) ?? 0}
      historico={(itensPorCliente.get(f.cliente.id) ?? []).slice(0, 3)}
      produtos={produtos(f.cliente)}
      onRegistrar={(clienteId, tipo) => setModal({ modo: 'nova', clienteId, tipo })}
      onAgendar={(clienteId) => setModal({ modo: 'agendar', clienteId })}
    />
  );

  function renderCard(comHistorico: boolean) {
    return (c: Cliente) => (
      <CardCliente
        key={c.id}
        c={c}
        comHistorico={comHistorico}
        ultimoContato={info.ult.get(c.id) ?? null}
        totalReunioes={info.nReun.get(c.id) ?? 0}
        historico={(itensPorCliente.get(c.id) ?? []).slice(0, 3)}
        produtos={produtos(c)}
        onRegistrar={(clienteId, tipo) => setModal({ modo: 'nova', clienteId, tipo })}
        onAgendar={(clienteId) => setModal({ modo: 'agendar', clienteId })}
      />
    );
  }

  return (
    <div className="page-container">
      <div className="flex-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Ações</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>Acompanhamento da carteira e registro de ações.</p>
        </div>
      </div>

      <div className="tabs" style={{ margin: '1.25rem 0 1.5rem' }}>
        <button className={`tab${aba === 'acompanhamento' ? ' is-active' : ''}`} onClick={() => setAba('acompanhamento')}>Acompanhamento</button>
        <button className={`tab${aba === 'acoes' ? ' is-active' : ''}`} onClick={() => setAba('acoes')}>Ações</button>
      </div>

      {aba === 'acompanhamento' ? (
        <>
          <div className="tabs tabs-sub" style={{ marginBottom: '1rem' }}>
            <button className={`tab${acProduto === 'Monitoria' ? ' is-active' : ''}`} onClick={() => setAcProduto('Monitoria')}>Monitoria</button>
            <button className={`tab${acProduto === 'Price' ? ' is-active' : ''}`} onClick={() => setAcProduto('Price')}>Price</button>
          </div>

          <Card flat className="mb-4">
            <div className="filter-grid">
              <label className="filter-ctl filter-search">
                <Search size={16} />
                <input placeholder="Buscar cliente..." value={acCliente} onChange={(e) => setAcCliente(e.target.value)} />
              </label>
              <Dropdown label="Monitor" multiple options={monitorOpcoes.map((m) => ({ value: m, label: m }))} value={acMonitores} onChange={(v) => setAcMonitores(v as string[])} />
              <Dropdown label="Ordenar" defaultValue="contato-recente" options={[
                { value: 'contato-recente', label: 'Contato recente' },
                { value: 'contato-antigo', label: 'Contato antigo' },
                { value: 'cliente', label: 'Cliente (A-Z)' },
                { value: 'reunioes', label: 'Mais reuniões' },
              ]} value={acOrd} onChange={(v) => setAcOrd(v as string)} />
            </div>
            {filtrosAcompanhamentoAtivos && (
              <div className="flex items-center justify-end gap-3 mt-3 pt-3 border-t border-border">
                <Button variant="secondary" onClick={limparFiltrosAcompanhamento}>
                  <X size={15} /> Limpar filtros
                </Button>
              </div>
            )}
          </Card>

          <div className="flex flex-wrap gap-[0.4rem]" style={{ marginBottom: 18 }}>
            <Chip active={visaoAcompanhamento === 'grupos'} onClick={() => setVisaoAcompanhamento('grupos')}>Todos os grupos</Chip>
            <Chip active={visaoAcompanhamento === 'sugestoes'} onClick={() => setVisaoAcompanhamento('sugestoes')}>
              Precisam de ação{nPrecisaAcao > 0 && <Badge variant="warning" style={{ marginLeft: 6 }}>{nPrecisaAcao}</Badge>}
            </Chip>
          </div>

          {visaoAcompanhamento === 'sugestoes' ? (() => {
            const fila = filaVisivel.filter((f) => f.precisaAcao);
            return (
              <div className="section">
                <p className="text-text-muted" style={{ fontSize: 13, marginBottom: 14 }}>
                  Fila por <strong>cadência por serviço</strong> (Monitoria {cadencias.monitoria_dias}d · Price {cadencias.price_dias}d): quem está vencido, vencendo ou nunca atendido — e sem próximo compromisso que cubra. Do mais vencido para o menos.
                </p>
                <div className="section-header">
                  <h3>Precisam de ação <span className="text-text-muted" style={{ fontWeight: 400, fontSize: 13 }}>· cadência vencida ou vencendo</span></h3>
                  <span className="text-text-muted" style={{ fontSize: 12 }}>{fila.length}</span>
                </div>
                {fila.length === 0 ? (
                  <Card flat><div className="empty-state">Tudo dentro da cadência. 🎉</div></Card>
                ) : (
                  <div className="acao-grid">{fila.map(cardDeFila)}</div>
                )}
              </div>
            );
          })() : (() => {
            // Grupos unificados por CADÊNCIA (mesmo motor da fila), não mais por recência.
            const fila = filaVisivel;
            const vencidos = fila.filter((f) => classificarCadencia(f) === 'vencido');
            const vencendo = fila.filter((f) => classificarCadencia(f) === 'vencendo');
            const emdia = fila.filter((f) => classificarCadencia(f) === 'em_dia');
            const secao = (titulo: string, sub: string, itens: FilaCadItem[]) => (
              <div className="section" key={titulo}>
                <div className="section-header">
                  <h3>{titulo} <span className="text-text-muted" style={{ fontWeight: 400, fontSize: 13 }}>· {sub}</span></h3>
                  <span className="text-text-muted" style={{ fontSize: 12 }}>{itens.length}</span>
                </div>
                {itens.length === 0 ? <Card flat><div className="empty-state">Nenhum cliente.</div></Card> : <div className="acao-grid">{itens.map(cardDeFila)}</div>}
              </div>
            );
            return (
              <>
                {secao('Vencidos', 'cadência estourada ou nunca atendido', vencidos)}
                {secao('Vencendo', 'perto de vencer', vencendo)}
                {secao('Em dia', 'dentro da cadência', emdia)}
                <Grupo titulo="Atendidos pelo Marco" sub="fora do modelo de cadência" lista={filtrarOrdenar(marco)} renderCard={renderCard(false)} />
              </>
            );
          })()}
        </>
      ) : (
        <>
          <div className="flex-row" style={{ gap: 8, marginBottom: 14 }}>
            <Button variant="primary" onClick={() => setModal({ modo: 'nova' })}><Plus size={16} /> Registrar ação</Button>
            <Button variant="secondary" onClick={() => setModal({ modo: 'agendar' })}><CalendarPlus size={16} /> Agendar ação</Button>
          </div>

          <Card flat className="mb-4">
            <div className="filter-grid">
              <label className="filter-ctl filter-search">
                <Search size={16} />
                <input placeholder="Buscar cliente..." value={fCliente} onChange={(e) => setFCliente(e.target.value)} />
              </label>
              <Dropdown label="Tipo" multiple options={tipoOpcoes.map((t) => ({ value: t, label: t }))} value={fTipos} onChange={(v) => setFTipos(v as string[])} />
              <Dropdown label="Origem" multiple options={[{ value: 'reuniao', label: 'Reunião' }, { value: 'acao', label: 'Ação registrada' }]} value={fOrigem} onChange={(v) => setFOrigem(v as string[])} />
              <Dropdown label="Status" multiple options={statusOpcoes.map((s) => ({ value: s, label: s }))} value={fStatus} onChange={(v) => setFStatus(v as string[])} />
              <Dropdown label="Ordenar" defaultValue="recente" options={[
                { value: 'recente', label: 'Mais recente' },
                { value: 'antiga', label: 'Mais antiga' },
                { value: 'cliente', label: 'Cliente (A-Z)' },
                { value: 'status', label: 'Status' },
              ]} value={preset} onChange={(v) => aplicarPreset(v as string)} />
            </div>
            {filtrosAcoesAtivos && (
              <div className="flex items-center justify-end gap-3 mt-3 pt-3 border-t border-border">
                <span className="text-[0.8rem] text-text-muted">{itensFiltrados.length} resultado(s)</span>
                <Button variant="secondary" onClick={limparFiltrosAcoes}>
                  <X size={15} /> Limpar filtros
                </Button>
              </div>
            )}
          </Card>

          <Card flat style={{ padding: 0, overflow: 'hidden' }}>
            {itensFiltrados.length === 0 ? <div className="empty-state" style={{ padding: '2rem' }}>Nenhuma ação encontrada.</div> : (
              <table className="w-full border-collapse text-[0.9rem]">
                <thead><tr>
                  <Th sortable onClick={() => ordenarPor('data')}>Data{seta('data')}</Th>
                  <Th sortable onClick={() => ordenarPor('cliente')}>Cliente{seta('cliente')}</Th>
                  <Th sortable onClick={() => ordenarPor('tipo')}>Tipo{seta('tipo')}</Th>
                  <Th sortable onClick={() => ordenarPor('origem')}>Origem{seta('origem')}</Th>
                  <Th sortable onClick={() => ordenarPor('status')}>Status{seta('status')}</Th>
                  <Th>Observação</Th><Th></Th>
                </tr></thead>
                <tbody>
                  {itensFiltrados.map((i) => (
                    <tr key={i.key} className="group [&:last-child>td]:border-b-0">
                      <Td first style={{ whiteSpace: 'nowrap' }}>{format(i.date, 'dd/MM/yy', { locale: ptBR })}</Td>
                      <Td><button className="link-button" onClick={() => navigate(`/clientes/${i.clientId}`, { state: { from: '/acoes', fromLabel: 'Ações' } })}>{nomeCliente(i.clientId)}</button></Td>
                      <Td>{i.tipoLabel}</Td>
                      <Td><Badge variant={i.origem === 'reuniao' ? 'accent' : 'muted'}>{i.origem === 'reuniao' ? 'Reunião' : 'Ação'}</Badge></Td>
                      <Td><Badge variant={i.statusBadge}>{i.statusLabel}</Badge></Td>
                      <Td className="text-text-muted" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.obs || '—'}</Td>
                      <Td>
                        <div className="flex-row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                          {i.origem === 'reuniao' ? (
                            <Button variant="secondary" size="icon" title="Ver na agenda" onClick={() => navigate('/agenda', { state: { focusDate: i.eventDate } })}><CalendarDays size={14} /></Button>
                          ) : (
                            <>
                              {i.acaoStatus === 'programado' && <Button variant="secondary" size="icon" title="Concluir" onClick={() => atualizarAcao(i.refId, { status: 'concluido' })}><Check size={14} /></Button>}
                              <Button variant="danger" size="icon" title="Excluir" onClick={async () => { if (await confirmDialog('Excluir esta ação?', { danger: true, confirmLabel: 'Excluir' })) removerAcao(i.refId); }}><Trash2 size={13} /></Button>
                            </>
                          )}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}

      {modal && <AcaoFormModal modo={modal.modo} clienteId={modal.clienteId} tipoInicial={modal.tipo} onClose={() => setModal(null)} />}
    </div>
  );
}
