import { Comparacao, InfoComoConta, Medidor } from './Comparacao';
import { LegendaGrupos } from './LegendaGrupos';
import type { GrupoPrazo } from '../../utils/gruposPrazo';
import type { LinhaAtendimento } from '../../utils/indicadoresPrazo';
import { Card } from '../../ui';

interface ServicoDist {
  label: string;
  n: number;
  base: number;
  anterior: { n: number; base: number };
}

interface ServicosCardProps {
  servicosDist: ServicoDist[];
  rotuloAnterior: string;
  /** Grupos da legenda; passar o mouse mostra os atendimentos de cada um. */
  grupos: GrupoPrazo[];
  linhas: Map<string, LinhaAtendimento>;
  onAbrirCliente: (id: string) => void;
}

const REGRA = 'Conta só quem tem prazo do serviço (contratado e não independente): Monitoria 30 dias, Price 15. Um atendimento com os dois serviços aparece nas duas linhas.';

/** "Cobertura por Serviço" — dos atendimentos com prazo de cada serviço, quantos estão no prazo. */
export function ServicosCard({ servicosDist, rotuloAnterior, grupos, linhas, onAbrirCliente }: ServicosCardProps) {
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
      <LegendaGrupos grupos={grupos} linhas={linhas} onAbrirCliente={onAbrirCliente} />
    </Card>
  );
}
