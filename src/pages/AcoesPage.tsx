import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, CalendarPlus, Check, Plus, Search, Trash2 } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { AcaoFormModal } from '../components/AcaoFormModal';
import { Dropdown } from '../components/Dropdown';
import { CardCliente } from '../components/acoes/CardCliente';
import { Grupo } from '../components/acoes/Grupo';
import { useSearchFilter } from '../hooks/useSearchFilter';
import { buildUltimaInteracaoMap } from '../utils/ultimaInteracao';
import { confirmDialog } from '../utils/confirmDialog';
import { isStatusAtivo } from '../utils/formatters';
import { eventoStatusBadge } from '../utils/badges';
import { type Item } from '../utils/acoesHelpers';
import { ACAO_TIPO_LABEL, type AcaoTipo, type Cliente } from '../types';

const JANELA = 60;
const JANELA_SUGESTAO = 30;
const ACAO_STATUS_BADGE: Record<string, string> = { programado: 'badge-accent', concluido: 'badge-success', dispensado: 'badge-muted' };
const ACAO_STATUS_LABEL: Record<string, string> = { programado: 'Programada', concluido: 'Concluída', dispensado: 'Dispensada' };

export default function AcoesPage() {
  const { clientes, agenda, acoes, atualizarAcao, removerAcao } = useCarteira();
  const navigate = useNavigate();
  const [aba, setAba] = useState<'acompanhamento' | 'acoes'>('acompanhamento');
  const [visaoAcompanhamento, setVisaoAcompanhamento] = useState<'grupos' | 'sugestoes'>('grupos');
  const [modal, setModal] = useState<{ modo: 'nova' | 'agendar'; clienteId?: string; tipo?: AcaoTipo } | null>(null);
  const { value: fCliente, debounced: debouncedFCliente, setValue: setFCliente } = useSearchFilter();
  const [fTipos, setFTipos] = useState<string[]>([]);
  const [fOrigem, setFOrigem] = useState<string[]>([]);
  const [fStatus, setFStatus] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'data' | 'cliente' | 'tipo' | 'origem' | 'status'>('data');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc'); // padrão: mais recente
  // filtros da aba Acompanhamento
  const { value: acCliente, debounced: debouncedAcCliente, setValue: setAcCliente } = useSearchFilter();
  const [acMonitores, setAcMonitores] = useState<string[]>([]);
  const [acProdutos, setAcProdutos] = useState<string[]>([]);
  const [acOrd, setAcOrd] = useState('contato-recente');

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
      statusBadge: ACAO_STATUS_BADGE[a.status] ?? 'badge-muted', obs: a.notes || '', origem: 'acao', acaoStatus: a.status,
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

  const { recorrentes, semContato, marco } = useMemo(() => {
    const ativos = clientes.filter((c) => isStatusAtivo(c.status));
    const rec: Cliente[] = [], sem: Cliente[] = [], mar: Cliente[] = [];
    ativos.forEach((c) => {
      if (c.atendidoMarco) return void mar.push(c);
      const u = info.ult.get(c.id);
      if (u && differenceInCalendarDays(new Date(), u) <= JANELA) rec.push(c); else sem.push(c);
    });
    rec.sort((a, b) => (info.ult.get(b.id)?.getTime() ?? 0) - (info.ult.get(a.id)?.getTime() ?? 0));
    sem.sort((a, b) => (info.ult.get(a.id)?.getTime() ?? 0) - (info.ult.get(b.id)?.getTime() ?? 0));
    mar.sort((a, b) => a.empresa.localeCompare(b.empresa));
    return { recorrentes: rec, semContato: sem, marco: mar };
  }, [clientes, info]);

  // Sugestão de Ações na Semana: dentro dos RECORRENTES (não os sem contato) —
  // quem já passou de 30 dias sem contato precisa de uma ação essa semana
  // antes de cair para "Sem contato". Ordenado do mais parado para o mais recente.
  const recorrentesSugestao = useMemo(() => {
    return recorrentes
      .filter((c) => differenceInCalendarDays(new Date(), info.ult.get(c.id)!) >= JANELA_SUGESTAO)
      .sort((a, b) => info.ult.get(a.id)!.getTime() - info.ult.get(b.id)!.getTime());
  }, [recorrentes, info]);

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
  const produtoOpcoes = useMemo(() => [...new Set(clientes.flatMap((c) => produtos(c)))].sort(), [clientes]);

  function filtrarOrdenar(lista: Cliente[]): Cliente[] {
    const termo = debouncedAcCliente.trim().toLowerCase();
    const out = lista.filter((c) =>
      (!termo || c.empresa.toLowerCase().includes(termo)) &&
      (acMonitores.length === 0 || acMonitores.includes(c.monitor || '')) &&
      (acProdutos.length === 0 || produtos(c).some((p) => acProdutos.includes(p)))
    );
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
          <div className="glass-card glass-card-flat mb-4">
            <div className="filter-grid">
              <label className="filter-ctl filter-search">
                <Search size={16} />
                <input placeholder="Buscar cliente..." value={acCliente} onChange={(e) => setAcCliente(e.target.value)} />
              </label>
              <Dropdown label="Monitor" multiple options={monitorOpcoes.map((m) => ({ value: m, label: m }))} value={acMonitores} onChange={(v) => setAcMonitores(v as string[])} />
              <Dropdown label="Produto" multiple options={produtoOpcoes.map((p) => ({ value: p, label: p }))} value={acProdutos} onChange={(v) => setAcProdutos(v as string[])} />
              <Dropdown label="Ordenar" defaultValue="contato-recente" options={[
                { value: 'contato-recente', label: 'Contato recente' },
                { value: 'contato-antigo', label: 'Contato antigo' },
                { value: 'cliente', label: 'Cliente (A-Z)' },
                { value: 'reunioes', label: 'Mais reuniões' },
              ]} value={acOrd} onChange={(v) => setAcOrd(v as string)} />
            </div>
          </div>

          <div className="chip-row" style={{ marginBottom: 18 }}>
            <button className={`chip${visaoAcompanhamento === 'grupos' ? ' is-active' : ''}`} onClick={() => setVisaoAcompanhamento('grupos')}>Todos os grupos</button>
            <button className={`chip${visaoAcompanhamento === 'sugestoes' ? ' is-active' : ''}`} onClick={() => setVisaoAcompanhamento('sugestoes')}>
              Sugestão de Ações na Semana{recorrentesSugestao.length > 0 && <span className="badge badge-warning" style={{ marginLeft: 6 }}>{recorrentesSugestao.length}</span>}
            </button>
          </div>

          {visaoAcompanhamento === 'sugestoes' ? (
            <>
              <p className="text-muted" style={{ fontSize: 13, marginBottom: 14 }}>
                Recorrentes com {JANELA_SUGESTAO}+ dias sem contato — ainda dentro da cadência, mas prestes a cair para "Sem contato" se não agir essa semana. Ordenado do mais parado para o mais recente.
              </p>
              <Grupo titulo="Precisam de ação essa semana" sub={`recorrentes com +${JANELA_SUGESTAO} dias sem contato`} lista={filtrarOrdenar(recorrentesSugestao)} renderCard={renderCard(true)} />
            </>
          ) : (
            <>
              <Grupo titulo="Recorrentes" sub={`reuniões nos últimos ${JANELA} dias`} lista={filtrarOrdenar(recorrentes)} renderCard={renderCard(true)} />
              <Grupo titulo="Sem contato" sub={`+${JANELA} dias sem contato`} lista={filtrarOrdenar(semContato)} renderCard={renderCard(false)} />
              <Grupo titulo="Atendidos pelo Marco" sub="fora da monitoria" lista={filtrarOrdenar(marco)} renderCard={renderCard(false)} />
            </>
          )}
        </>
      ) : (
        <>
          <div className="flex-row" style={{ gap: 8, marginBottom: 14 }}>
            <button className="btn btn-primary" onClick={() => setModal({ modo: 'nova' })}><Plus size={16} /> Registrar ação</button>
            <button className="btn btn-secondary" onClick={() => setModal({ modo: 'agendar' })}><CalendarPlus size={16} /> Agendar ação</button>
          </div>

          <div className="glass-card glass-card-flat mb-4">
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
          </div>

          <div className="glass-card glass-card-flat" style={{ padding: 0, overflow: 'hidden' }}>
            {itensFiltrados.length === 0 ? <div className="empty-state" style={{ padding: '2rem' }}>Nenhuma ação encontrada.</div> : (
              <table className="data-table">
                <thead><tr>
                  <th className="th-sort" onClick={() => ordenarPor('data')}>Data{seta('data')}</th>
                  <th className="th-sort" onClick={() => ordenarPor('cliente')}>Cliente{seta('cliente')}</th>
                  <th className="th-sort" onClick={() => ordenarPor('tipo')}>Tipo{seta('tipo')}</th>
                  <th className="th-sort" onClick={() => ordenarPor('origem')}>Origem{seta('origem')}</th>
                  <th className="th-sort" onClick={() => ordenarPor('status')}>Status{seta('status')}</th>
                  <th>Observação</th><th></th>
                </tr></thead>
                <tbody>
                  {itensFiltrados.map((i) => (
                    <tr key={i.key}>
                      <td style={{ whiteSpace: 'nowrap' }}>{format(i.date, 'dd/MM/yy', { locale: ptBR })}</td>
                      <td><button className="link-button" onClick={() => navigate(`/clientes/${i.clientId}`, { state: { from: '/acoes', fromLabel: 'Ações' } })}>{nomeCliente(i.clientId)}</button></td>
                      <td>{i.tipoLabel}</td>
                      <td><span className={`badge ${i.origem === 'reuniao' ? 'badge-accent' : 'badge-muted'}`}>{i.origem === 'reuniao' ? 'Reunião' : 'Ação'}</span></td>
                      <td><span className={`badge ${i.statusBadge}`}>{i.statusLabel}</span></td>
                      <td className="text-muted" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.obs || '—'}</td>
                      <td>
                        <div className="flex-row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                          {i.origem === 'reuniao' ? (
                            <button className="btn btn-secondary btn-icon" title="Ver na agenda" onClick={() => navigate('/agenda', { state: { focusDate: i.eventDate } })}><CalendarDays size={14} /></button>
                          ) : (
                            <>
                              {i.acaoStatus === 'programado' && <button className="btn btn-secondary btn-icon" title="Concluir" onClick={() => atualizarAcao(i.refId, { status: 'concluido' })}><Check size={14} /></button>}
                              <button className="btn btn-danger btn-icon" title="Excluir" onClick={async () => { if (await confirmDialog('Excluir esta ação?', { danger: true, confirmLabel: 'Excluir' })) removerAcao(i.refId); }}><Trash2 size={13} /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {modal && <AcaoFormModal modo={modal.modo} clienteId={modal.clienteId} tipoInicial={modal.tipo} onClose={() => setModal(null)} />}
    </div>
  );
}
