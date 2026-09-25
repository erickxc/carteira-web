import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { GaugeDetalhe } from './GaugeDetalhe';
import { Comparacao, Medidor } from './Comparacao';
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
  emDiaClientes: string[];
  agendaMarcadaClientes: string[];
  contatoRecenteClientes: string[];
  precisaClientes: string[];
  anterior: { emDia: number; total: number };
  rotuloAnterior: string;
  filtroServico: FiltroServico;
  onFiltroServico: (s: FiltroServico) => void;
}

/** "Atendimentos no Ritmo" — dos atendimentos com prazo, quantos estão com TODOS os
 * serviços no prazo (filtrado por serviço: só aquele). Fora do prazo é quebrado em
 * três situações informativas, que não mudam o número principal. */
export function AderenciaCard({
  total, emDia, agendaMarcada, contatoRecente, precisa,
  emDiaClientes, agendaMarcadaClientes, contatoRecenteClientes, precisaClientes,
  anterior, rotuloAnterior, filtroServico, onFiltroServico,
}: AderenciaCardProps) {
  const [aberto, setAberto] = useState(false);
  const fora = total - emDia;
  return (
    <Card className="cobertura-card gauge-card">
      <div className="section-header">
        <h3>Atendimentos no Ritmo</h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>hoje</span>
      </div>
      <div className="gauge-card-filtros flex flex-wrap gap-[0.4rem] mb-3">
        {SERVICOS.map((s) => (
          <Chip key={s} active={filtroServico === s} onClick={() => onFiltroServico(s)}>{s === 'Todos' ? 'Geral' : s}</Chip>
        ))}
      </div>
      {total === 0 ? (
        <div className="empty-state">Nenhum atendimento com prazo.</div>
      ) : (
        <>
          <p className="kpi-valor-grande">{emDia} <span className="kpi-denominador">de {total} atendimentos em dia</span></p>
          <Medidor n={emDia} total={total} rotulo="atendimentos em dia" />
          <Comparacao atual={emDia} anterior={anterior.total > 0 ? anterior.emDia : null} subirEhBom rotulo={rotuloAnterior} />
          <p className="kpi-como-conta">
            {fora} fora do prazo: {agendaMarcada} com reunião marcada, {contatoRecente} com contato recente, {precisa} sem nada.
          </p>
          <p className="kpi-como-conta">
            Em dia = {filtroServico === 'Todos' ? 'todos os serviços do atendimento' : `o prazo de ${filtroServico}`} dentro do prazo (Monitoria 30 dias, Price 15). Contato e reunião futura não contam.
          </p>
          <button type="button" className="gauge-toggle" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
            {aberto ? 'Ver menos' : 'Ver atendimentos'} <ChevronDown size={14} className={aberto ? 'gauge-toggle-icon is-open' : 'gauge-toggle-icon'} />
          </button>
          <GaugeDetalhe aberto={aberto} grupos={[
            { label: 'Em dia', cor: 'var(--success)', clientes: emDiaClientes },
            { label: 'Fora do prazo, reunião marcada', cor: 'var(--warning)', clientes: agendaMarcadaClientes },
            { label: 'Fora do prazo, contato recente', cor: 'var(--warning)', clientes: contatoRecenteClientes },
            { label: 'Fora do prazo, sem nada', cor: 'var(--danger)', clientes: precisaClientes },
          ]} />
        </>
      )}
    </Card>
  );
}
