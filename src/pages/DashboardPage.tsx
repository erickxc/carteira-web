import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addDays, differenceInCalendarDays, format, isSameMonth, parseISO, setHours, setMinutes, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarCheck, CalendarClock, Check, FileText, Users } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { StatCard } from '../components/StatCard';
import { DonutChart } from '../components/DonutChart';
import { eventoStatusBadge } from '../utils/badges';
import type { Cliente } from '../types';

const FOLLOW_UP_THRESHOLD_DAYS = 30;
const STATUS_ATIVO = /(ativ|normaliz|em dia)/i;

export default function DashboardPage() {
  const { clientes, agenda, lembretes, criarLembrete } = useCarteira();
  const navigate = useNavigate();
  const [programados, setProgramados] = useState<Set<string>>(new Set());
  const [filtroTipo, setFiltroTipo] = useState<string>('Todos');

  const now = new Date();
  const mesAnterior = subMonths(now, 1);

  // --- KPIs ---
  const reunioesMes = agenda.filter((a) => isSameMonth(parseISO(a.date), now)).length;
  const reunioesMesAnterior = agenda.filter((a) => isSameMonth(parseISO(a.date), mesAnterior)).length;
  const variacao = reunioesMesAnterior === 0
    ? (reunioesMes > 0 ? 100 : 0)
    : Math.round(((reunioesMes - reunioesMesAnterior) / reunioesMesAnterior) * 100);
  const reunioesAgendadas = agenda.filter((a) => /agend/i.test(a.status || '') && differenceInCalendarDays(parseISO(a.date), now) >= 0).length;

  // --- Donut: reuniões por tipo ---
  const reunioesPorTipo = useMemo(() => {
    const mapa = new Map<string, number>();
    agenda.forEach((a) => mapa.set(a.type || '—', (mapa.get(a.type || '—') ?? 0) + 1));
    return [...mapa.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [agenda]);

  // --- Prévia da agenda (próximos eventos) com filtro por tipo ---
  const tiposDisponiveis = useMemo(() => ['Todos', ...new Set(agenda.map((a) => a.type).filter(Boolean))], [agenda]);
  const proximos = useMemo(() => {
    return agenda
      .filter((a) => differenceInCalendarDays(parseISO(a.date), now) >= 0)
      .filter((a) => filtroTipo === 'Todos' || a.type === filtroTipo)
      .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime())
      .slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenda, filtroTipo]);

  // --- Alertas de acompanhamento ---
  const ultimoContatoPorCliente = new Map<string, Date>();
  agenda.forEach((item) => {
    const atual = ultimoContatoPorCliente.get(item.clientId);
    const dataItem = parseISO(item.date);
    if (!atual || dataItem > atual) ultimoContatoPorCliente.set(item.clientId, dataItem);
  });
  const alertasAcompanhamento = clientes
    .filter((c) => STATUS_ATIVO.test(c.status || ''))
    .map((cliente) => {
      const ultimoContato = ultimoContatoPorCliente.get(cliente.id);
      const diasSemContato = ultimoContato ? differenceInCalendarDays(now, ultimoContato) : null;
      return { cliente, diasSemContato };
    })
    .filter((e) => e.diasSemContato === null || e.diasSemContato >= FOLLOW_UP_THRESHOLD_DAYS)
    .sort((a, b) => (b.diasSemContato ?? 9999) - (a.diasSemContato ?? 9999));

  const lembretesAtivos = lembretes
    .filter((r) => r.status === 'ativo')
    .sort((a, b) => parseISO(a.datetime).getTime() - parseISO(b.datetime).getTime())
    .slice(0, 6);

  async function programarRelatorio(cliente: Cliente) {
    const quando = setMinutes(setHours(addDays(now, 1), 9), 0);
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

  return (
    <div className="page-container">
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Visão geral da carteira de monitoria — 2D Consultores.</p>

      {/* KPIs */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <StatCard title="Clientes na carteira" value={clientes.length} icon={Users} onClick={() => navigate('/clientes')} />
        <StatCard
          title="Reuniões no mês"
          value={reunioesMes}
          icon={CalendarCheck}
          trend={`${Math.abs(variacao)}% vs mês anterior`}
          trendUp={variacao === 0 ? undefined : variacao > 0}
        />
        <StatCard title="Reuniões agendadas" value={reunioesAgendadas} icon={CalendarClock} onClick={() => navigate('/agenda')} />
      </div>

      {/* Composição + prévia da agenda */}
      <div className="dash-two-col">
        <div className="glass-card">
          <div className="section-header">
            <h3>Reuniões por Tipo</h3>
            <span className="text-muted" style={{ fontSize: 12 }}>{agenda.length} no total</span>
          </div>
          {reunioesPorTipo.length === 0 ? (
            <div className="empty-state">Nenhum evento registrado.</div>
          ) : (
            <DonutChart items={reunioesPorTipo} centerValue={agenda.length} centerLabel="eventos" />
          )}
        </div>

        <div className="glass-card">
          <div className="section-header">
            <h3>Próximas Agendas</h3>
            <button className="link-button text-muted" style={{ fontSize: 12 }} onClick={() => navigate('/agenda')}>ver agenda →</button>
          </div>

          <div className="chip-row">
            {tiposDisponiveis.map((t) => (
              <button
                key={t}
                className={`chip${filtroTipo === t ? ' is-active' : ''}`}
                onClick={() => setFiltroTipo(t)}
              >
                {t}
              </button>
            ))}
          </div>

          {proximos.length === 0 ? (
            <div className="empty-state">Nenhuma agenda futura{filtroTipo !== 'Todos' ? ` de ${filtroTipo}` : ''}.</div>
          ) : (
            <div className="agenda-preview">
              {proximos.map((ev) => {
                const d = parseISO(ev.date);
                return (
                  <button key={ev.id} className="agenda-row" onClick={() => navigate('/agenda', { state: { focusDate: ev.date } })}>
                    <span className="date-badge">
                      <span className="date-badge-day">{format(d, 'dd')}</span>
                      <span className="date-badge-mon">{format(d, 'MMM', { locale: ptBR })}</span>
                    </span>
                    <span className="agenda-row-main">
                      <span className="agenda-row-title">{ev.subject || ev.clientName}</span>
                      <span className="agenda-row-sub">{ev.clientName}</span>
                    </span>
                    <span className="agenda-row-tags">
                      <span className="badge badge-accent">{ev.type}</span>
                      <span className={`badge ${eventoStatusBadge(ev.status)}`}>{ev.status}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Painéis operacionais */}
      <div className="dash-two-col">
        <div className="glass-card">
          <div className="section-header">
            <h3>Alertas de Acompanhamento</h3>
            <span className="text-muted" style={{ fontSize: 12 }}>sem contato há {FOLLOW_UP_THRESHOLD_DAYS}+ dias</span>
          </div>
          {alertasAcompanhamento.length === 0 ? (
            <div className="empty-state">Nenhum alerta — carteira em dia.</div>
          ) : (
            <div>
              {alertasAcompanhamento.slice(0, 6).map(({ cliente, diasSemContato }) => (
                <div key={cliente.id} className="flex-between" style={{ padding: '0.5rem', gap: 10 }}>
                  <button className="link-button" onClick={() => navigate(`/clientes/${cliente.id}`)} style={{ flex: 1, textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {cliente.empresa} {cliente.monitor && <span className="text-muted">— {cliente.monitor}</span>}
                  </button>
                  <span className="badge badge-warning" style={{ flexShrink: 0 }}>
                    {diasSemContato === null ? 'Sem histórico' : `${diasSemContato}d`}
                  </span>
                  {programados.has(cliente.id) ? (
                    <span className="badge badge-success" style={{ flexShrink: 0 }}><Check size={12} /> Programado</span>
                  ) : (
                    <button className="btn btn-secondary" style={{ flexShrink: 0, padding: '0.35rem 0.6rem', fontSize: 12 }} onClick={() => programarRelatorio(cliente)} title="Programar envio de relatório">
                      <FileText size={13} /> Relatório
                    </button>
                  )}
                </div>
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
                        {reminder.type && <span className={`badge ${isRelatorio ? 'badge-warning' : 'badge-accent'}`}>{reminder.type}</span>}
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
