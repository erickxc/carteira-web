import { LineChart } from '../LineChart';
import { Card } from '../../ui';

interface Ponto { label: string; full: string; value: number }

interface CrescimentoCarteiraCardProps {
  pontos: Ponto[];
}

/** Total de clientes cadastrados (acumulado) mês a mês, desde o primeiro `createdAt`. */
export function CrescimentoCarteiraCard({ pontos }: CrescimentoCarteiraCardProps) {
  return (
    <Card className="mb-6">
      <div className="section-header">
        <h3>Crescimento da Carteira</h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>total de clientes cadastrados, acumulado</span>
      </div>
      {pontos.length < 2 ? (
        <div className="empty-state">Histórico insuficiente para traçar a evolução.</div>
      ) : (
        <LineChart points={pontos} unidade="cliente(s)" ocultarRotulos={pontos.length > 12} />
      )}
    </Card>
  );
}
