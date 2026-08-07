import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isSameMonth } from 'date-fns';
import { CalendarCheck, CalendarClock, CalendarX2, Users } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { useDashboardData } from '../hooks/useDashboardData';
import { StatCard } from '../components/StatCard';
import { Dropdown } from '../components/Dropdown';
import { CoberturaCard } from '../components/dashboard/CoberturaCard';
import { AderenciaCard } from '../components/dashboard/AderenciaCard';
import { VencendoCard } from '../components/dashboard/VencendoCard';
import { ServicosCard } from '../components/dashboard/ServicosCard';
import { ProximasAgendasCard } from '../components/dashboard/ProximasAgendasCard';
import { AlertasSemAcompanhamentoCard } from '../components/dashboard/AlertasSemAcompanhamentoCard';
import { AlertasProgramadosCard } from '../components/dashboard/AlertasProgramadosCard';
import { TendenciaMensalCard } from '../components/dashboard/TendenciaMensalCard';
import { AbrangenciaMapaCard } from '../components/dashboard/AbrangenciaMapaCard';
import { ReminderFormModal } from '../components/ReminderFormModal';
import type { Cliente } from '../types';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function DashboardPage() {
  const { clientes } = useCarteira();
  const navigate = useNavigate();
  const [programados, setProgramados] = useState<Set<string>>(new Set());
  const [relatorioModal, setRelatorioModal] = useState<Cliente | null>(null);
  const d = useDashboardData();
  const hoje = new Date();

  // Abre o modal de lembrete pré-preenchido pra escolher dia/hora do envio do
  // relatório (antes criava fixo em amanhã 9h, sem escolha).
  function programarRelatorio(cliente: Cliente) {
    setRelatorioModal(cliente);
  }

  return (
    <div className="page-container">
      <div className="flex-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title">Visão Geral</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>Carteira de monitoria — 2D Consultores.</p>
        </div>
        <div className="flex-row" style={{ gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div style={{ minWidth: 160 }}>
            <Dropdown
              label="Todos os monitores"
              defaultValue="Todos"
              options={d.monitoresDisponiveis.map((m) => ({ value: m, label: m === 'Todos' ? 'Todos os monitores' : m }))}
              value={d.filtroMonitor}
              onChange={(v) => d.setFiltroMonitor(v as string)}
            />
          </div>
          <div style={{ minWidth: 150 }}>
            <Dropdown
              label="Todos os tipos"
              defaultValue="Todos"
              options={d.tiposEventoDisponiveis.map((t) => ({ value: t, label: t === 'Todos' ? 'Todos os tipos' : t }))}
              value={d.filtroTipoEvento}
              onChange={(v) => d.setFiltroTipoEvento(v as string)}
            />
          </div>
          <div style={{ minWidth: 130 }}>
            <Dropdown
              label={MESES[d.mes]}
              options={MESES.map((nome, i) => ({ value: String(i), label: nome }))}
              value={String(d.mes)}
              onChange={(v) => d.setMes(Number(v))}
            />
          </div>
          <div style={{ minWidth: 90 }}>
            <Dropdown
              label={String(d.ano)}
              options={d.anosDisponiveis.map((a) => ({ value: String(a), label: String(a) }))}
              value={String(d.ano)}
              onChange={(v) => d.setAno(Number(v))}
            />
          </div>
        </div>
      </div>

      {/* KPIs compactos numa linha */}
      <div className="stat-grid dash-stats">
        <StatCard title="Clientes ativos" value={d.ativos.length} icon={Users} onClick={() => navigate('/clientes')} />
        <StatCard
          title={`Reuniões concluídas em ${MESES[d.mes].slice(0, 3)}/${d.ano}`}
          value={d.reunioesConcluidasMes}
          icon={CalendarCheck}
          trend={`${Math.abs(d.variacao)}% vs ${isSameMonth(d.periodo, hoje) ? `mês anterior até dia ${d.diaCorte}` : 'mês anterior'}`}
          trendUp={d.variacao === 0 ? undefined : d.variacao > 0}
        />
        <StatCard
          title={`Agendadas em ${MESES[d.mes].slice(0, 3)}/${d.ano}`}
          value={d.reunioesAgendadasMes}
          icon={CalendarClock}
          trend={`projeção: ${d.reunioesConcluidasMes + d.reunioesAgendadasMes} no mês`}
          onClick={() => navigate('/agenda')}
        />
        <StatCard title={`Reagendamentos em ${MESES[d.mes].slice(0, 3)}/${d.ano}`} value={d.reagendamentosMes} icon={CalendarX2} onClick={() => navigate('/agenda')} />
      </div>

      {/* Gauges (Aderência + Cobertura) lado a lado, mesma altura */}
      <div className="dash-gauges">
        <AderenciaCard
          total={d.aderencia.total}
          emDia={d.aderencia.emDia}
          agendaMarcada={d.aderencia.agendaMarcada}
          precisa={d.aderencia.precisa}
          pct={d.aderencia.pct}
          emDiaClientes={d.aderencia.emDiaClientes}
          agendaMarcadaClientes={d.aderencia.agendaMarcadaClientes}
          precisaClientes={d.aderencia.precisaClientes}
          filtroServico={d.filtroServicoAderencia}
          onFiltroServico={d.setFiltroServicoAderencia}
        />
        <CoberturaCard
          total={d.cobertura.total}
          cobertos={d.cobertura.cobertos}
          semContato={d.cobertura.semContato}
          pct={d.cobertura.pct}
          mesAno={`${MESES[d.mes].slice(0, 3)}/${d.ano}`}
          cobertosClientes={d.cobertura.cobertosClientes}
          semContatoClientes={d.cobertura.semContatoClientes}
        />
        <VencendoCard
          total={d.vencendo.total}
          itens={d.vencendo.itens}
          filtroServico={d.filtroServicoVencendo}
          onFiltroServico={d.setFiltroServicoVencendo}
        />
        <AbrangenciaMapaCard clientes={clientes} />
      </div>

      {/* Serviços + próximas agendas */}
      <div className="dash-two-col">
        <ServicosCard totalAtendidos={d.totalAtendidos} servicosDist={d.servicosDist} />

        <ProximasAgendasCard
          tiposDisponiveis={d.tiposDisponiveis}
          filtroTipo={d.filtroTipo}
          onFiltroTipo={d.setFiltroTipo}
          proximos={d.proximos}
          onVerAgenda={() => navigate('/agenda')}
          onSelecionarEvento={(ev) => navigate('/agenda', { state: { focusDate: ev.date } })}
        />
      </div>

      {/* Alertas */}
      <div className="dash-two-col">
        <AlertasSemAcompanhamentoCard
          alertas={d.alertas}
          followUpDays={d.followUpThresholdDays}
          programados={programados}
          onAbrirCliente={(clienteId) => navigate(`/clientes/${clienteId}`)}
          onProgramarRelatorio={programarRelatorio}
        />

        <AlertasProgramadosCard
          alertasProgramados={d.alertasProgramados}
          nomeCliente={(clientId) => clientes.find((c) => c.id === clientId)?.empresa}
        />
      </div>

      {/* Tendência mensal (fim da página) */}
      <TendenciaMensalCard linhaPorMes={d.linhaPorMes} linhaHighlight={d.linhaHighlight} />

      {relatorioModal && (
        <ReminderFormModal
          initialClientId={relatorioModal.id}
          initialType="Relatório"
          initialTitle={`Enviar relatório — ${relatorioModal.empresa}`}
          initialDescription="Cliente com pouco acompanhamento — enviar relatório."
          onSaved={() => setProgramados((prev) => new Set(prev).add(relatorioModal.id))}
          onClose={() => setRelatorioModal(null)}
        />
      )}
    </div>
  );
}
