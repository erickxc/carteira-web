import { DonutChart } from '../DonutChart';

interface CoberturaCardProps {
  total: number;
  cobertos: number;
  semContato: number;
  pct: number;
  mesAno: string;
}

/** "Cobertura da Carteira" — % de clientes ativos com ao menos 1 reunião no período. */
export function CoberturaCard({ total, cobertos, semContato, pct, mesAno }: CoberturaCardProps) {
  return (
    <div className="glass-card cobertura-card">
      <div className="section-header">
        <h3>Cobertura da Carteira</h3>
        <span className="text-muted" style={{ fontSize: 12 }}>{mesAno} · {total} ativos</span>
      </div>
      {total === 0 ? (
        <div className="empty-state">Nenhum cliente ativo.</div>
      ) : (
        <DonutChart
          items={[
            { label: 'Atendidos', value: cobertos },
            { label: 'Sem contato', value: semContato },
          ]}
          colors={['var(--accent)', 'var(--border-strong)']}
          centerValue={`${pct}%`}
          size={96}
          thickness={13}
        />
      )}
    </div>
  );
}
