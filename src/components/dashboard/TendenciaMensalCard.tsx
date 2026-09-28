import { LineChart } from '../LineChart';
import { Card } from '../../ui';
import { rotuloModo, type ModoContagem } from '../../utils/analises';

interface Ponto { label: string; full: string; value: number }

interface TendenciaMensalCardProps {
  linhaPorMes: Ponto[];
  linhaHighlight: number;
  modo: ModoContagem;
}

/** "Reuniões por Mês" — linha do tempo desde a primeira reunião registrada. */
export function TendenciaMensalCard({ linhaPorMes, linhaHighlight, modo }: TendenciaMensalCardProps) {
  const nome = rotuloModo(modo);
  return (
    <Card className="kpi-card">
      <div className="section-header">
        <h3>{nome.Plural} concluídas por mês</h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>linha cheia = concluídas · ponto pontilhado = projeção (+ agendadas)</span>
      </div>
      <LineChart points={linhaPorMes} highlightIndex={linhaHighlight} unidade={nome.plural} titulo={`${nome.Plural} concluídas por mês`} />
    </Card>
  );
}
