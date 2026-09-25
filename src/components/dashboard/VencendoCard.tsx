import { format } from 'date-fns';
import { Card, Chip } from '../../ui';
import type { ServicoCad } from '../../utils/cadenciaServico';

type FiltroServico = ServicoCad | 'Todos';
const SERVICOS: FiltroServico[] = ['Todos', 'Monitoria', 'Price'];
const SERVICO_LABEL: Record<FiltroServico, string> = {
  Todos: 'Geral', Monitoria: 'Monitoria', Price: 'Precificação',
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

/** "Vencendo" — prazos de Monitoria/Price a menos de 5 dias, sem reunião futura marcada
 * (`itensVencendo` do motor compartilhado). Um atendimento com 2 serviços vencendo aparece 2x. */
export function VencendoCard({ total, itens, filtroServico, onFiltroServico }: VencendoCardProps) {
  return (
    <Card className="cobertura-card gauge-card">
      <div className="section-header">
        <h3>Vencendo {total > 0 && <span className="vencendo-total">{total}</span>}</h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>próx. 5 dias</span>
      </div>
      <p className="text-text-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 12, lineHeight: 1.4 }}>
        Prazo de Monitoria ou Precificação <strong>vencendo nos próximos 5 dias</strong>, sem reunião marcada.
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
          <ul className="vencendo-lista">
            {itens.map((i) => (
              <li key={`${i.nome}·${i.servico}`}>
                <span className="vencendo-lista-info">
                  <span className="vencendo-lista-nome" title={i.nome}>{i.nome}</span>
                  <span className="vencendo-lista-servico">{i.servico}</span>
                </span>
                <span className="vencendo-lista-data">{format(i.data, 'dd/MM')}</span>
                <span className={`vencendo-lista-dias${i.dias === 0 ? ' is-hoje' : ''}`}>
                  {i.dias === 0 ? 'hoje' : `${i.dias} dia${i.dias === 1 ? '' : 's'}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
