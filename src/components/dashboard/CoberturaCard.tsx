import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { DonutChart } from '../DonutChart';
import { GaugeDetalhe } from './GaugeDetalhe';
import { Card } from '../../ui';

interface CoberturaCardProps {
  total: number;
  cobertos: number;
  semContato: number;
  pct: number;
  mesAno: string;
  cobertosClientes: string[];
  semContatoClientes: string[];
}

/** "Cobertura da Carteira" — % de clientes ativos com ao menos 1 reunião no período. */
export function CoberturaCard({ total, cobertos, semContato, pct, mesAno, cobertosClientes, semContatoClientes }: CoberturaCardProps) {
  const [aberto, setAberto] = useState(false);
  return (
    <Card className="cobertura-card gauge-card">
      <div className="section-header">
        <h3>Cobertura da Carteira</h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>{mesAno} · {total} ativos</span>
      </div>
      <p className="text-text-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 12, lineHeight: 1.4, minHeight: '2.8em' }}>
        Clientes com <strong>ao menos 1 reunião ou relatório</strong> nos últimos 2 meses vs. <strong>sem contato</strong>.
      </p>
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
      {total > 0 && (
        <>
          <button type="button" className="gauge-toggle" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
            {aberto ? 'Ver menos' : 'Ver clientes'} <ChevronDown size={14} className={aberto ? 'gauge-toggle-icon is-open' : 'gauge-toggle-icon'} />
          </button>
          <GaugeDetalhe aberto={aberto} grupos={[
            { label: 'Atendidos', cor: 'var(--accent)', clientes: cobertosClientes },
            { label: 'Sem contato', cor: 'var(--border-strong)', clientes: semContatoClientes },
          ]} />
        </>
      )}
    </Card>
  );
}
