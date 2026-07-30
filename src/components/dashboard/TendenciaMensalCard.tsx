import { LineChart } from '../LineChart';
import { Card } from '../../ui';

interface Ponto { label: string; full: string; value: number }

interface TendenciaMensalCardProps {
  linhaPorMes: Ponto[];
  linhaHighlight: number;
}

/** "Reuniões por Mês" — linha do tempo desde a primeira reunião registrada. */
export function TendenciaMensalCard({ linhaPorMes, linhaHighlight }: TendenciaMensalCardProps) {
  return (
    <Card className="mb-6">
      <div className="section-header">
        <h3>Reuniões Concluídas por Mês</h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>linha cheia = concluídas · ponto pontilhado = projeção (+ agendadas)</span>
      </div>
      <LineChart points={linhaPorMes} highlightIndex={linhaHighlight} />
    </Card>
  );
}
