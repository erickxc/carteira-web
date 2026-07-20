import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  addDays, differenceInCalendarDays, eachMonthOfInterval, format, isSameMonth,
  max as maxDate, min as minDate, parseISO, setHours, setMinutes, startOfMonth, subMonths,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarCheck, CalendarClock, Users } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { StatCard } from '../components/StatCard';
import { Dropdown } from '../components/Dropdown';
import { CoberturaCard } from '../components/dashboard/CoberturaCard';
import { ServicosCard } from '../components/dashboard/ServicosCard';
import { ProximasAgendasCard } from '../components/dashboard/ProximasAgendasCard';
import { AlertasSemAcompanhamentoCard } from '../components/dashboard/AlertasSemAcompanhamentoCard';
import { AlertasProgramadosCard } from '../components/dashboard/AlertasProgramadosCard';
import { TendenciaMensalCard } from '../components/dashboard/TendenciaMensalCard';
import { isStatusAtivo } from '../utils/formatters';
import { buildUltimaInteracaoMap } from '../utils/ultimaInteracao';
import type { Cliente } from '../types';

const FOLLOW_UP_THRESHOLD_DAYS = 30;
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

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
  const ultimaInteracao = useMemo(
    () => buildUltimaInteracaoMap(agendaAtiva, acoes, { now: hoje, isRelevant: (cid) => ativosIds.has(cid) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agendaAtiva, acoes, ativosIds]
  );

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
      { label: 'Monitoria', re: /monitor/i, tema: /reuni/i, flag: 'monitoria', color: 'var(--accent)' },
      { label: 'Price', re: /(price|prec)/i, tema: /(price|prec)/i, flag: 'price', color: 'var(--accent-tertiary)' },
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

  return (
    <div className="page-container">
      <div className="flex-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>Visão geral da carteira de monitoria — 2D Consultores.</p>
        </div>
        <div className="flex-row" style={{ gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div style={{ minWidth: 160 }}>
            <Dropdown
              label="Todos os monitores"
              defaultValue="Todos"
              options={monitoresDisponiveis.map((m) => ({ value: m, label: m === 'Todos' ? 'Todos os monitores' : m }))}
              value={filtroMonitor}
              onChange={(v) => setFiltroMonitor(v as string)}
            />
          </div>
          <div style={{ minWidth: 150 }}>
            <Dropdown
              label="Todos os tipos"
              defaultValue="Todos"
              options={tiposEventoDisponiveis.map((t) => ({ value: t, label: t === 'Todos' ? 'Todos os tipos' : t }))}
              value={filtroTipoEvento}
              onChange={(v) => setFiltroTipoEvento(v as string)}
            />
          </div>
          <div style={{ minWidth: 130 }}>
            <Dropdown
              label={MESES[mes]}
              options={MESES.map((nome, i) => ({ value: String(i), label: nome }))}
              value={String(mes)}
              onChange={(v) => setMes(Number(v))}
            />
          </div>
          <div style={{ minWidth: 90 }}>
            <Dropdown
              label={String(ano)}
              options={anosDisponiveis.map((a) => ({ value: String(a), label: String(a) }))}
              value={String(ano)}
              onChange={(v) => setAno(Number(v))}
            />
          </div>
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

        <CoberturaCard
          total={cobertura.total}
          cobertos={cobertura.cobertos}
          semContato={cobertura.semContato}
          pct={cobertura.pct}
          mesAno={`${MESES[mes].slice(0, 3)}/${ano}`}
        />
      </div>

      {/* Serviços + próximas agendas */}
      <div className="dash-two-col">
        <ServicosCard totalAtendidos={totalAtendidos} servicosDist={servicosDist} />

        <ProximasAgendasCard
          tiposDisponiveis={tiposDisponiveis}
          filtroTipo={filtroTipo}
          onFiltroTipo={setFiltroTipo}
          proximos={proximos}
          onVerAgenda={() => navigate('/agenda')}
          onSelecionarEvento={(ev) => navigate('/agenda', { state: { focusDate: ev.date } })}
        />
      </div>

      {/* Alertas */}
      <div className="dash-two-col">
        <AlertasSemAcompanhamentoCard
          alertas={alertas}
          followUpDays={FOLLOW_UP_THRESHOLD_DAYS}
          programados={programados}
          onAbrirCliente={(clienteId) => navigate(`/clientes/${clienteId}`)}
          onProgramarRelatorio={programarRelatorio}
        />

        <AlertasProgramadosCard
          alertasProgramados={alertasProgramados}
          nomeCliente={(clientId) => clientes.find((c) => c.id === clientId)?.empresa}
        />
      </div>

      {/* Tendência mensal (fim da página) */}
      <TendenciaMensalCard linhaPorMes={linhaPorMes} linhaHighlight={linhaHighlight} />
    </div>
  );
}
