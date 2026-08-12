import { RadialStatRow } from '../RadialStatRow';
import { Card } from '../../ui';

interface TopCliente { empresa: string; n: number }
interface ServicoDist {
  label: string; pct: number; n: number; color: string; top: TopCliente[];
  base?: number; descobertos?: number;
}

interface ServicosCardProps {
  totalAtendidos: number;
  servicosDist: ServicoDist[];
}

/**
 * "Cobertura por Serviço" — dos clientes que CONTRATARAM cada serviço, quantos
 * foram atendidos nos últimos 30 dias.
 *
 * Era o inverso ("dos atendidos, quantos têm o serviço"), que dava 97% em
 * Monitoria só porque quase toda a carteira tem Monitoria — número alto por
 * definição e sem ação possível. Assim o card mostra quem contratou e não está
 * sendo atendido.
 */
export function ServicosCard({ totalAtendidos, servicosDist }: ServicosCardProps) {
  const descobertosTotal = servicosDist.reduce((s, d) => s + (d.descobertos ?? 0), 0);
  return (
    <Card className="flex flex-col servicos-card">
      <div className="section-header">
        <h3>Cobertura por Serviço</h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>
          atendidos em 30 dias · {descobertosTotal > 0 ? `${descobertosTotal} sem atendimento` : 'todos cobertos'}
        </span>
      </div>
      {totalAtendidos === 0 ? (
        <div className="empty-state">Nenhum cliente atendido nos últimos 30 dias.</div>
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
