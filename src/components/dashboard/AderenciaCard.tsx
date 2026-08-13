import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { DonutChart } from '../DonutChart';
import { GaugeDetalhe } from './GaugeDetalhe';
import { Card, Chip } from '../../ui';
import type { ServicoCad } from '../../utils/cadenciaServico';

type FiltroServico = ServicoCad | 'Todos';
const SERVICOS: FiltroServico[] = ['Todos', 'Monitoria', 'Price'];

interface AderenciaCardProps {
  total: number;
  emDia: number;
  agendaMarcada: number;
  contatoRecente: number;
  precisa: number;
  pct: number;
  emDiaClientes: string[];
  agendaMarcadaClientes: string[];
  contatoRecenteClientes: string[];
  precisaClientes: string[];
  filtroServico: FiltroServico;
  onFiltroServico: (s: FiltroServico) => void;
}

/** "Aderência à Cadência" — % da carteira (clientes ativos, fora Marco) dentro
 * da cadência por serviço vs. quem precisa de ação (vencido/vencendo/nunca).
 * "Todos" (geral) conta em dia se PELO MENOS 1 serviço contratado está em dia;
 * os filtros Monitoria/Price olham só o relógio daquele serviço. Quem não está
 * em dia mas já tem reunião futura marcada cai em "Agenda marcada" (já sendo
 * tratado), não junto com "Precisa contato" (ninguém cuidando ainda). */
export function AderenciaCard({ total, emDia, agendaMarcada, contatoRecente, precisa, pct, emDiaClientes, agendaMarcadaClientes, contatoRecenteClientes, precisaClientes, filtroServico, onFiltroServico }: AderenciaCardProps) {
  const [aberto, setAberto] = useState(false);
  return (
    <Card className="cobertura-card gauge-card">
      <div className="section-header">
        <h3>Carteira no Ritmo</h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>{total} clientes</span>
      </div>
      <p className="text-text-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 12, lineHeight: 1.4, minHeight: '2.8em' }}>
        Clientes com Monitoria/Price <strong>em dia</strong>, <strong>com agenda marcada</strong>, <strong>contatados recentemente</strong> (aguardando retorno) ou <strong>atrasados</strong> na cadência.
      </p>
      <div className="gauge-card-filtros flex flex-wrap gap-[0.4rem] mb-4">
        {SERVICOS.map((s) => (
          <Chip key={s} active={filtroServico === s} onClick={() => onFiltroServico(s)}>{s === 'Todos' ? 'Geral' : s}</Chip>
        ))}
      </div>
      {total === 0 ? (
        <div className="empty-state">Nenhum cliente na régua.</div>
      ) : (
        <DonutChart
          items={[
            { label: 'Em dia', value: emDia },
            { label: 'Agenda marcada', value: agendaMarcada },
            { label: 'Contato recente', value: contatoRecente },
            { label: 'Precisa contato', value: precisa },
          ]}
          colors={['var(--success)', 'var(--warning)', 'var(--accent)', 'var(--danger)']}
          centerValue={`${pct}%`}
          centerLabel="em dia"
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
            { label: 'Em dia', cor: 'var(--success)', clientes: emDiaClientes },
            { label: 'Agenda marcada', cor: 'var(--warning)', clientes: agendaMarcadaClientes },
            { label: 'Contato recente', cor: 'var(--accent)', clientes: contatoRecenteClientes },
            { label: 'Precisa contato', cor: 'var(--danger)', clientes: precisaClientes },
          ]} />
        </>
      )}
    </Card>
  );
}
