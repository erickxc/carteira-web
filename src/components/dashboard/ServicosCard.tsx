import { RadialStatRow } from '../RadialStatRow';

interface TopCliente { empresa: string; n: number }
interface ServicoDist { label: string; pct: number; n: number; color: string; top: TopCliente[] }

interface ServicosCardProps {
  totalAtendidos: number;
  servicosDist: ServicoDist[];
}

/** "Serviços dos Clientes Atendidos" — % de clientes atendidos (últ. 60 dias) por produto contratado. */
export function ServicosCard({ totalAtendidos, servicosDist }: ServicosCardProps) {
  return (
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
  );
}
