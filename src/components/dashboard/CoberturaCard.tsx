import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { GaugeDetalhe } from './GaugeDetalhe';
import { Comparacao, InfoComoConta, Medidor } from './Comparacao';
import { Card } from '../../ui';

interface CoberturaCardProps {
  total: number;
  cobertos: number;
  semContato: number;
  /** Janela, ex.: "ago + set". */
  janela: string;
  cobertosClientes: string[];
  semContatoClientes: string[];
  anterior: { cobertos: number; total: number };
  rotuloAnterior: string;
}

const REGRA = 'Atendimentos com pelo menos 1 reunião, relatório ou precificação CONCLUÍDA no mês e no anterior. Agendado não conta. Quem só tem serviços independentes fica fora.';

/** "Cobertura dos Atendimentos" — atendimentos com pelo menos 1 entrega CONCLUÍDA no mês e no anterior. */
export function CoberturaCard({ total, cobertos, semContato, janela, cobertosClientes, semContatoClientes, anterior, rotuloAnterior }: CoberturaCardProps) {
  const [aberto, setAberto] = useState(false);
  return (
    <Card className="kpi-card">
      <div className="section-header">
        <h3>Cobertura dos Atendimentos <InfoComoConta texto={REGRA} /></h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>{janela}</span>
      </div>
      {total === 0 ? (
        <div className="empty-state">Nenhum atendimento ativo.</div>
      ) : (
        <>
          <p className="kpi-valor-grande">{cobertos} <span className="kpi-denominador">de {total} com entrega</span></p>
          <Medidor n={cobertos} total={total} rotulo="atendimentos com entrega" />
          <div className="kpi-linha">
            <Comparacao atual={cobertos} anterior={anterior.total > 0 ? anterior.cobertos : null} subirEhBom rotulo={rotuloAnterior} />
            <span className="kpi-legenda" style={{ margin: 0 }}><span><i style={{ background: 'var(--danger)' }} />sem entrega <strong>{semContato}</strong></span></span>
          </div>
          <button type="button" className="gauge-toggle" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
            {aberto ? 'Ver menos' : 'Ver atendimentos'} <ChevronDown size={14} className={aberto ? 'gauge-toggle-icon is-open' : 'gauge-toggle-icon'} />
          </button>
          <GaugeDetalhe aberto={aberto} grupos={[
            { label: 'Com entrega', cor: 'var(--success)', clientes: cobertosClientes },
            { label: 'Sem entrega', cor: 'var(--danger)', clientes: semContatoClientes },
          ]} />
        </>
      )}
    </Card>
  );
}
