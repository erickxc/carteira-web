import { LineChart } from '../LineChart';
import { Card } from '../../ui';

interface Ponto { label: string; full: string; value: number }

interface CrescimentoCarteiraCardProps {
  pontos: Ponto[];
  /** Início do log de status (dd/mm/aaaa); antes disso os meses são aproximação. */
  inicioHistorico: string | null;
}

/** Atendimentos ativos no fim de cada mês — sobe e desce com entradas e saídas. */
export function CrescimentoCarteiraCard({ pontos, inicioHistorico }: CrescimentoCarteiraCardProps) {
  return (
    <Card>
      <div className="section-header">
        <h3>Crescimento da Carteira</h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>atendimentos ativos no fim de cada mês</span>
      </div>
      {pontos.length < 2 ? (
        <div className="empty-state">Histórico insuficiente para traçar a evolução.</div>
      ) : (
        <LineChart points={pontos} unidade="atendimento(s)" titulo="Crescimento da carteira" ocultarRotulos={pontos.length > 12} />
      )}
      <p className="kpi-como-conta">
        {inicioHistorico
          ? `O histórico de status começou em ${inicioHistorico}. Meses anteriores usam o status de hoje e aparecem como "aproximado".`
          : 'O histórico de status ainda não começou: todos os meses usam o status de hoje e são aproximação.'}
      </p>
    </Card>
  );
}
