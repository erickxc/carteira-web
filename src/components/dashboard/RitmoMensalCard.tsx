import { Card } from '../../ui';
import { LineChart } from '../LineChart';
import { InfoComoConta } from './Comparacao';

interface Ponto { label: string; full: string; value: number }

/** "Ritmo mês a mês" — % de atendimentos em dia no fim de cada mês (o mês escolhido é o último ponto). */
export function RitmoMensalCard({ pontos }: { pontos: Ponto[] }) {
  return (
    <Card className="kpi-card">
      <div className="section-header">
        <h3>Ritmo mês a mês <InfoComoConta texto="Carteira inteira (não segue o filtro de monitor): % de todos os atendimentos ativos com os prazos em dia no último dia de cada mês (no mês corrente, hoje). Atendimento sem prazo (só serviço independente) conta como em dia. Meses antigos são aproximados: o status dos eventos é o de hoje." /></h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>carteira inteira</span>
      </div>
      {pontos.length < 2 ? (
        <div className="empty-state">Histórico curto demais para uma tendência.</div>
      ) : (
        <LineChart points={pontos} highlightIndex={pontos.length - 1} height={150} largura={440} teto={100} formatValue={(v) => `${Math.round(v)}%`} unidade="em dia" titulo="Ritmo mês a mês" />
      )}
    </Card>
  );
}
