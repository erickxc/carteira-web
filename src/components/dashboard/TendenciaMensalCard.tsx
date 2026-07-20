import { LineChart } from '../LineChart';

interface Ponto { label: string; full: string; value: number }

interface TendenciaMensalCardProps {
  linhaPorMes: Ponto[];
  linhaHighlight: number;
}

/** "Reuniões por Mês" — linha do tempo desde a primeira reunião registrada. */
export function TendenciaMensalCard({ linhaPorMes, linhaHighlight }: TendenciaMensalCardProps) {
  return (
    <div className="section glass-card">
      <div className="section-header">
        <h3>Reuniões por Mês</h3>
        <span className="text-muted" style={{ fontSize: 12 }}>desde a primeira reunião</span>
      </div>
      <LineChart points={linhaPorMes} highlightIndex={linhaHighlight} />
    </div>
  );
}
