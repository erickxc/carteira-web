import { RadialStatRow } from '../RadialStatRow';
import { Card } from '../../ui';

interface TopCliente { empresa: string; n: number }
interface ServicoDist { label: string; pct: number; n: number; color: string; top: TopCliente[] }

interface ServicosCardProps {
  totalAtendidos: number;
  servicosDist: ServicoDist[];
}

/** "Serviços dos Clientes Atendidos" — % de clientes atendidos (últ. 60 dias) por produto contratado. */
export function ServicosCard({ totalAtendidos, servicosDist }: ServicosCardProps) {
  return (
    <Card className="flex flex-col servicos-card">
      <div className="section-header">
        <h3>Serviços dos Clientes Atendidos</h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>reunião ou ação · últ. 60 dias · {totalAtendidos}</span>
      </div>
      {totalAtendidos === 0 ? (
        <div className="empty-state">Nenhum cliente atendido nos últimos 60 dias.</div>
      ) : (
        // flex-1 ocupa a altura do card (que estica pra igualar o card ao lado
        // no grid); centralizado pra distribuir o espaço sobrando por igual
        // acima/abaixo em vez de concentrar tudo embaixo.
        <div className="flex-1 flex items-center justify-center">
          <RadialStatRow items={servicosDist} size={112} thickness={13} />
        </div>
      )}
    </Card>
  );
}
