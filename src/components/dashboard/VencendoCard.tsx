import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { DonutChart } from '../DonutChart';
import { GaugeDetalhe } from './GaugeDetalhe';
import { Card, Chip } from '../../ui';
import type { ServicoCad } from '../../utils/cadenciaServico';

type FiltroServico = ServicoCad | 'Todos';
const SERVICOS: FiltroServico[] = ['Todos', 'Monitoria', 'Price', 'Relatório'];
const SERVICO_LABEL: Record<FiltroServico, string> = {
  Todos: 'Geral', Monitoria: 'Monitoria', Price: 'Precificação', 'Relatório': 'Relatório',
};

interface VencendoCardProps {
  total: number;
  vencendo: number;
  resto: number;
  pct: number;
  vencendoClientes: string[];
  restoClientes: string[];
  filtroServico: FiltroServico;
  onFiltroServico: (s: FiltroServico) => void;
}

/** "Vencendo" — clientes com Monitoria, Precificação ou Relatório vencendo nos
 * próximos 7 dias (janela própria, maior que a de 5 dias usada em Ações) e
 * sem cobertura já marcada. Cálculo separado de buildFilaCadencia — ver spec. */
export function VencendoCard({ total, vencendo, resto, pct, vencendoClientes, restoClientes, filtroServico, onFiltroServico }: VencendoCardProps) {
  const [aberto, setAberto] = useState(false);
  return (
    <Card className="cobertura-card gauge-card">
      <div className="section-header">
        <h3>Vencendo</h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>{total} clientes</span>
      </div>
      <p className="text-text-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 12, lineHeight: 1.4, minHeight: '2.8em' }}>
        Clientes com Monitoria, Precificação ou Relatório <strong>vencendo nos próximos 7 dias</strong>.
      </p>
      <div className="gauge-card-filtros flex flex-wrap gap-[0.4rem] mb-4">
        {SERVICOS.map((s) => (
          <Chip key={s} active={filtroServico === s} onClick={() => onFiltroServico(s)}>{SERVICO_LABEL[s]}</Chip>
        ))}
      </div>
      {total === 0 ? (
        <div className="empty-state">Nenhum cliente na régua.</div>
      ) : (
        <DonutChart
          items={[
            { label: 'Vencendo', value: vencendo },
            { label: 'Resto da carteira', value: resto },
          ]}
          colors={['var(--warning)', 'var(--border-strong)']}
          centerValue={`${pct}%`}
          centerLabel="vencendo"
          size={96}
          thickness={13}
        />
      )}
      {total > 0 && (
        <>
          <button type="button" className="gauge-toggle" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
            {aberto ? 'Ver menos' : 'Ver clientes'} <ChevronDown size={14} className={aberto ? 'gauge-toggle-icon is-open' : 'gauge-toggle-icon'} />
          </button>
          <GaugeDetalhe aberto={aberto} grupos={[
            { label: 'Vencendo', cor: 'var(--warning)', clientes: vencendoClientes },
            { label: 'Resto da carteira', cor: 'var(--border-strong)', clientes: restoClientes },
          ]} />
        </>
      )}
    </Card>
  );
}
