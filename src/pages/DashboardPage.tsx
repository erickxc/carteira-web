import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, differenceInCalendarDays, format, isFuture, isToday, parseISO, setHours, setMinutes } from 'date-fns';
import { AlertTriangle, Bell, CalendarClock, Check, FileText, Users } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { StatCard } from '../components/StatCard';
import { clienteStatusBadge, eventoStatusBadge } from '../utils/badges';
import type { Cliente } from '../types';

const FOLLOW_UP_THRESHOLD_DAYS = 30;
const STATUS_ATIVO = /(ativ|normaliz|em dia)/i;
const EVENTO_PENDENTE = /(agend|pendent)/i;

export default function DashboardPage() {
  const { clientes, agenda, lembretes, opcoesPorTipo, criarLembrete } = useCarteira();
  const navigate = useNavigate();
  const statusOpcoes = opcoesPorTipo('status_cliente');
  const [programados, setProgramados] = useState<Set<string>>(new Set());

  // 1 clique: cria um alerta de "Relatório" para um cliente pouco acompanhado.
  async function programarRelatorio(cliente: Cliente) {
    const quando = setMinutes(setHours(addDays(new Date(), 1), 9), 0); // amanhã 09:00
    await criarLembrete({
      title: `Enviar relatório — ${cliente.empresa}`,
      type: 'Relatório',
      datetime: quando.toISOString(),
      clientId: cliente.id,
      recurrence: 'none',
      description: 'Cliente com pouco acompanhamento — enviar relatório.',
    });
    setProgramados((prev) => new Set(prev).add(cliente.id));
  }

  const ultimoContatoPorCliente = new Map<string, Date>();
  agenda.forEach((item) => {
    const atual = ultimoContatoPorCliente.get(item.clientId);
    const dataItem = parseISO(item.date);
    if (!atual || dataItem > atual) ultimoContatoPorCliente.set(item.clientId, dataItem);
  });

  // Alertas: clientes considerados "ativos/em dia" sem contato recente.
  const alertasAcompanhamento = clientes
    .filter((c) => STATUS_ATIVO.test(c.status || ''))
    .map((cliente) => {
      const ultimoContato = ultimoContatoPorCliente.get(cliente.id);
      const diasSemContato = ultimoContato ? differenceInCalendarDays(new Date(), ultimoContato) : null;
      return { cliente, diasSemContato };
    })
    .filter((entry) => entry.diasSemContato === null || entry.diasSemContato >= FOLLOW_UP_THRESHOLD_DAYS)
    .sort((a, b) => (b.diasSemContato ?? 9999) - (a.diasSemContato ?? 9999));

  const proximosEventos = agenda
    .filter((item) => EVENTO_PENDENTE.test(item.status || '') && (isFuture(parseISO(item.date)) || isToday(parseISO(item.date))))
    .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime())
    .slice(0, 6);

  const lembretesAtivos = lembretes
    .filter((r) => r.status === 'ativo')
    .sort((a, b) => parseISO(a.datetime).getTime() - parseISO(b.datetime).getTime())
    .slice(0, 6);

  const inadimplentes = clientes.filter((c) => /(inadimpl|suspens)/i.test(c.status || '')).length;

  // Reuniões (eventos) por tipo — magnitude por categoria, ordenado desc.
  const reunioesPorTipo = (() => {
    const mapa = new Map<string, number>();
    agenda.forEach((a) => mapa.set(a.type || '—', (mapa.get(a.type || '—') ?? 0) + 1));
    const arr = [...mapa.entries()].map(([tipo, qtd]) => ({ tipo, qtd })).sort((a, b) => b.qtd - a.qtd);
    const max = arr.reduce((m, x) => Math.max(m, x.qtd), 0);
    return { arr, max };
  })();

  return (
    <div className="page-container">
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Visão geral da carteira de monitoria — 2D Consultores.</p>

      <div className="stat-grid">
        <StatCard title="Clientes na carteira" value={clientes.length} icon={Users} />
        <StatCard title="Inadimplentes / suspensos" value={inadimplentes} icon={AlertTriangle} trendUp={inadimplentes === 0} />
        <StatCard title="Eventos agendados" value={proximosEventos.length} icon={CalendarClock} />
        <StatCard title="Lembretes ativos" value={lembretes.filter((r) => r.status === 'ativo').length} icon={Bell} />
      </div>

      <div className="section glass-card">
        <div className="section-header">
          <h3>Reuniões por Tipo</h3>
          <span className="text-muted" style={{ fontSize: 12 }}>{agenda.length} evento(s) no total</span>
        </div>
        {reunioesPorTipo.arr.length === 0 ? (
          <div className="empty-state">Nenhum evento registrado.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {reunioesPorTipo.arr.map(({ tipo, qtd }) => (
              <div key={tipo} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 40px', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 14 }}>{tipo}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${reunioesPorTipo.max ? (qtd / reunioesPorTipo.max) * 100 : 0}%` }} />
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{qtd}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="section glass-card">
        <div className="section-header"><h3>Clientes por Status</h3></div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {statusOpcoes.map((st) => (
            <button key={st} onClick={() => navigate('/clientes')} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
              <span className={`badge ${clienteStatusBadge(st)}`}>
                {st}: {clientes.filter((c) => c.status === st).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="section glass-card">
        <div className="section-header">
          <h3>Alertas de Acompanhamento</h3>
          <span className="text-muted" style={{ fontSize: 12 }}>Sem contato há {FOLLOW_UP_THRESHOLD_DAYS}+ dias</span>
        </div>
        {alertasAcompanhamento.length === 0 ? (
          <div className="empty-state">Nenhum alerta — carteira em dia.</div>
        ) : (
          <div>
            {alertasAcompanhamento.slice(0, 8).map(({ cliente, diasSemContato }) => (
              <div key={cliente.id} className="flex-between" style={{ padding: '0.5rem', gap: 12 }}>
                <button
                  className="link-button"
                  onClick={() => navigate(`/clientes/${cliente.id}`)}
                  style={{ flex: 1, textAlign: 'left' }}
                >
                  {cliente.empresa} {cliente.monitor && <span className="text-muted">— {cliente.monitor}</span>}
                </button>
                <span className="badge badge-warning" style={{ flexShrink: 0 }}>
                  {diasSemContato === null ? 'Sem histórico' : `${diasSemContato} dias`}
                </span>
                {programados.has(cliente.id) ? (
                  <span className="badge badge-success" style={{ flexShrink: 0 }}><Check size={12} /> Programado</span>
                ) : (
                  <button
                    className="btn btn-secondary"
                    style={{ flexShrink: 0, padding: '0.35rem 0.7rem', fontSize: 12 }}
                    onClick={() => programarRelatorio(cliente)}
                    title="Programar alerta de envio de relatório"
                  >
                    <FileText size={13} /> Programar relatório
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="two-col-grid">
        <div className="glass-card">
          <div className="section-header"><h3>Próximos Eventos</h3></div>
          {proximosEventos.length === 0 ? (
            <div className="empty-state">Nenhum evento agendado.</div>
          ) : (
            <div>
              {proximosEventos.map((event) => (
                <button key={event.id} className="list-row" onClick={() => navigate('/agenda')}>
                  <span>{event.subject || event.clientName} <span className="text-muted">— {event.type}</span></span>
                  <span className={`badge ${eventoStatusBadge(event.status)}`}>{format(parseISO(event.date), 'dd/MM')}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card">
          <div className="section-header">
            <h3>Alertas Programados</h3>
            <span className="text-muted" style={{ fontSize: 12 }}>reunião · relatório · outros</span>
          </div>
          {lembretesAtivos.length === 0 ? (
            <div className="empty-state">Nenhum alerta programado.</div>
          ) : (
            <div>
              {lembretesAtivos.map((reminder) => {
                const cliente = reminder.clientId ? clientes.find((c) => c.id === reminder.clientId) : undefined;
                const isRelatorio = /relat/i.test(reminder.type || '');
                return (
                  <div key={reminder.id} className="flex-between" style={{ padding: '0.65rem 0.5rem', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="flex-row" style={{ gap: 6 }}>
                        {reminder.type && (
                          <span className={`badge ${isRelatorio ? 'badge-warning' : 'badge-accent'}`}>{reminder.type}</span>
                        )}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reminder.title}</span>
                      </div>
                      {cliente && <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>{cliente.empresa}</div>}
                    </div>
                    <span className="badge badge-muted" style={{ flexShrink: 0 }}>{format(parseISO(reminder.datetime), 'dd/MM HH:mm')}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
