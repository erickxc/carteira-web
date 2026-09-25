import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, Building2, Layers, TrendingUp, UserCheck, UserX } from 'lucide-react';
import { useCarteira } from '../context/CarteiraContext';
import { useDashboardData } from '../hooks/useDashboardData';
import { buscarHistoricoAnalisesIA } from '../api/client';
import { DistribuicaoListCard } from '../components/dashboard/DistribuicaoListCard';
import { StackedBarCard } from '../components/dashboard/StackedBarCard';
import { CrescimentoCarteiraCard } from '../components/dashboard/CrescimentoCarteiraCard';
import { AbrangenciaMapaCard } from '../components/dashboard/AbrangenciaMapaCard';
import { Comparacao } from '../components/dashboard/Comparacao';
import { StatCard } from '../components/StatCard';
import { Button } from '../ui';
import type { AnaliseIA } from '../types';

const formatar1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Dashboard da COMPOSIÇÃO da carteira (cadastro: monitor, status, serviços,
 * segmento, abrangência, crescimento) — a Visão Geral em "/" cuida de agenda e
 * prazo. Unidade: atendimento (loja) em tudo; só "Total de clientes" conta rede.
 * Mesmo contrato de KPI da Visão Geral: "X de Y", comparação e "como conta".
 */
export default function CarteiraDashboardPage() {
  const navigate = useNavigate();
  const { filtroMonitor } = useCarteira();
  // Histórico de risco só é buscado aqui (comparação do card de risco), não no boot do app.
  // undefined = carregando; null = falhou (sem comparação).
  const [historicoAnalises, setHistoricoAnalises] = useState<AnaliseIA[] | null | undefined>(undefined);
  useEffect(() => {
    let ativo = true;
    buscarHistoricoAnalisesIA().then((h) => { if (ativo) setHistoricoAnalises(h); }).catch(() => { if (ativo) setHistoricoAnalises(null); });
    return () => { ativo = false; };
  }, []);
  const d = useDashboardData({ historicoAnalises: historicoAnalises ?? undefined });

  const rotuloData = format(d.referenciaAnterior, 'dd/MM');
  const hoje = new Date();
  const rotuloMes = `mês anterior até dia ${hoje.getDate()}`;
  const foraTotal = d.inativos.length;
  const quebraFora = d.foraDaMonitoria.map((x) => `${x.label} ${x.n}`).join(' · ');
  const riscoAlto = d.distribuicaoRisco.find((s) => s.label === 'Risco alto');
  const multiplos = d.profundidadeServicos.filter((s) => /^(2|3\+)/.test(s.label)).reduce((s, i) => s + i.pct, 0);
  const regular = d.saudeCarteira.find((s) => /^regular$/i.test(s.label));
  const inicioLog = d.inicioHistorico ? format(d.inicioHistorico, 'dd/MM/yyyy') : null;

  return (
    <div className="page-container">
      <Button variant="secondary" onClick={() => navigate('/clientes')} style={{ marginBottom: 20 }}>
        <ArrowLeft size={15} /> Voltar para Carteira
      </Button>

      <div style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>Dashboard da Carteira</h1>
        <p className="page-subtitle" style={{ margin: 0 }}>Composição, situação e crescimento dos atendimentos</p>
      </div>

      <div className="stat-grid dash-stats" style={{ marginBottom: '1.5rem' }}>
        <StatCard
          title="Total de clientes"
          value={d.totalClientesDistintos}
          icon={Building2}
          comparacao={<Comparacao atual={d.totalClientesDistintos} anterior={d.totalClientesDistintosAnterior} subirEhBom rotulo={rotuloData} />}
          comoConta="Clientes ativos contados por rede (Altese = 1)."
          onClick={() => navigate('/clientes')}
        />
        <StatCard
          title="Atendimentos ativos"
          value={d.ativosNoPeriodo.length}
          icon={UserCheck}
          comparacao={<Comparacao atual={d.ativosNoPeriodo.length} anterior={d.ativosAnterior.length} subirEhBom rotulo={rotuloData} />}
          comoConta="Cada loja ativa é um atendimento."
          onClick={() => navigate('/clientes')}
        />
        <StatCard
          title="Fora da monitoria"
          value={foraTotal}
          icon={UserX}
          comoConta={quebraFora || 'Nenhum atendimento fora da monitoria.'}
        />
        <StatCard
          title="Novos atendimentos no mês"
          value={d.novosClientesMes}
          icon={TrendingUp}
          comparacao={<Comparacao atual={d.novosClientesMes} anterior={d.novosClientesMesAnterior} subirEhBom rotulo={rotuloMes} />}
          comoConta="Cadastros criados neste mês."
        />
        <StatCard
          title="Serviços por atendimento"
          value={formatar1.format(d.mediaServicosPorCliente)}
          icon={Layers}
          comparacao={<p className="kpi-comparacao is-neutra">em {rotuloData}: {formatar1.format(d.mediaServicosAnterior)}</p>}
          comoConta="Média de Monitoria e Price contratados. Protocolo GPS, OptiMarco e outros ficam fora."
        />
      </div>

      <div className="dash-secoes">
        <div className="dash-two-col">
          <CrescimentoCarteiraCard pontos={d.crescimentoCarteira} inicioHistorico={inicioLog} />
          <AbrangenciaMapaCard clientes={d.ativos} />
        </div>

        <div className="dash-two-col">
          <StackedBarCard
            titulo="Profundidade de Serviços"
            subtitulo="serviços contratados por atendimento ativo"
            segmentos={d.profundidadeServicos}
            emptyMsg="Nenhum atendimento ativo cadastrado."
            insight={multiplos > 0 ? `${multiplos}% dos atendimentos ativos contratam mais de um serviço.` : undefined}
          />

          <StackedBarCard
            titulo="Distribuição de Risco"
            subtitulo="por dossiê do monitorIA · atendimentos ativos"
            segmentos={d.distribuicaoRisco}
            emptyMsg="Nenhum atendimento ativo com análise de risco ainda."
            destaque
            insight={riscoAlto ? `${riscoAlto.pct}% dos atendimentos ativos estão em risco alto.` : undefined}
            extra={riscoAlto && (
              <Comparacao atual={riscoAlto.n} anterior={riscoAlto.anterior} subirEhBom={false} rotulo={`${rotuloData} em risco alto`} semBase={historicoAnalises === undefined ? 'carregando comparação…' : 'sem histórico de risco para comparar'} />
            )}
          />
        </div>

        <div className="dash-two-col">
          <StackedBarCard
            titulo="Saúde da Carteira"
            subtitulo="por status · todos os cadastros"
            segmentos={d.saudeCarteira}
            emptyMsg="Nenhum atendimento cadastrado."
            insight={regular ? `${regular.pct}% dos cadastros estão com status Regular.` : undefined}
          />
          {/* Com um monitor escolhido no filtro, a concentração seria sempre 100% dele. */}
          {filtroMonitor === 'Todos' ? (
            <DistribuicaoListCard
              titulo="Concentração por Monitor"
              subtitulo="atendimentos ativos"
              items={d.clientesPorMonitor}
              emptyMsg="Nenhum atendimento ativo com monitor definido."
            />
          ) : (
            <DistribuicaoListCard
              titulo="Atendimentos por Linha"
              subtitulo="Leve · Pesada · Geral"
              items={d.clientesPorLinha}
              emptyMsg="Nenhum atendimento ativo com linha definida."
              pendencia={d.semLinha > 0 ? `${d.semLinha} atendimento(s) sem linha — completar o cadastro.` : undefined}
            />
          )}
        </div>

        <div className="dash-two-col">
          <DistribuicaoListCard
            titulo="Atendimentos por Segmento"
            subtitulo="atendimentos ativos"
            items={d.clientesPorSegmento}
            emptyMsg="Nenhum atendimento ativo com segmento definido."
            limite={8}
            pendencia={d.semSegmento > 0 ? `${d.semSegmento} atendimento(s) sem segmento — completar o cadastro.` : undefined}
          />
          {filtroMonitor === 'Todos' && (
            <DistribuicaoListCard
              titulo="Atendimentos por Linha"
              subtitulo="Leve · Pesada · Geral"
              items={d.clientesPorLinha}
              emptyMsg="Nenhum atendimento ativo com linha definida."
              pendencia={d.semLinha > 0 ? `${d.semLinha} atendimento(s) sem linha — completar o cadastro.` : undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
}
