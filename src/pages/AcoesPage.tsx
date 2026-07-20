import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, CalendarPlus, Check, Plus, Search, Trash2 } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { AcaoFormModal } from '../components/AcaoFormModal';
import { Dropdown } from '../components/Dropdown';
import { isStatusAtivo } from '../utils/formatters';
import { eventoStatusBadge } from '../utils/badges';
import { ACAO_TIPO_LABEL, type AcaoTipo, type Cliente } from '../types';

const JANELA = 60;
const ACAO_STATUS_BADGE: Record<string, string> = { programado: 'badge-accent', concluido: 'badge-success', dispensado: 'badge-muted' };
const ACAO_STATUS_LABEL: Record<string, string> = { programado: 'Programada', concluido: 'Concluída', dispensado: 'Dispensada' };

/** Item unificado do histórico: reunião (agenda) OU ação registrada. */
interface Item {
  key: string; refId: string; clientId: string; tipoLabel: string; date: Date;
  statusLabel: string; statusBadge: string; obs: string;
  origem: 'reuniao' | 'acao'; acaoStatus?: string; eventDate?: string;
}

function rotuloData(d: Date): string {
  const dias = differenceInCalendarDays(new Date(), d);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias > 0 && dias <= 30) return `há ${dias} dias`;
  return format(d, 'dd/MM/yyyy');
}
function sugestoes(ult: Date | null): AcaoTipo[] {
  if (!ult) return ['contato'];
  const dias = differenceInCalendarDays(new Date(), ult);
  if (dias > 45) return ['reuniao', 'relatorio'];
  if (dias > 30) return ['reuniao'];
  return ['relatorio'];
}

export default function AcoesPage() {
  const { clientes, agenda, acoes, atualizarAcao, removerAcao } = useCarteira();
  const navigate = useNavigate();
  const [aba, setAba] = useState<'acompanhamento' | 'acoes'>('acompanhamento');
  const [modal, setModal] = useState<{ modo: 'nova' | 'agendar'; clienteId?: string; tipo?: AcaoTipo } | null>(null);
  const [fCliente, setFCliente] = useState('');
  const [fTipos, setFTipos] = useState<string[]>([]);
  const [fOrigem, setFOrigem] = useState<string[]>([]);

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
    const ult = new Map<string, Date>();
    const nReun = new Map<string, number>();
    const push = (cid: string, d: Date) => { if (isNaN(d.getTime()) || d > new Date()) return; const c = ult.get(cid); if (!c || d > c) ult.set(cid, d); };
    agenda.forEach((a) => { push(a.clientId, parseISO(a.date)); nReun.set(a.clientId, (nReun.get(a.clientId) ?? 0) + 1); });
    acoes.filter((a) => a.status === 'concluido').forEach((a) => push(a.clientId, parseISO(a.dueAt || a.updatedAt || a.createdAt)));
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

  const tipoOpcoes = useMemo(() => [...new Set(itens.map((i) => i.tipoLabel))].sort(), [itens]);

  const itensFiltrados = useMemo(() => {
    const termo = fCliente.trim().toLowerCase();
    return itens
      .filter((i) => !termo || nomeCliente(i.clientId).toLowerCase().includes(termo))
      .filter((i) => fTipos.length === 0 || fTipos.includes(i.tipoLabel))
      .filter((i) => fOrigem.length === 0 || fOrigem.includes(i.origem));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens, fCliente, fTipos, fOrigem, clientes]);

  const produtos = (c: Cliente) => {
    const out: string[] = [];
    const has = (re: RegExp, f: keyof Cliente) => (c.servicos ?? []).some((s) => re.test(s)) || Boolean(c[f]);
    if (has(/monitor/i, 'monitoria')) out.push('Monitoria');
    if (has(/(price|prec)/i, 'price')) out.push('Price');
    return out;
  };

  function CardCliente({ c, comHistorico }: { c: Cliente; comHistorico?: boolean }) {
    const u = info.ult.get(c.id) ?? null;
    const hist = (itensPorCliente.get(c.id) ?? []).slice(0, 3);
    return (
      <div className="glass-card glass-card-flat acao-card">
        <div className="acao-card-head">
          <div style={{ minWidth: 0 }}>
            <button className="link-button" style={{ fontWeight: 600, fontSize: '1rem' }} onClick={() => navigate(`/clientes/${c.id}`)}>{c.empresa}</button>
            <div className="acao-card-badges">
              {c.atendidoMarco && <span className="badge badge-accent">Marco</span>}
              {produtos(c).map((p) => <span key={p} className="badge badge-muted">{p}</span>)}
            </div>
          </div>
          <span className="acao-tipo">{c.monitor || 'sem monitor'}</span>
        </div>

        <div className="acao-card-info">
          <span className="acao-dot is-ok" />
          {u ? <>Último contato · {rotuloData(u)}{info.nReun.get(c.id) ? ` · ${info.nReun.get(c.id)} reuniões` : ''}</> : 'Sem registro de contato'}
        </div>

        {comHistorico && (
          <div className="acao-hist">
            <span className="acao-hist-label">Últimas ações</span>
            {hist.length === 0 ? <span className="text-muted" style={{ fontSize: 12 }}>Nenhuma ação.</span> :
              hist.map((i) => (
                <div key={i.key} className="acao-hist-item">
                  <span>{i.tipoLabel}</span>
                  <span className="text-muted">{format(i.date, 'dd/MM/yy')}</span>
                  <span className={`badge ${i.statusBadge}`}>{i.statusLabel}</span>
                </div>
              ))}
            <div className="acao-sug">
              <span className="acao-hist-label">Sugestões</span>
              {sugestoes(u).map((t) => (
                <button key={t} className="chip-toggle" onClick={() => setModal({ modo: 'nova', clienteId: c.id, tipo: t })}>+ {ACAO_TIPO_LABEL[t]}</button>
              ))}
            </div>
          </div>
        )}

        <div className="acao-card-actions">
          <button className="btn btn-primary" onClick={() => setModal({ modo: 'nova', clienteId: c.id })}><Plus size={14} /> Registrar</button>
          <button className="btn btn-secondary" onClick={() => setModal({ modo: 'agendar', clienteId: c.id })}><CalendarPlus size={14} /> Agendar</button>
        </div>
      </div>
    );
  }

  function Grupo({ titulo, sub, lista, comHistorico }: { titulo: string; sub: string; lista: Cliente[]; comHistorico?: boolean }) {
    return (
      <div className="section">
        <div className="section-header">
          <h3>{titulo} <span className="text-muted" style={{ fontWeight: 400, fontSize: 13 }}>· {sub}</span></h3>
          <span className="text-muted" style={{ fontSize: 12 }}>{lista.length}</span>
        </div>
        {lista.length === 0 ? <div className="glass-card glass-card-flat"><div className="empty-state">Nenhum cliente.</div></div> : (
          <div className="acao-grid">{lista.map((c) => <CardCliente key={c.id} c={c} comHistorico={comHistorico} />)}</div>
        )}
      </div>
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
          <Grupo titulo="Recorrentes" sub={`reuniões nos últimos ${JANELA} dias`} lista={recorrentes} comHistorico />
          <Grupo titulo="Sem contato" sub={`+${JANELA} dias sem contato`} lista={semContato} />
          <Grupo titulo="Atendidos pelo Marco" sub="fora da monitoria" lista={marco} />
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
            </div>
          </div>

          <div className="glass-card glass-card-flat" style={{ padding: 0, overflow: 'hidden' }}>
            {itensFiltrados.length === 0 ? <div className="empty-state" style={{ padding: '2rem' }}>Nenhuma ação encontrada.</div> : (
              <table className="data-table">
                <thead><tr><th>Data</th><th>Cliente</th><th>Tipo</th><th>Origem</th><th>Status</th><th>Observação</th><th></th></tr></thead>
                <tbody>
                  {itensFiltrados.map((i) => (
                    <tr key={i.key}>
                      <td style={{ whiteSpace: 'nowrap' }}>{format(i.date, 'dd/MM/yy', { locale: ptBR })}</td>
                      <td><button className="link-button" onClick={() => navigate(`/clientes/${i.clientId}`)}>{nomeCliente(i.clientId)}</button></td>
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
                              <button className="btn btn-danger btn-icon" title="Excluir" onClick={() => { if (confirm('Excluir esta ação?')) removerAcao(i.refId); }}><Trash2 size={13} /></button>
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
