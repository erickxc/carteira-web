import { Comparacao, InfoComoConta, Medidor } from './Comparacao';
import { LegendaGrupos } from './LegendaGrupos';
import type { GrupoPrazo } from '../../utils/gruposPrazo';
import type { LinhaAtendimento } from '../../utils/indicadoresPrazo';
import { Card } from '../../ui';

interface CoberturaCardProps {
  total: number;
  cobertos: number;
  /** Janela, ex.: "ago + set". */
  janela: string;
  anterior: { cobertos: number; total: number };
  rotuloAnterior: string;
  /** Grupos da legenda; passar o mouse mostra os atendimentos de cada um. */
  grupos: GrupoPrazo[];
  linhas: Map<string, LinhaAtendimento>;
  onAbrirCliente: (id: string) => void;
}

const REGRA = 'Atendimentos com pelo menos 1 reunião, relatório ou precificação CONCLUÍDA no mês e no anterior. Agendado não conta. Quem só tem serviços independentes fica fora.';

/** "Cobertura dos Atendimentos" — atendimentos com pelo menos 1 entrega CONCLUÍDA no mês e no anterior. */
export function CoberturaCard({ total, cobertos, janela, anterior, rotuloAnterior, grupos, linhas, onAbrirCliente }: CoberturaCardProps) {
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
          <Comparacao atual={cobertos} anterior={anterior.total > 0 ? anterior.cobertos : null} subirEhBom rotulo={rotuloAnterior} />
          <LegendaGrupos grupos={grupos} linhas={linhas} onAbrirCliente={onAbrirCliente} />
        </>
      )}
    </Card>
  );
}
