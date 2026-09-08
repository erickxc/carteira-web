import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bot, Building2, Layers, TrendingUp, UserCheck, UserX } from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';
import { DistribuicaoListCard } from '../components/dashboard/DistribuicaoListCard';
import { StackedBarCard } from '../components/dashboard/StackedBarCard';
import { CrescimentoCarteiraCard } from '../components/dashboard/CrescimentoCarteiraCard';
import { AbrangenciaMapaCard } from '../components/dashboard/AbrangenciaMapaCard';
import { StatCard } from '../components/StatCard';
import { Button } from '../ui';

/**
 * Dashboard dedicado à Carteira (não ao app inteiro — isso é a Visão Geral em
 * "/"). Pedido do usuário: um lugar próprio pra métricas/composição da
 * carteira em si, direto do CADASTRO de cliente (monitor, status, serviços,
 * segmento, abrangência geográfica, crescimento) — sem misturar no dashboard
 * principal, que é sobre agenda/cadência. Acessado por um botão em
 * `/clientes` (ClientesPage). O mapa de Abrangência morava na Visão Geral;
 * mudou pra cá por ser sobre COMPOSIÇÃO da carteira, não sobre agenda — a
 * Visão Geral ganhou o ranking Top 10 de reuniões no lugar.
 */
export default function CarteiraDashboardPage() {
  const navigate = useNavigate();
  const d = useDashboardData();

  const totalAtivos = d.ativos.length;
  const totalInativos = d.inativos.length;

  return (
    <div className="page-container">
      <Button variant="secondary" onClick={() => navigate('/clientes')} style={{ marginBottom: 20 }}>
        <ArrowLeft size={15} /> Voltar para Carteira
      </Button>

      <div style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>Dashboard da Carteira</h1>
        <p className="page-subtitle" style={{ margin: 0 }}>Composição, saúde e crescimento da carteira de clientes</p>
      </div>

      <div className="stat-grid dash-stats" style={{ marginBottom: '1.5rem' }}>
        {/* Distinto de "atendimentos": um grupo com várias lojas (ex.: rede
            Altese) conta como 1 cliente aqui, mesmo tendo N lojas ativas —
            "atendimentos" (uma linha por loja) é o que a Visão Geral mostra. */}
        <StatCard title="Total de clientes" value={d.totalClientesDistintos} icon={Building2} onClick={() => navigate('/clientes')} />
        <StatCard title="Atendimentos ativos" value={totalAtivos} icon={UserCheck} onClick={() => navigate('/clientes')} />
        <StatCard title="Atendimentos inativos" value={totalInativos} icon={UserX} />
        <StatCard
          title="Novos clientes no mês"
          value={d.novosClientesMes}
          icon={TrendingUp}
        />
        <StatCard
          title="Serviços por cliente ativo"
          value={d.mediaServicosPorCliente.toFixed(1)}
          icon={Layers}
        />
      </div>

      {/* Um container só cuida do espaçamento (vertical igual ao gap
          horizontal) — antes cada card trazia a própria margem e alguns
          ficavam colados. */}
      <div className="dash-secoes">
        <div className="dash-two-col">
          <CrescimentoCarteiraCard pontos={d.crescimentoCarteira} />
          <AbrangenciaMapaCard clientes={d.ativos} />
        </div>

        <div className="dash-two-col">
          <StackedBarCard
            titulo="Profundidade de Serviços"
            subtitulo="quantos serviços cada cliente ativo contratou"
            segmentos={d.profundidadeServicos}
            emptyMsg="Nenhum cliente ativo cadastrado."
            insight={(() => {
              const multiplos = d.profundidadeServicos.filter((s) => /^(2|3\+)/.test(s.label)).reduce((s, i) => s + i.pct, 0);
              return multiplos > 0 ? `${multiplos}% dos clientes ativos contratam mais de um serviço.` : undefined;
            })()}
          />

          <StackedBarCard
            titulo="Distribuição de Risco"
            subtitulo="por dossiê do monitorIA · clientes ativos"
            segmentos={d.distribuicaoRisco}
            emptyMsg="Nenhum cliente ativo com análise de risco ainda."
            icone={Bot}
            destaque
            insight={(() => {
              const alto = d.distribuicaoRisco.find((s) => s.label === 'Risco alto');
              return alto ? `${alto.pct}% da carteira ativa está em risco alto.` : undefined;
            })()}
          />
        </div>

        <div className="dash-two-col">
          <StackedBarCard
            titulo="Saúde da Carteira"
            subtitulo="por status · ativos + inativos"
            segmentos={d.saudeCarteira}
            emptyMsg="Nenhum cliente cadastrado."
            insight={(() => {
              const regular = d.saudeCarteira.find((s) => /^regular$/i.test(s.label));
              return regular ? `${regular.pct}% da carteira está com status Regular.` : undefined;
            })()}
          />
          <DistribuicaoListCard
            titulo="Concentração por Monitor"
            subtitulo="clientes ativos"
            items={d.clientesPorMonitor}
            emptyMsg="Nenhum cliente ativo com monitor definido."
          />
        </div>

        <div className="dash-two-col">
          <DistribuicaoListCard
            titulo="Clientes por Segmento"
            subtitulo="clientes ativos"
            items={d.clientesPorSegmento}
            emptyMsg="Nenhum cliente ativo com segmento definido."
            limite={8}
          />
          <DistribuicaoListCard
            titulo="Clientes por Linha"
            subtitulo="Leve · Pesada · Geral"
            items={d.clientesPorLinha}
            emptyMsg="Nenhum cliente ativo com linha definida."
          />
        </div>
      </div>
    </div>
  );
}
