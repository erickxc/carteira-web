import { useState } from 'react';
import { format } from 'date-fns';
import { Card, Chip } from '../../ui';
import { InfoComoConta } from './Comparacao';
import { AbasDeslizantes } from './AbasDeslizantes';
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
  /** Prazos que venceram nos últimos 15 dias sem entrega marcada (`dias` = dias vencido). */
  vencidos: ItemVencendo[];
  filtroServico: FiltroServico;
  onFiltroServico: (s: FiltroServico) => void;
}

type Aba = 'vencidos' | 'vencendo';

/** Prazos de Monitoria/Price em volta de hoje, sem entrega marcada: os que venceram
 * nos últimos 15 dias (ninguém agiu) e os que vencem nos próximos 5 (`itensVencendo`
 * do motor compartilhado). Um atendimento com 2 serviços aparece 2x. */
export function VencendoCard({ total, itens, vencidos, filtroServico, onFiltroServico }: VencendoCardProps) {
  const [aba, setAba] = useState<Aba>('vencidos');
  const lista = aba === 'vencidos' ? vencidos : itens;
  return (
    <Card className="kpi-card">
      <div className="vencendo-topo">
        <AbasDeslizantes cheio rotulo="Prazos" ativa={aba} onTrocar={setAba} abas={[
          { key: 'vencidos', label: 'Vencidos', contagem: vencidos.length, classeContagem: 'vencendo-total is-vencido' },
          { key: 'vencendo', label: 'Vencendo', contagem: total, classeContagem: 'vencendo-total' },
        ]} />
        <InfoComoConta texto="Prazo de Monitoria (30 dias) ou Price (15 dias) que venceu nos últimos 15 dias ou vence nos próximos 5, sem entrega marcada." />
      </div>
      <div className="flex flex-wrap items-center gap-[0.35rem] mb-2">
        {SERVICOS.map((s) => (
          <Chip key={s} active={filtroServico === s} onClick={() => onFiltroServico(s)}>{SERVICO_LABEL[s]}</Chip>
        ))}
        <span className="ml-auto text-text-muted" style={{ fontSize: 12 }}>{aba === 'vencidos' ? 'últimos 15 dias' : 'próximos 5 dias'}</span>
      </div>
      <div key={aba} className="afazer-conteudo vencendo-resumo">
      {lista.length === 0 ? (
        <div className="empty-state">{aba === 'vencidos' ? 'Nenhum prazo venceu nos últimos 15 dias sem entrega marcada.' : 'Nenhum prazo vencendo nos próximos 5 dias.'}</div>
      ) : (
          <ul className="vencendo-lista">
            {lista.map((i) => (
              <li key={`${i.nome}·${i.servico}`}>
                <span className="vencendo-lista-info">
                  <span className="vencendo-lista-nome" title={i.nome}>{i.nome}</span>
                  <span className="vencendo-lista-servico">{i.servico}</span>
                </span>
                <span className="vencendo-lista-data">{format(i.data, 'dd/MM')}</span>
                <span className={`vencendo-lista-dias${i.dias === 0 || aba === 'vencidos' ? ' is-hoje' : ''}`}>
                  {i.dias === 0 ? 'hoje' : `${aba === 'vencidos' ? 'há ' : ''}${i.dias} dia${i.dias === 1 ? '' : 's'}`}
                </span>
              </li>
            ))}
          </ul>
      )}
      </div>
    </Card>
  );
}
