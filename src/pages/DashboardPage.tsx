import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  addDays, differenceInCalendarDays, eachMonthOfInterval, format, isSameMonth, isToday, isTomorrow,
  max as maxDate, min as minDate, parseISO, setHours, setMinutes, startOfMonth, subMonths,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarCheck, CalendarClock, Check, FileText, Users } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { StatCard } from '../components/StatCard';
import { DonutChart } from '../components/DonutChart';
import { RadialStatRow } from '../components/RadialStatRow';
import { LineChart } from '../components/LineChart';
import { eventoStatusBadge } from '../utils/badges';
import { isStatusAtivo } from '../utils/formatters';
import type { Cliente } from '../types';

const FOLLOW_UP_THRESHOLD_DAYS = 30;
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function rotuloRelativo(iso: string): { texto: string; atrasado: boolean } {
  const d = parseISO(iso);
  const now = new Date();
  const dias = differenceInCalendarDays(d, now);
  if (dias < 0) return { texto: `atrasado · ${format(d, 'dd/MM')}`, atrasado: true };
  if (isToday(d)) return { texto: `hoje · ${format(d, 'HH:mm')}`, atrasado: false };
  if (isTomorrow(d)) return { texto: `amanhã · ${format(d, 'HH:mm')}`, atrasado: false };
  if (dias <= 7) return { texto: `em ${dias} dias`, atrasado: false };
  return { texto: format(d, 'dd/MM/yyyy'), atrasado: false };
}

export default function DashboardPage() {
  const { clientes, agenda, acoes, lembretes, criarLembrete } = useCarteira();
  const navigate = useNavigate();
  const [programados, setProgramados] = useState<Set<string>>(new Set());
  const [filtroTipo, setFiltroTipo] = useState<string>('Todos');
  const [filtroMonitor, setFiltroMonitor] = useState<string>('Todos');
  const [filtroTipoEvento, setFiltroTipoEvento] = useState<string>('Todos');

  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth());
  const [ano, setAno] = useState(hoje.getFullYear());
  const periodo = new Date(ano, mes, 1);
  const periodoAnterior = subMonths(periodo, 1);

  // Opções de filtro derivadas da base (não mostra opção que não existe nos dados).
  const monitoresDisponiveis = useMemo(
    () => ['Todos', ...[...new Set(clientes.filter((c) => isStatusAtivo(c.status)).map((c) => c.monitor).filter(Boolean))].sort()],
    [clientes]
  );
  const tiposEventoDisponiveis = useMemo(
    () => ['Todos', ...[...new Set(agenda.map((a) => a.type).filter(Boolean))].sort()],
    [agenda]
  );

  // Toda a operação considera apenas clientes ATIVOS (exclui suspensos), com os
  // filtros globais de Monitor (carteira) e Tipo de evento aplicados em cascata.
  const ativos = useMemo(
    () => clientes.filter((c) => isStatusAtivo(c.status) && (filtroMonitor === 'Todos' || c.monitor === filtroMonitor)),
    [clientes, filtroMonitor]
  );
  const ativosIds = useMemo(() => new Set(ativos.map((c) => c.id)), [ativos]);
  const agendaAtiva = useMemo(
    () => agenda.filter((a) => ativosIds.has(a.clientId) && (filtroTipoEvento === 'Todos' || a.type === filtroTipoEvento)),
    [agenda, ativosIds, filtroTipoEvento]
  );

  // Última interação por cliente ativo = reuniões passadas + AÇÕES concluídas.
  // É isto que "acompanhamento" considera — registrar uma ação (Contato/Relatório/
  // Price) conta como contato, não só reunião.
  const ultimaInteracao = useMemo(() => {
    const m = new Map<string, Date>();
    const push = (cid: string, d: Date) => {
      if (!ativosIds.has(cid) || isNaN(d.getTime()) || d > hoje) return;
      const cur = m.get(cid);
      if (!cur || d > cur) m.set(cid, d);
    };
    agendaAtiva.forEach((a) => push(a.clientId, parseISO(a.date)));
    acoes.filter((a) => a.status === 'concluido').forEach((a) => push(a.clientId, parseISO(a.dueAt || a.updatedAt || a.createdAt)));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendaAtiva, acoes, ativosIds]);

  const anosDisponiveis = useMemo(() => {
    const anos = new Set<number>([hoje.getFullYear()]);
    agendaAtiva.forEach((a) => { const d = parseISO(a.date); if (!isNaN(d.getTime())) anos.add(d.getFullYear()); });
    return [...anos].sort((a, b) => a - b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendaAtiva]);

  // --- KPIs (escopo do período, base de ativos) ---
  const reunioesMes = agendaAtiva.filter((a) => isSameMonth(parseISO(a.date), periodo)).length;
  const reunioesMesAnterior = agendaAtiva.filter((a) => isSameMonth(parseISO(a.date), periodoAnterior)).length;
  const variacao = reunioesMesAnterior === 0
    ? (reunioesMes > 0 ? 100 : 0)
    : Math.round(((reunioesMes - reunioesMesAnterior) / reunioesMesAnterior) * 100);
  const reunioesAgendadas = agendaAtiva.filter((a) => /agend/i.test(a.status || '') && differenceInCalendarDays(parseISO(a.date), hoje) >= 0).length;

  // --- Linha: reuniões por mês, desde o 1º mês com reunião até hoje/período ---
  const { linhaPorMes, linhaHighlight } = useMemo(() => {
    const datas = agendaAtiva.map((a) => parseISO(a.date)).filter((d) => !isNaN(d.getTime()));
    if (datas.length === 0) return { linhaPorMes: [], linhaHighlight: -1 };
    const inicio = startOfMonth(minDate(datas));
    const fim = startOfMonth(maxDate([...datas, hoje, periodo]));
    let meses = eachMonthOfInterval({ start: inicio, end: fim });
    if (meses.length > 24) meses = meses.slice(meses.length - 24); // teto de segurança
    const pts = meses.map((m, i) => ({
      label: m.getMonth() === 0 || i === 0 ? format(m, 'MMM/yy', { locale: ptBR }).replace('.', '') : format(m, 'MMM', { locale: ptBR }).replace('.', ''),
      full: format(m, "MMMM 'de' yyyy", { locale: ptBR }),
      value: agendaAtiva.filter((a) => isSameMonth(parseISO(a.date), m)).length,
    }));
    const hi = meses.findIndex((m) => isSameMonth(m, periodo));
    return { linhaPorMes: pts, linhaHighlight: hi };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendaAtiva, mes, ano]);

  // --- Serviços da carteira: % dos clientes ATENDIDOS por produto CONTRATADO ---
  // "Atendido" = cliente ativo com interação (reunião OU ação) nos últimos 60 dias.
  // O produto vem exclusivamente do CADASTRO do cliente (servicos/flags) — não do
  // que foi tratado. Serviços não são exclusivos (vários por cliente) → anel, não pizza.
  const { servicosDist, totalAtendidos } = useMemo(() => {
    const JANELA = 60;
    const atendidos = ativos.filter((c) => {
      const uc = ultimaInteracao.get(c.id);
      return uc != null && differenceInCalendarDays(hoje, uc) <= JANELA;
    });
    const total = atendidos.length;

    const temProduto = (c: Cliente, re: RegExp, flag: keyof Cliente) =>
      (c.servicos ?? []).some((s) => re.test(s)) || Boolean(c[flag]);

    // Top clientes por tema da reunião (type do evento bate com o produto) — não pelo total geral de reuniões.
    function topClientesPorTema(re: RegExp) {
      const contagem = new Map<string, number>();
      agendaAtiva.forEach((a) => { if (re.test(a.type || '')) contagem.set(a.clientId, (contagem.get(a.clientId) ?? 0) + 1); });
      return [...contagem.entries()]
        .map(([clientId, n]) => ({ empresa: clientes.find((c) => c.id === clientId)?.empresa ?? '—', n }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 3);
    }

    // `re` casa com o cadastro do cliente (servicos/flag); `tema` casa com o TIPO do
    // evento na agenda — os tipos de evento são Reunião/Precificação/Contato/Relatório,
    // não "Monitoria", então o tema de uma reunião de monitoria é "Reunião".
    const defs: { label: string; re: RegExp; tema: RegExp; flag: keyof Cliente; color: string }[] = [
      { label: 'Monitoria', re: /monitor/i, tema: /reuni/i, flag: 'monitoria', color: '#bd952f' },
      { label: 'Price', re: /(price|prec)/i, tema: /(price|prec)/i, flag: 'price', color: '#9a9aa4' },
    ];
    const dist = defs.map((d) => {
      const n = atendidos.filter((c) => temProduto(c, d.re, d.flag)).length;
      return { label: d.label, n, pct: total > 0 ? Math.round((n / total) * 100) : 0, color: d.color, top: topClientesPorTema(d.tema) };
    });
    return { servicosDist: dist, totalAtendidos: total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativos, ultimaInteracao, agendaAtiva, clientes]);

  // --- Cobertura da carteira no período: clientes ativos com >= 1 reunião no mês ---
  const cobertura = useMemo(() => {
    const atendidosIds = new Set(
      agendaAtiva.filter((a) => isSameMonth(parseISO(a.date), periodo)).map((a) => a.clientId)
    );
    const cobertos = ativos.filter((c) => atendidosIds.has(c.id)).length;
    const total = ativos.length;
    const pct = total > 0 ? Math.round((cobertos / total) * 100) : 0;
    return { cobertos, semContato: total - cobertos, total, pct };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendaAtiva, ativos, mes, ano]);

  // --- Próximas agendas (forward-looking) ---
  const tiposDisponiveis = useMemo(() => ['Todos', ...new Set(agendaAtiva.map((a) => a.type).filter(Boolean))], [agendaAtiva]);
  const proximos = useMemo(() =>
    agendaAtiva
      .filter((a) => differenceInCalendarDays(parseISO(a.date), hoje) >= 0)
      .filter((a) => filtroTipo === 'Todos' || a.type === filtroTipo)
      .sort((a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime())
      .slice(0, 5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agendaAtiva, filtroTipo]);

  // --- Alertas de acompanhamento (reunião OU ação concluída) ---
  const alertas = ativos
    .map((cliente) => {
      const uc = ultimaInteracao.get(cliente.id);
      const dias = uc ? differenceInCalendarDays(hoje, uc) : null;
      return { cliente, uc, dias };
    })
    .filter((e) => e.dias === null || e.dias >= FOLLOW_UP_THRESHOLD_DAYS)
    .sort((a, b) => (b.dias ?? 99999) - (a.dias ?? 99999))
    .slice(0, 6);

  const alertasProgramados = lembretes
    .filter((r) => r.status === 'ativo')
    .sort((a, b) => parseISO(a.datetime).getTime() - parseISO(b.datetime).getTime())
    .slice(0, 6);

  async function programarRelatorio(cliente: Cliente) {
    const quando = setMinutes(setHours(addDays(hoje, 1), 9), 0);
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

  function severidade(dias: number | null): string {
    if (dias === null || dias >= 60) return 'badge-danger';
    return 'badge-warning';
  }

  return (
    <div className="page-container">
      <div className="flex-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>Visão geral da carteira de monitoria — 2D Consultores.</p>
        </div>
        <div className="flex-row" style={{ gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <select className="custom-select" style={{ width: 'auto' }} value={filtroMonitor} onChange={(e) => setFiltroMonitor(e.target.value)} title="Filtrar por monitor">
            {monitoresDisponiveis.map((m) => <option key={m} value={m}>{m === 'Todos' ? 'Todos os monitores' : m}</option>)}
          </select>
          <select className="custom-select" style={{ width: 'auto' }} value={filtroTipoEvento} onChange={(e) => setFiltroTipoEvento(e.target.value)} title="Filtrar por tipo de evento">
            {tiposEventoDisponiveis.map((t) => <option key={t} value={t}>{t === 'Todos' ? 'Todos os tipos' : t}</option>)}
          </select>
          <select className="custom-select" style={{ width: 'auto' }} value={mes} onChange={(e) => setMes(Number(e.target.value))}>
            {MESES.map((nome, i) => <option key={i} value={i}>{nome}</option>)}
          </select>
          <select className="custom-select" style={{ width: 'auto' }} value={ano} onChange={(e) => setAno(Number(e.target.value))}>
            {anosDisponiveis.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* Topo: KPIs + Cobertura lado a lado */}
      <div className="dash-hero">
        <div className="stat-grid">
          <StatCard title="Clientes ativos" value={ativos.length} icon={Users} onClick={() => navigate('/clientes')} />
          <StatCard
            title={`Reuniões em ${MESES[mes].slice(0, 3)}/${ano}`}
            value={reunioesMes}
            icon={CalendarCheck}
            trend={`${Math.abs(variacao)}% vs mês anterior`}
            trendUp={variacao === 0 ? undefined : variacao > 0}
          />
          <StatCard title="Reuniões agendadas" value={reunioesAgendadas} icon={CalendarClock} onClick={() => navigate('/agenda')} />
        </div>

        <div className="glass-card cobertura-card">
          <div className="section-header">
            <h3>Cobertura da Carteira</h3>
            <span className="text-muted" style={{ fontSize: 12 }}>{MESES[mes].slice(0, 3)}/{ano} · {cobertura.total} ativos</span>
          </div>
          {cobertura.total === 0 ? (
            <div className="empty-state">Nenhum cliente ativo.</div>
          ) : (
            <DonutChart
              items={[
                { label: 'Atendidos', value: cobertura.cobertos },
                { label: 'Sem contato', value: cobertura.semContato },
              ]}
              colors={['#bd952f', '#3c3c44']}
              centerValue={`${cobertura.pct}%`}
              centerLabel="cobertura"
              size={96}
              thickness={13}
            />
          )}
        </div>
      </div>

      {/* Serviços + próximas agendas */}
      <div className="dash-two-col">
        <div className="glass-card">
          <div className="section-header">
            <h3>Serviços dos Clientes Atendidos</h3>
            <span className="text-muted" style={{ fontSize: 12 }}>reunião ou ação · últ. 60 dias · {totalAtendidos}</span>
          </div>
          {totalAtendidos === 0 ? (
            <div className="empty-state">Nenhum cliente atendido nos últimos 60 dias.</div>
          ) : (
            <RadialStatRow items={servicosDist} />
          )}
        </div>

        <div className="glass-card">
          <div className="section-header">
            <h3>Próximas Agendas</h3>
            <button className="link-button" style={{ fontSize: 12 }} onClick={() => navigate('/agenda')}>ver agenda →</button>
          </div>
          <div className="chip-row">
            {tiposDisponiveis.map((t) => (
              <button key={t} className={`chip${filtroTipo === t ? ' is-active' : ''}`} onClick={() => setFiltroTipo(t)}>{t}</button>
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

      {/* Alertas */}
      <div className="dash-two-col">
        <div className="glass-card">
          <div className="section-header">
            <h3>Clientes sem Acompanhamento</h3>
            <span className="text-muted" style={{ fontSize: 12 }}>{FOLLOW_UP_THRESHOLD_DAYS}+ dias sem contato</span>
          </div>
          {alertas.length === 0 ? (
            <div className="empty-state">Nenhum alerta — carteira em dia.</div>
          ) : (
            <div className="agenda-preview">
              {alertas.map(({ cliente, uc, dias }) => (
                <div key={cliente.id} className="agenda-row" style={{ cursor: 'default' }}>
                  <span className="agenda-row-main">
                    <button className="link-button agenda-row-title" style={{ textAlign: 'left' }} onClick={() => navigate(`/clientes/${cliente.id}`)}>
                      {cliente.empresa}
                    </button>
                    <span className="agenda-row-sub">
                      {cliente.monitor || 'sem monitor'} · {uc ? `últ. contato ${format(uc, 'dd/MM/yy')}` : 'sem registro'}
                    </span>
                  </span>
                  <span className={`badge ${severidade(dias)}`} style={{ flexShrink: 0 }}>
                    {dias === null ? 'Sem histórico' : `${dias} dias`}
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
            <span className="text-muted" style={{ fontSize: 12 }}>próximos disparos</span>
          </div>
          {alertasProgramados.length === 0 ? (
            <div className="empty-state">Nenhum alerta programado.</div>
          ) : (
            <div className="agenda-preview">
              {alertasProgramados.map((r) => {
                const cliente = r.clientId ? clientes.find((c) => c.id === r.clientId) : undefined;
                const rel = rotuloRelativo(r.datetime);
                const isRelatorio = /relat/i.test(r.type || '');
                return (
                  <div key={r.id} className="agenda-row" style={{ cursor: 'default' }}>
                    <span className="agenda-row-main">
                      <span className="agenda-row-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {r.type && <span className={`badge ${isRelatorio ? 'badge-warning' : 'badge-accent'}`}>{r.type}</span>}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                      </span>
                      <span className="agenda-row-sub">{cliente ? cliente.empresa : 'geral'}</span>
                    </span>
                    <span className={`badge ${rel.atrasado ? 'badge-danger' : 'badge-muted'}`} style={{ flexShrink: 0 }}>{rel.texto}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Tendência mensal (fim da página) */}
      <div className="section glass-card">
        <div className="section-header">
          <h3>Reuniões por Mês</h3>
          <span className="text-muted" style={{ fontSize: 12 }}>desde a primeira reunião</span>
        </div>
        <LineChart points={linhaPorMes} highlightIndex={linhaHighlight} />
      </div>
    </div>
  );
}
