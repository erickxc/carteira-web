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
  emDia: number;
  nuncaAgendado: number;
  pct: number;
  vencendoClientes: string[];
  emDiaClientes: string[];
  nuncaAgendadoClientes: string[];
  filtroServico: FiltroServico;
  onFiltroServico: (s: FiltroServico) => void;
}

/** "Vencendo" — do total de AÇÕES AGENDADAS (Monitoria/Precificação/Relatório
 * em dia ou vencendo — quem já venceu fica fora, isso é assunto do card
 * "Carteira no Ritmo"), quantas vencem nos próximos 5 dias (mesma janela do
 * resto do app). Base em itens/ações, não em clientes (um cliente com 2
 * serviços contribui 2x). "Nunca agendado" (nenhum toque real, sem cobertura)
 * fica fora do %, mas some numa coluna própria quando existir — antes era
 * descartado calado. Cálculo separado de buildFilaCadencia — ver spec. */
export function VencendoCard({
  total, vencendo, emDia, nuncaAgendado, pct, vencendoClientes, emDiaClientes, nuncaAgendadoClientes, filtroServico, onFiltroServico,
}: VencendoCardProps) {
  const [aberto, setAberto] = useState(false);
  const temConteudo = total > 0 || nuncaAgendado > 0;
  return (
    <Card className="cobertura-card gauge-card">
      <div className="section-header">
        <h3>Vencendo</h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>{total} ações agendadas</span>
      </div>
      <p className="text-text-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 12, lineHeight: 1.4, minHeight: '2.8em' }}>
        Do total de ações agendadas (Monitoria, Precificação ou Relatório), quantas <strong>vencem nos próximos 5 dias</strong>.
      </p>
      <div className="gauge-card-filtros flex flex-wrap gap-[0.4rem] mb-4">
        {SERVICOS.map((s) => (
          <Chip key={s} active={filtroServico === s} onClick={() => onFiltroServico(s)}>{SERVICO_LABEL[s]}</Chip>
        ))}
      </div>
      {total === 0 ? (
        nuncaAgendado === 0 && <div className="empty-state">Nenhuma ação agendada na régua.</div>
      ) : (
        <DonutChart
          items={[
            { label: 'Vencendo', value: vencendo },
            { label: 'Em dia', value: emDia },
          ]}
          colors={['var(--warning)', 'var(--success)']}
          centerValue={`${pct}%`}
          centerLabel="vencendo"
          size={96}
          thickness={13}
        />
      )}
      {temConteudo && (
        <>
          <button type="button" className="gauge-toggle" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
            {aberto ? 'Ver menos' : 'Ver clientes'} <ChevronDown size={14} className={aberto ? 'gauge-toggle-icon is-open' : 'gauge-toggle-icon'} />
          </button>
          <GaugeDetalhe aberto={aberto} grupos={[
            { label: 'Vencendo', cor: 'var(--warning)', clientes: vencendoClientes },
            { label: 'Em dia', cor: 'var(--success)', clientes: emDiaClientes },
            ...(nuncaAgendado > 0 ? [{ label: 'Nunca agendado', cor: 'var(--danger)', clientes: nuncaAgendadoClientes }] : []),
          ]} />
        </>
      )}
    </Card>
  );
}
