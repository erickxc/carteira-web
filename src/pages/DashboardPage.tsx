import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Building2, CalendarCheck, CalendarClock, CalendarX2, Users } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { useDashboardData } from '../hooks/useDashboardData';
import { StatCard } from '../components/StatCard';
import { Dropdown } from '../components/Dropdown';
import { Comparacao } from '../components/dashboard/Comparacao';
import { CoberturaCard } from '../components/dashboard/CoberturaCard';
import { AderenciaCard } from '../components/dashboard/AderenciaCard';
import { VencendoCard } from '../components/dashboard/VencendoCard';
import { ServicosCard } from '../components/dashboard/ServicosCard';
import { AFazerCard } from '../components/dashboard/AFazerCard';
import { AlertasProgramadosCard } from '../components/dashboard/AlertasProgramadosCard';
import { TendenciaMensalCard } from '../components/dashboard/TendenciaMensalCard';
import { Top10AtendimentosCard } from '../components/dashboard/Top10AtendimentosCard';
import { AtendimentoCard } from '../components/dashboard/AtendimentoCard';
import { RecuperadosCard } from '../components/dashboard/RecuperadosCard';
import { ReminderFormModal } from '../components/ReminderFormModal';
import { janelaDoMes } from '../utils/periodo';
import type { Cliente } from '../types';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const curto = (i: number) => MESES[(i + 12) % 12].slice(0, 3).toLowerCase();

/**
 * Visão Geral do monitor, em 4 blocos que respondem uma pergunta cada:
 * números do mês → os atendimentos estão no prazo? → o que fazer agora → análise.
 * Todo KPI traz "X de Y", comparação com um período nomeado e uma linha de
 * "como conta" — ver docs/superpowers/specs/2026-09-25-dashboard-kpis-atendimento-design.md.
 */
export default function DashboardPage() {
  const { clientes } = useCarteira();
  const navigate = useNavigate();
  const [programados, setProgramados] = useState<Set<string>>(new Set());
  const [relatorioModal, setRelatorioModal] = useState<Cliente | null>(null);
  const d = useDashboardData();
  const hoje = new Date();
  const mesCorrente = isSameMonth(d.periodo, hoje);

  // Rótulos das comparações: carteira hoje × mesma data do mês anterior;
  // contagens do mês × mês anterior até o mesmo dia.
  const rotuloData = format(d.referenciaAnterior, 'dd/MM');
  const mesAnterior = MESES[(d.mes + 11) % 12].toLowerCase();
  const rotuloMes = mesCorrente ? `${mesAnterior} até dia ${d.diaCorte}` : mesAnterior;
  const janelaCobertura = `${curto(d.mes - 1)} + ${curto(d.mes)}`;
  const quando = mesCorrente ? 'este mês' : `em ${format(d.periodo, 'MMM/yy', { locale: ptBR })}`;
  const janelaAtendimento = useMemo(() => janelaDoMes(d.periodo, new Date()), [d.periodo]);

  // Abre o modal de lembrete pré-preenchido pra escolher dia/hora do envio do relatório.
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
          {/* Filtro de monitor: é GLOBAL, no header (src/App.tsx) — ver CarteiraContext.filtroMonitor. */}
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
              options={d.mesesDisponiveis.map((i) => ({ value: String(i), label: MESES[i] }))}
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

      {/* 1. Números do mês */}
      <h2 className="dash-bloco-titulo">Carteira e mês em números</h2>
      <div className="stat-grid dash-stats">
        <StatCard
          title="Clientes ativos"
          value={d.totalClientesDistintos}
          icon={Building2}
          comparacao={<Comparacao atual={d.totalClientesDistintos} anterior={d.totalClientesDistintosAnterior} subirEhBom rotulo={rotuloData} />}
          comoConta={`Rede conta 1 vez (Altese = 1). ${d.atendidosNoMes} ${d.atendidosNoMes === 1 ? 'atendido' : 'atendidos'} ${quando}.`}
          onClick={() => navigate('/clientes')}
        />
        <StatCard
          title="Total de atendimentos"
          value={d.ativosNoPeriodo.length}
          icon={Users}
          comparacao={<Comparacao atual={d.ativosNoPeriodo.length} anterior={d.ativosAnterior.length} subirEhBom rotulo={rotuloData} />}
          comoConta={`Cada loja ativa é um atendimento: ${d.ativosNoPeriodo.length} atendimentos em ${d.totalClientesDistintos} clientes.`}
          onClick={() => navigate('/clientes')}
        />
        <StatCard
          title="Reuniões concluídas"
          value={d.reunioesConcluidasMes}
          icon={CalendarCheck}
          comparacao={<Comparacao atual={d.reunioesConcluidasMes} anterior={d.reunioesConcluidasMesAnterior} subirEhBom rotulo={rotuloMes} />}
          comoConta="Reuniões do mês com status Concluído ou Realizado."
        />
        <StatCard
          title="Reuniões agendadas"
          value={d.reunioesAgendadasMes}
          icon={CalendarClock}
          comparacao={<Comparacao atual={d.reunioesAgendadasMes} anterior={null} subirEhBom rotulo="" semBase="ainda vão acontecer" />}
          comoConta="Não inclui as concluídas. Sem comparação: o sistema não guarda o que estava agendado no passado."
          onClick={() => navigate('/agenda')}
        />
        <StatCard
          title="Reuniões reagendadas"
          value={d.reagendamentosMes}
          icon={CalendarX2}
          comparacao={<Comparacao atual={d.reagendamentosMes} anterior={d.reagendamentosMesAnterior} subirEhBom={false} rotulo={rotuloMes} />}
          comoConta="Reuniões do mês movidas ao menos 1 vez."
          onClick={() => navigate('/agenda')}
        />
      </div>

      {/* 2. Prazo */}
      <h2 className="dash-bloco-titulo">Atendimentos</h2>
      <div className="dash-gauges">
        <AderenciaCard
          total={d.aderencia.total}
          emDia={d.aderencia.emDia}
          agendaMarcada={d.aderencia.agendaMarcada}
          contatoRecente={d.aderencia.contatoRecente}
          precisa={d.aderencia.precisa}
          emDiaClientes={d.aderencia.emDiaClientes}
          agendaMarcadaClientes={d.aderencia.agendaMarcadaClientes}
          contatoRecenteClientes={d.aderencia.contatoRecenteClientes}
          precisaClientes={d.aderencia.precisaClientes}
          anterior={d.aderencia.anterior}
          rotuloAnterior={rotuloData}
          filtroServico={d.filtroServicoAderencia}
          onFiltroServico={d.setFiltroServicoAderencia}
        />
        <CoberturaCard
          total={d.cobertura.total}
          cobertos={d.cobertura.cobertos}
          semContato={d.cobertura.semContato}
          janela={janelaCobertura}
          cobertosClientes={d.cobertura.cobertosClientes}
          semContatoClientes={d.cobertura.semContatoClientes}
          anterior={d.cobertura.anterior}
          rotuloAnterior={rotuloData}
        />
        <ServicosCard servicosDist={d.servicosDist} rotuloAnterior={rotuloData} />
      </div>

      {/* 3. Ação */}
      <h2 className="dash-bloco-titulo">A fazer</h2>
      <div className="dash-acao">
        <AFazerCard
          alertas={d.alertas}
          totalAnterior={d.alertasAnterior}
          rotuloAnterior={rotuloData}
          followUpDays={d.followUpThresholdDays}
          proximaPorCliente={d.proximaPorCliente}
          programados={programados}
          onAbrirCliente={(clienteId) => navigate(`/clientes/${clienteId}`)}
          onProgramarRelatorio={programarRelatorio}
          tiposDisponiveis={d.tiposDisponiveis}
          filtroTipo={d.filtroTipo}
          onFiltroTipo={d.setFiltroTipo}
          proximos={d.proximos}
          relatoriosSemana={d.relatoriosSemana}
          onVerAgenda={() => navigate('/agenda')}
          onSelecionarEvento={(ev) => navigate('/agenda', { state: { focusDate: ev.date } })}
        />
        <VencendoCard
          total={d.vencendo.total}
          itens={d.vencendo.itens}
          filtroServico={d.filtroServicoVencendo}
          onFiltroServico={d.setFiltroServicoVencendo}
        />
      </div>

      {/* 4. Análise */}
      <h2 className="dash-bloco-titulo">Análises</h2>
      <div className="dash-two-col">
        <Top10AtendimentosCard
          itens={d.top10AtendimentosAno.itens}
          inicio={d.top10AtendimentosAno.inicio}
          fim={d.top10AtendimentosAno.fim}
          ano={d.ano}
          filtro={d.filtroServicoTop10}
          onFiltro={d.setFiltroServicoTop10}
        />
        <AlertasProgramadosCard
          alertasProgramados={d.alertasProgramados}
          nomeCliente={(clientId) => clientes.find((c) => c.id === clientId)?.empresa}
        />
      </div>

      <div className="dash-two-col">
        <AtendimentoCard agenda={d.agendaPorMonitor} acoes={d.acoesPorMonitor} janela={janelaAtendimento} agora={d.dataReferencia} />
        <RecuperadosCard clientes={d.ativos} agenda={d.agendaPorMonitor} agora={d.dataReferencia} />
      </div>

      <TendenciaMensalCard linhaPorMes={d.linhaPorMes} linhaHighlight={d.linhaHighlight} />

      {relatorioModal && (
        <ReminderFormModal
          initialClientId={relatorioModal.id}
          initialType="Relatório"
          initialTitle={`Enviar relatório — ${relatorioModal.empresa}`}
          initialDescription="Atendimento sem acompanhamento — enviar relatório."
          onSaved={() => setProgramados((prev) => new Set(prev).add(relatorioModal.id))}
          onClose={() => setRelatorioModal(null)}
        />
      )}
    </div>
  );
}
