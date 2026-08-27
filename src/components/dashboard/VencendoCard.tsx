import { format } from 'date-fns';
import { Card, Chip } from '../../ui';
import type { ServicoCad } from '../../utils/cadenciaServico';

type FiltroServico = ServicoCad | 'Todos';
const SERVICOS: FiltroServico[] = ['Todos', 'Monitoria', 'Price', 'Relatório'];
const SERVICO_LABEL: Record<FiltroServico, string> = {
  Todos: 'Geral', Monitoria: 'Monitoria', Price: 'Precificação', 'Relatório': 'Relatório',
};

interface ItemVencendo {
  nome: string;
  servico: string;
  data: Date;
  dias: number;
}

interface VencendoCardProps {
  total: number;
  itens: ItemVencendo[];
  filtroServico: FiltroServico;
  onFiltroServico: (s: FiltroServico) => void;
}

/** "Vencendo" — só quem está VENCENDO de verdade (Monitoria/Precificação/
 * Relatório) nos próximos 5 dias (mesma janela do resto do app). Sem donut —
 * número grande + lista ao lado com data e dias restantes por item. Base em
 * itens/ações, não em clientes (um cliente com 2 serviços contribui 2x).
 * Cálculo separado de buildFilaCadencia — ver spec. */
export function VencendoCard({ total, itens, filtroServico, onFiltroServico }: VencendoCardProps) {
  return (
    <Card className="cobertura-card gauge-card">
      <div className="section-header">
        <h3>Vencendo</h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>próx. 5 dias</span>
      </div>
      <p className="text-text-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 12, lineHeight: 1.4, minHeight: '2.8em' }}>
        Monitoria, Precificação ou Relatório <strong>vencendo nos próximos 5 dias</strong>.
      </p>
      <div className="gauge-card-filtros flex flex-wrap gap-[0.4rem] mb-4">
        {SERVICOS.map((s) => (
          <Chip key={s} active={filtroServico === s} onClick={() => onFiltroServico(s)}>{SERVICO_LABEL[s]}</Chip>
        ))}
      </div>
      {total === 0 ? (
        <div className="empty-state">Nenhuma ação vencendo nos próximos 5 dias. 🎉</div>
      ) : (
        <div className="vencendo-resumo">
          <div className="vencendo-numero">
            <div className="vencendo-numero-valor">{total}</div>
            <div className="vencendo-numero-label">vencendo</div>
          </div>
          <ul className="vencendo-lista">
            {itens.map((i) => (
              <li key={`${i.nome}·${i.servico}`}>
                <span className="vencendo-lista-info">
                  <span className="vencendo-lista-nome" title={i.nome}>{i.nome}</span>
                  <span className="vencendo-lista-servico">{i.servico}</span>
                </span>
                <span className="vencendo-lista-data">{format(i.data, 'dd/MM')}</span>
                <span className="vencendo-lista-dias">{i.dias === 0 ? 'hoje' : `${i.dias}d`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
