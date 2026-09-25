import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { GaugeDetalhe } from './GaugeDetalhe';
import { Comparacao, Medidor } from './Comparacao';
import { Card } from '../../ui';

interface ServicoDist {
  label: string;
  n: number;
  base: number;
  anterior: { n: number; base: number };
  cobertosClientes: string[];
  descobertosClientes: string[];
}

interface ServicosCardProps {
  servicosDist: ServicoDist[];
  rotuloAnterior: string;
}

/** "Cobertura por Serviço" — dos atendimentos que têm prazo de cada serviço
 * (contratado e não independente), quantos estão no prazo. */
export function ServicosCard({ servicosDist, rotuloAnterior }: ServicosCardProps) {
  const [aberto, setAberto] = useState(false);
  return (
    <Card className="flex flex-col servicos-card">
      <div className="section-header">
        <h3>Cobertura por Serviço</h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>hoje</span>
      </div>
      <div className="flex flex-col gap-4">
        {servicosDist.map((s) => (
          <div key={s.label}>
            <p className="kpi-valor-grande" style={{ fontSize: '1.6rem' }}>
              {s.n} <span className="kpi-denominador">de {s.base} atendimentos com <strong>{s.label}</strong> no prazo</span>
            </p>
            <Medidor n={s.n} total={s.base} rotulo={`com ${s.label} no prazo`} />
            <Comparacao atual={s.n} anterior={s.anterior.base > 0 ? s.anterior.n : null} subirEhBom rotulo={rotuloAnterior} />
          </div>
        ))}
      </div>
      <p className="kpi-como-conta">
        Conta só quem tem prazo do serviço (contratado e não independente). Um atendimento com os dois serviços aparece nas duas linhas.
      </p>
      <button type="button" className="gauge-toggle" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
        {aberto ? 'Ver menos' : 'Ver fora do prazo'} <ChevronDown size={14} className={aberto ? 'gauge-toggle-icon is-open' : 'gauge-toggle-icon'} />
      </button>
      <GaugeDetalhe aberto={aberto} grupos={servicosDist.map((s) => ({
        label: `${s.label} fora do prazo`, cor: 'var(--danger)', clientes: s.descobertosClientes,
      }))} />
    </Card>
  );
}
