import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { GaugeDetalhe } from './GaugeDetalhe';
import { Comparacao, InfoComoConta, LegendaCompacta, Medidor } from './Comparacao';
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
 * serviços no prazo (filtrado por serviço: só aquele). A quebra de quem está fora
 * do prazo é informativa e não muda o número principal. */
export function AderenciaCard({
  total, emDia, agendaMarcada, contatoRecente, precisa,
  emDiaClientes, agendaMarcadaClientes, contatoRecenteClientes, precisaClientes,
  anterior, rotuloAnterior, filtroServico, onFiltroServico,
}: AderenciaCardProps) {
  const [aberto, setAberto] = useState(false);
  const regra = `Em dia = ${filtroServico === 'Todos' ? 'todos os serviços do atendimento' : `o prazo de ${filtroServico}`} dentro do prazo (Monitoria 30 dias, Price 15). Só entrega concluída com o serviço marcado zera o prazo; contato e reunião futura não contam.`;
  return (
    <Card className="kpi-card">
      <div className="section-header">
        <h3>Atendimentos no Ritmo <InfoComoConta texto={regra} /></h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>hoje</span>
      </div>
      <div className="flex flex-wrap gap-[0.35rem] mb-2">
        {SERVICOS.map((s) => (
          <Chip key={s} active={filtroServico === s} onClick={() => onFiltroServico(s)}>{s === 'Todos' ? 'Geral' : s}</Chip>
        ))}
      </div>
      {total === 0 ? (
        <div className="empty-state">Nenhum atendimento com prazo.</div>
      ) : (
        <>
          <p className="kpi-valor-grande">{emDia} <span className="kpi-denominador">de {total} em dia</span></p>
          <Medidor n={emDia} total={total} rotulo="atendimentos em dia" />
          <Comparacao atual={emDia} anterior={anterior.total > 0 ? anterior.emDia : null} subirEhBom rotulo={rotuloAnterior} />
          <LegendaCompacta itens={[
            { cor: 'var(--warning)', label: 'reunião marcada', n: agendaMarcada },
            { cor: 'var(--warning)', label: 'contato recente', n: contatoRecente },
            { cor: 'var(--danger)', label: 'sem nada', n: precisa },
          ]} />
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
