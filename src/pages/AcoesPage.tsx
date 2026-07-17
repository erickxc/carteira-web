import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarPlus, Check, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { AcaoFormModal } from '../components/AcaoFormModal';
import { isStatusAtivo } from '../utils/formatters';
import { ACAO_TIPO_LABEL, SEGMENTO_LABEL, type Acao, type AcaoTipo, type Cliente, type Modelo, type Segmento } from '../types';

const JANELA_RECORRENTE = 60;

const STATUS_BADGE: Record<string, string> = {
  programado: 'badge-accent',
  concluido: 'badge-success',
  dispensado: 'badge-muted',
};
const STATUS_LABEL: Record<string, string> = {
  programado: 'Programada',
  concluido: 'Concluída',
  dispensado: 'Dispensada',
};

function rotuloData(d: Date): string {
  const dias = differenceInCalendarDays(new Date(), d);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias > 0 && dias <= 30) return `há ${dias} dias`;
  return format(d, 'dd/MM/yyyy');
}

function MaterialModal({ segmento, empresa, modelos, onClose }: { segmento: Segmento; empresa: string; modelos: Modelo[]; onClose: () => void }) {
  const doSegmento = modelos.filter((m) => m.segmento === segmento);
  const [copiado, setCopiado] = useState<string | null>(null);
  function copiar(m: Modelo) {
    navigator.clipboard?.writeText(m.conteudo.replaceAll('{empresa}', empresa)).then(() => {
      setCopiado(m.id); setTimeout(() => setCopiado(null), 1500);
    });
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Materiais — {SEGMENTO_LABEL[segmento]}</h2>
          <button className="btn btn-secondary btn-icon" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">
          {doSegmento.length === 0 ? (
            <div className="empty-state">Nenhum modelo para este segmento. Cadastre em Configurações.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {doSegmento.map((m) => (
                <div key={m.id} className="glass-card glass-card-flat" style={{ padding: 14 }}>
                  <div className="flex-between" style={{ marginBottom: 8 }}>
                    <strong>{m.titulo}</strong>
                    <button className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: 12 }} onClick={() => copiar(m)}>
                      {copiado === m.id ? <><Check size={13} /> Copiado</> : 'Copiar'}
                    </button>
                  </div>
                  <p className="text-muted" style={{ fontSize: 13, margin: 0, whiteSpace: 'pre-wrap' }}>{m.conteudo.replaceAll('{empresa}', empresa)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AcoesPage() {
  const { clientes, agenda, acoes, modelos, atualizarAcao, removerAcao } = useCarteira();
  const navigate = useNavigate();
  const [aba, setAba] = useState<'acoes' | 'acompanhamento'>('acompanhamento');
  const [modal, setModal] = useState<{ modo: 'nova' | 'agendar'; clienteId?: string; tipo?: AcaoTipo } | null>(null);
  const [material, setMaterial] = useState<{ segmento: Segmento; empresa: string } | null>(null);

  const nomeCliente = (id: string) => clientes.find((c) => c.id === id)?.empresa ?? '—';

  // Última interação por cliente = reuniões passadas + ações concluídas.
  const ultimaInteracao = useMemo(() => {
    const m = new Map<string, { date: Date; tipo: string }>();
    const push = (cid: string, date: Date, tipo: string) => {
      if (isNaN(date.getTime()) || date > new Date()) return;
      const cur = m.get(cid);
      if (!cur || date > cur.date) m.set(cid, { date, tipo });
    };
    agenda.forEach((a) => push(a.clientId, parseISO(a.date), a.type || 'Reunião'));
    acoes.filter((a) => a.status === 'concluido').forEach((a) => push(a.clientId, parseISO(a.dueAt || a.updatedAt || a.createdAt), ACAO_TIPO_LABEL[a.tipo] ?? 'Ação'));
    return m;
  }, [agenda, acoes]);

  // Segmentação da carteira ativa em Recorrentes (ação ≤60d, não-Marco) e Neutros.
  const { recorrentes, neutros } = useMemo(() => {
    const ativos = clientes.filter((c) => isStatusAtivo(c.status));
    const rec: { cliente: Cliente; ult: { date: Date; tipo: string } }[] = [];
    const neu: { cliente: Cliente; ult: { date: Date; tipo: string } | null; motivo: string }[] = [];
    ativos.forEach((c) => {
      const ult = ultimaInteracao.get(c.id) ?? null;
      if (c.atendidoMarco) { neu.push({ cliente: c, ult, motivo: 'Atendido pelo Marco' }); return; }
      if (ult && differenceInCalendarDays(new Date(), ult.date) <= JANELA_RECORRENTE) {
        rec.push({ cliente: c, ult });
      } else {
        neu.push({ cliente: c, ult, motivo: ult ? `Sem ação há +${JANELA_RECORRENTE} dias` : 'Nunca atendido' });
      }
    });
    rec.sort((a, b) => b.ult.date.getTime() - a.ult.date.getTime());
    neu.sort((a, b) => (b.ult?.date.getTime() ?? 0) - (a.ult?.date.getTime() ?? 0));
    return { recorrentes: rec, neutros: neu };
  }, [clientes, ultimaInteracao]);

  const acoesOrdenadas = useMemo(
    () => [...acoes].sort((a, b) => parseISO(b.dueAt || b.createdAt).getTime() - parseISO(a.dueAt || a.createdAt).getTime()),
    [acoes]
  );

  function produtos(c: Cliente): string[] {
    const out: string[] = [];
    const has = (re: RegExp, flag: keyof Cliente) => (c.servicos ?? []).some((s) => re.test(s)) || Boolean(c[flag]);
    if (has(/monitor/i, 'monitoria')) out.push('Monitoria');
    if (has(/(price|prec)/i, 'price')) out.push('Price');
    return out;
  }

  return (
    <div className="page-container">
      <div className="flex-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Ação</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>Registro de ações e acompanhamento da carteira.</p>
        </div>
      </div>

      <div className="tabs" style={{ margin: '1.25rem 0 1.5rem' }}>
        <button className={`tab${aba === 'acompanhamento' ? ' is-active' : ''}`} onClick={() => setAba('acompanhamento')}>Acompanhamento</button>
        <button className={`tab${aba === 'acoes' ? ' is-active' : ''}`} onClick={() => setAba('acoes')}>Ações</button>
      </div>

      {aba === 'acoes' ? (
        <>
          <div className="flex-row" style={{ gap: 8, marginBottom: 16 }}>
            <button className="btn btn-primary" onClick={() => setModal({ modo: 'nova' })}><Plus size={16} /> Nova ação</button>
            <button className="btn btn-secondary" onClick={() => setModal({ modo: 'agendar' })}><CalendarPlus size={16} /> Agendar ação</button>
          </div>

          <div className="glass-card glass-card-flat" style={{ padding: 0, overflow: 'hidden' }}>
            {acoesOrdenadas.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem' }}>Nenhuma ação registrada ainda.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Data</th><th>Cliente</th><th>Tipo</th><th>Status</th><th>Observação</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {acoesOrdenadas.map((a: Acao) => {
                    const d = parseISO(a.dueAt || a.createdAt);
                    return (
                      <tr key={a.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{format(d, 'dd/MM/yy', { locale: ptBR })}</td>
                        <td>
                          <button className="link-button" onClick={() => navigate(`/clientes/${a.clientId}`)}>{nomeCliente(a.clientId)}</button>
                        </td>
                        <td>{ACAO_TIPO_LABEL[a.tipo] ?? a.tipo}</td>
                        <td><span className={`badge ${STATUS_BADGE[a.status] ?? 'badge-muted'}`}>{STATUS_LABEL[a.status] ?? a.status}</span></td>
                        <td className="text-muted" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.notes || '—'}</td>
                        <td>
                          <div className="flex-row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                            {a.status === 'programado' && (
                              <button className="btn btn-secondary btn-icon" title="Concluir" onClick={() => atualizarAcao(a.id, { status: 'concluido' })}><Check size={14} /></button>
                            )}
                            <button className="btn btn-danger btn-icon" title="Excluir" onClick={() => { if (confirm('Excluir esta ação?')) removerAcao(a.id); }}><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Recorrentes */}
          <div className="section">
            <div className="section-header">
              <h3>Recorrentes <span className="text-muted" style={{ fontWeight: 400, fontSize: 13 }}>· ação nos últimos {JANELA_RECORRENTE} dias</span></h3>
              <span className="text-muted" style={{ fontSize: 12 }}>{recorrentes.length}</span>
            </div>
            {recorrentes.length === 0 ? (
              <div className="glass-card glass-card-flat"><div className="empty-state">Nenhum cliente com ação recente.</div></div>
            ) : (
              <div className="acao-grid">
                {recorrentes.map(({ cliente, ult }) => (
                  <div key={cliente.id} className="glass-card glass-card-flat acao-card">
                    <div className="acao-card-head">
                      <div style={{ minWidth: 0 }}>
                        <button className="link-button" style={{ fontWeight: 600, fontSize: '1rem' }} onClick={() => navigate(`/clientes/${cliente.id}`)}>{cliente.empresa}</button>
                        <div className="acao-card-badges">
                          {produtos(cliente).map((p) => <span key={p} className="badge badge-muted">{p}</span>)}
                        </div>
                      </div>
                      <span className="acao-tipo">{cliente.monitor || 'sem monitor'}</span>
                    </div>
                    <div className="acao-card-info">
                      <span className="acao-dot is-ok" /> Última ação: <strong>{ult.tipo}</strong> · {rotuloData(ult.date)}
                    </div>
                    <div className="acao-card-actions">
                      <button className="btn btn-primary" onClick={() => setModal({ modo: 'nova', clienteId: cliente.id })}><Plus size={14} /> Registrar ação</button>
                      <button className="btn btn-secondary" onClick={() => setModal({ modo: 'agendar', clienteId: cliente.id })}><CalendarPlus size={14} /> Agendar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Neutros */}
          <div className="section">
            <div className="section-header">
              <h3>Clientes neutros <span className="text-muted" style={{ fontWeight: 400, fontSize: 13 }}>· sem ação há +{JANELA_RECORRENTE} dias ou do Marco</span></h3>
              <span className="text-muted" style={{ fontSize: 12 }}>{neutros.length}</span>
            </div>
            {neutros.length === 0 ? (
              <div className="glass-card glass-card-flat"><div className="empty-state">Nenhum cliente neutro — carteira toda em acompanhamento.</div></div>
            ) : (
              <div className="acao-grid">
                {neutros.map(({ cliente, ult, motivo }) => (
                  <div key={cliente.id} className="glass-card glass-card-flat acao-card">
                    <div className="acao-card-head">
                      <div style={{ minWidth: 0 }}>
                        <button className="link-button" style={{ fontWeight: 600, fontSize: '1rem' }} onClick={() => navigate(`/clientes/${cliente.id}`)}>{cliente.empresa}</button>
                        <div className="acao-card-badges">
                          <span className={`badge ${cliente.atendidoMarco ? 'badge-accent' : 'badge-warning'}`}>{motivo}</span>
                          {produtos(cliente).map((p) => <span key={p} className="badge badge-muted">{p}</span>)}
                        </div>
                      </div>
                      <span className="acao-tipo">{cliente.monitor || 'sem monitor'}</span>
                    </div>
                    <div className="acao-card-info text-muted">
                      {ult ? <>Última ação: {ult.tipo} · {rotuloData(ult.date)}</> : 'Sem registro de atendimento'}
                    </div>
                    <div className="acao-card-actions">
                      <button className="btn btn-primary" onClick={() => setModal({ modo: 'nova', clienteId: cliente.id })}><Plus size={14} /> Registrar ação</button>
                      <button className="btn btn-secondary" onClick={() => setModal({ modo: 'agendar', clienteId: cliente.id })}><CalendarPlus size={14} /> Agendar</button>
                      <button className="btn btn-secondary" onClick={() => setMaterial({ segmento: 'frio', empresa: cliente.empresa })}><Sparkles size={14} /> Material</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {modal && <AcaoFormModal modo={modal.modo} clienteId={modal.clienteId} tipoInicial={modal.tipo} onClose={() => setModal(null)} />}
      {material && <MaterialModal segmento={material.segmento} empresa={material.empresa} modelos={modelos} onClose={() => setMaterial(null)} />}
    </div>
  );
}
