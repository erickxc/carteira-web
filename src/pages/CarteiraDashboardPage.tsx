import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useDashboardData } from '../hooks/useDashboardData';
import { OutrosServicosCard } from '../components/dashboard/OutrosServicosCard';
import { Button } from '../ui';

/**
 * Dashboard dedicado à Carteira (não ao app inteiro — isso é a Visão Geral em
 * "/"). Pedido do usuário: um lugar próprio pra métricas/composição da
 * carteira em si (por enquanto, distribuição de "Outros Serviços" — fora de
 * Monitoria/Price, sem entrar na cadência), sem misturar no dashboard
 * principal. Acessado por um botão em `/clientes` (ClientesPage).
 */
export default function CarteiraDashboardPage() {
  const navigate = useNavigate();
  const d = useDashboardData();

  return (
    <div className="page-container">
      <Button variant="secondary" onClick={() => navigate('/clientes')} style={{ marginBottom: 20 }}>
        <ArrowLeft size={15} /> Voltar para Carteira
      </Button>

      <div style={{ marginBottom: 20 }}>
        <h1 className="page-title" style={{ marginBottom: 4 }}>Dashboard da Carteira</h1>
        <p className="page-subtitle" style={{ margin: 0 }}>Composição e serviços da carteira de clientes</p>
      </div>

      <OutrosServicosCard outrosServicosDist={d.outrosServicosDist} />
    </div>
  );
}
