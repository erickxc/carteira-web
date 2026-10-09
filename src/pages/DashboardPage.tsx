import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, isSameMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Building2, CalendarCheck, CalendarClock, CalendarX2, Percent, Users } from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';
import { StatCard } from '../components/StatCard';
import { rotuloModo } from '../utils/analises';
import { Dropdown } from '../components/Dropdown';
import { Comparacao } from '../components/dashboard/Comparacao';
import { CoberturaCard } from '../components/dashboard/CoberturaCard';
import { AderenciaCard } from '../components/dashboard/AderenciaCard';
import { VencendoCard } from '../components/dashboard/VencendoCard';
import { ServicosCard } from '../components/dashboard/ServicosCard';
import { AFazerCard } from '../components/dashboard/AFazerCard';
import { TendenciaMensalCard } from '../components/dashboard/TendenciaMensalCard';
import { Top10AtendimentosCard } from '../components/dashboard/Top10AtendimentosCard';
import { AtendimentoCard } from '../components/dashboard/AtendimentoCard';
import { RecuperadosCard } from '../components/dashboard/RecuperadosCard';
import { CancelamentosCard } from '../components/dashboard/CancelamentosCard';
import { RitmoMensalCard } from '../components/dashboard/RitmoMensalCard';
import { CargaMonitorCard } from '../components/dashboard/CargaMonitorCard';
import { ReunioesDiaCard } from '../components/dashboard/ReunioesDiaCard';
import { montarGruposPrazo } from '../utils/gruposPrazo';
import type { ServicoCad } from '../utils/cadenciaServico';
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
  const navigate = useNavigate();
  const abrirCliente = (clienteId: string) => navigate(`/clientes/${clienteId}`);
  const [programados, setProgramados] = useState<Set<string>>(new Set());
  const [relatorioModal, setRelatorioModal] = useState<Cliente | null>(null);
  const d = useDashboardData();
  const hoje = new Date();
  const mesCorrente = isSameMonth(d.periodo, hoje);

  // Rótulos das comparações: carteira hoje × mesma data do mês anterior;
  // contagens do mês × mês anterior até o mesmo dia.
  const rotuloData = format(d.referenciaAnterior, 'dd/MM');
  const mesCurto = `${curto(d.mes)}/${d.ano}`;
  // Mesmo formato das comparações vizinhas ("vs 28/08" = até essa data no mês
  // anterior), para caber numa linha do card; mês fechado compara com o mês inteiro.
  const rotuloMes = mesCorrente
    ? `${String(d.diaCorte).padStart(2, '0')}/${String(((d.mes + 11) % 12) + 1).padStart(2, '0')}`
    : curto(d.mes - 1);
  const janelaCobertura = `${curto(d.mes - 1)} + ${curto(d.mes)}`;
  const grupos = useMemo(() => montarGruposPrazo({
    ritmo: { emDia: d.aderencia.emDiaClientes, emDiaMarcada: d.aderencia.emDiaMarcadaClientes, agendaMarcada: d.aderencia.agendaMarcadaClientes, contatoRecente: d.aderencia.contatoRecenteClientes, precisa: d.aderencia.precisaClientes },
    cobertura: { cobertos: d.cobertura.cobertosClientes, semContato: d.cobertura.semContatoClientes },
    servicos: d.servicosDist.map((s) => ({ servico: s.label as ServicoCad, descobertos: s.descobertosClientes })),
    filtroServico: d.filtroServicoAderencia,
    janela: janelaCobertura,
    hoje: d.dataReferencia,
  }), [d.aderencia, d.cobertura, d.servicosDist, d.filtroServicoAderencia, janelaCobertura, d.dataReferencia]);
  const quando = mesCorrente ? 'este mês' : `em ${format(d.periodo, 'MMM/yy', { locale: ptBR })}`;
  const janelaAtendimento = useMemo(() => janelaDoMes(d.periodo, new Date()), [d.periodo]);
  const nome = rotuloModo(d.modoContagem);
  const rne = d.reuniaoNasEntregas;
  const pctReuniao = (x: { reunioes: number; entregas: number }) => (x.entregas > 0 ? Math.round((x.reunioes / x.entregas) * 100) : null);
  const pctAtual = pctReuniao(rne.atual);
  const pctAnterior = pctReuniao(rne.anterior);

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
          {/* O que os cards de volume contam: todas as entregas (reunião + relatório + precificação) ou só reuniões. */}
          <div style={{ minWidth: 170 }}>
            <Dropdown
              label="Todas as entregas"
              defaultValue="entregas"
              options={[{ value: 'entregas', label: 'Todas as entregas' }, { value: 'reunioes', label: 'Só reuniões' }]}
              value={d.modoContagem}
              onChange={(v) => d.setModoContagem(v as 'entregas' | 'reunioes')}
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
          title={`${nome.Plural} concluídas`}
          value={d.reunioesConcluidasMes}
          icon={CalendarCheck}
          comparacao={<Comparacao atual={d.reunioesConcluidasMes} anterior={d.reunioesConcluidasMesAnterior} subirEhBom rotulo={rotuloMes} />}
          comoConta={d.modoContagem === 'entregas' ? 'Reuniões, relatórios e precificações do mês com status Concluído ou Realizado.' : 'Reuniões do mês com status Concluído ou Realizado.'}
        />
        <StatCard
          title={`${nome.Plural} agendadas`}
          value={d.reunioesAgendadasMes}
          icon={CalendarClock}
          comparacao={<Comparacao atual={d.reunioesAgendadasMes} anterior={null} subirEhBom rotulo="" semBase="a acontecer" />}
          comoConta="Não inclui as concluídas. Sem comparação: o sistema não guarda o que estava agendado no passado."
          onClick={() => navigate('/agenda')}
        />
        <StatCard
          title={`${nome.Plural} reagendadas`}
          value={d.reagendamentosMes}
          icon={CalendarX2}
          comparacao={<Comparacao atual={d.reagendamentosMes} anterior={d.reagendamentosMesAnterior} subirEhBom={false} rotulo={rotuloMes} />}
          comoConta={`${nome.Plural} do mês movidas ao menos 1 vez.`}
          onClick={() => navigate('/agenda')}
        />
        <StatCard
          title="Reuniões nas entregas"
          value={pctAtual === null ? '—' : `${pctAtual}%`}
          icon={Percent}
          comparacao={
            pctAtual === null || pctAnterior === null ? undefined : (
              <p className="kpi-comparacao is-neutra">
                {pctAtual === pctAnterior ? '= ' : pctAtual > pctAnterior ? '▲ ' : '▼ '}
                {pctAtual === pctAnterior ? `igual a ${rotuloMes}` : `${Math.abs(pctAtual - pctAnterior)} p.p. vs ${rotuloMes}`} ({pctAnterior}%)
              </p>
            )
          }
          comoConta={`${rne.atual.reunioes} de ${rne.atual.entregas} entregas concluídas no mês foram reunião; o resto é relatório e precificação. Não segue o filtro "Todas as entregas / Só reuniões".`}
        />
      </div>

      {/* 2. Prazo */}
      <h2 className="dash-bloco-titulo">Atendimentos</h2>
      <div className="dash-gauges">
        <AderenciaCard
          total={d.aderencia.total}
          emDia={d.aderencia.emDia}
          anterior={d.aderencia.anterior}
          rotuloAnterior={rotuloData}
          filtroServico={d.filtroServicoAderencia}
          onFiltroServico={d.setFiltroServicoAderencia}
          grupos={grupos.ritmo}
          linhas={d.linhasAtendimento}
          onAbrirCliente={abrirCliente}
        />
        <CoberturaCard
          total={d.cobertura.total}
          cobertos={d.cobertura.cobertos}
          janela={janelaCobertura}
          anterior={d.cobertura.anterior}
          rotuloAnterior={rotuloData}
          grupos={grupos.cobertura}
          linhas={d.linhasAtendimento}
          onAbrirCliente={abrirCliente}
        />
        <ServicosCard servicosDist={d.servicosDist} rotuloAnterior={rotuloData} grupos={grupos.servico} linhas={d.linhasAtendimento} onAbrirCliente={abrirCliente} />
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
          onAbrirCliente={abrirCliente}
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
          vencidos={d.vencendo.vencidos}
          filtroServico={d.filtroServicoVencendo}
          onFiltroServico={d.setFiltroServicoVencendo}
        />
      </div>

      {/* 4. Análise */}
      <h2 className="dash-bloco-titulo">Análises</h2>
      {/* Uma pergunta por linha: volume (mês e dia) → as reuniões acontecem? →
          os prazos estão em dia? → onde está a carteira. */}
      <div className="dash-2-1">
        <TendenciaMensalCard linhaPorMes={d.linhaPorMes} linhaHighlight={d.linhaHighlight} modo={d.modoContagem} />
        <ReunioesDiaCard dados={d.agendaDiaria} mes={mesCurto} modo={d.modoContagem} />
      </div>

      <div className="dash-two-col">
        <AtendimentoCard agenda={d.agendaPorMonitor} acoes={d.acoesPorMonitor} janela={janelaAtendimento} agora={d.dataReferencia} modo={d.modoContagem} />
        <CancelamentosCard dados={d.cancelamentos} modo={d.modoContagem} onAbrirCliente={abrirCliente} />
      </div>

      {/* Carga por monitor só com o filtro global em "Todos": com um monitor escolhido não há o que comparar. */}
      <div className={d.cargaPorMonitor.length > 1 ? 'dash-1-2' : 'dash-analise-linha'}>
        <RitmoMensalCard pontos={d.ritmoPorMes} />
        {d.cargaPorMonitor.length > 1 && <CargaMonitorCard linhas={d.cargaPorMonitor} mes={mesCurto} modo={d.modoContagem} />}
      </div>

      <div className="dash-two-col">
        <Top10AtendimentosCard itens={d.esforco.itens} total={d.esforco.total} atendimentos={d.esforco.atendimentos} onAbrirCliente={abrirCliente} />
        <RecuperadosCard clientes={d.ativos} agenda={d.agendaPorMonitor} janela={janelaAtendimento} agora={d.dataReferencia} mes={mesCurto} onAbrirCliente={abrirCliente} />
      </div>

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
