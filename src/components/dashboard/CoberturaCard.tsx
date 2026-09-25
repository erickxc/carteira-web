import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { GaugeDetalhe } from './GaugeDetalhe';
import { Comparacao, Medidor } from './Comparacao';
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

/** "Cobertura dos Atendimentos" — atendimentos com pelo menos 1 entrega CONCLUÍDA
 * (reunião, relatório ou precificação) no mês e no anterior. */
export function CoberturaCard({ total, cobertos, semContato, janela, cobertosClientes, semContatoClientes, anterior, rotuloAnterior }: CoberturaCardProps) {
  const [aberto, setAberto] = useState(false);
  return (
    <Card className="cobertura-card gauge-card">
      <div className="section-header">
        <h3>Cobertura dos Atendimentos</h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>{janela}</span>
      </div>
      {/* Mesma altura da linha de filtros do card ao lado, pra alinhar os números. */}
      <div className="gauge-card-filtros mb-3" aria-hidden="true" />
      {total === 0 ? (
        <div className="empty-state">Nenhum atendimento ativo.</div>
      ) : (
        <>
          <p className="kpi-valor-grande">{cobertos} <span className="kpi-denominador">de {total} atendimentos com entrega</span></p>
          <Medidor n={cobertos} total={total} rotulo="atendimentos com entrega" />
          <Comparacao atual={cobertos} anterior={anterior.total > 0 ? anterior.cobertos : null} subirEhBom rotulo={rotuloAnterior} />
          <p className="kpi-como-conta">{semContato} sem nenhuma entrega na janela.</p>
          <p className="kpi-como-conta">
            Conta reunião, relatório ou precificação CONCLUÍDOS no mês e no anterior. Agendado não conta. Quem só tem serviços independentes fica fora.
          </p>
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
