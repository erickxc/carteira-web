import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { GaugeDetalhe } from './GaugeDetalhe';
import { Comparacao, InfoComoConta, Medidor } from './Comparacao';
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

const REGRA = 'Conta só quem tem prazo do serviço (contratado e não independente): Monitoria 30 dias, Price 15. Um atendimento com os dois serviços aparece nas duas linhas.';

/** "Cobertura por Serviço" — dos atendimentos com prazo de cada serviço, quantos estão no prazo. */
export function ServicosCard({ servicosDist, rotuloAnterior }: ServicosCardProps) {
  const [aberto, setAberto] = useState(false);
  return (
    <Card className="kpi-card">
      <div className="section-header">
        <h3>Cobertura por Serviço <InfoComoConta texto={REGRA} /></h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>no prazo hoje</span>
      </div>
      <div className="kpi-servicos">
      {servicosDist.map((s) => (
        <div key={s.label} className="kpi-servico">
          <p className="kpi-servico-nome">{s.label}</p>
          <p className="kpi-valor-grande" style={{ fontSize: '1.6rem' }}>{s.n} <span className="kpi-denominador">de {s.base}</span></p>
          <Medidor n={s.n} total={s.base} rotulo={`com ${s.label} no prazo`} />
          <Comparacao atual={s.n} anterior={s.anterior.base > 0 ? s.anterior.n : null} subirEhBom rotulo={rotuloAnterior} />
        </div>
      ))}
      </div>
      <button type="button" className="gauge-toggle" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
        {aberto ? 'Ver menos' : 'Ver fora do prazo'} <ChevronDown size={14} className={aberto ? 'gauge-toggle-icon is-open' : 'gauge-toggle-icon'} />
      </button>
      <GaugeDetalhe aberto={aberto} grupos={servicosDist.map((s) => ({
        label: `${s.label} fora do prazo`, cor: 'var(--danger)', clientes: s.descobertosClientes,
      }))} />
    </Card>
  );
}
