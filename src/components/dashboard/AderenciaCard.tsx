import { Comparacao, InfoComoConta, Medidor } from './Comparacao';
import { LegendaGrupos } from './LegendaGrupos';
import type { GrupoPrazo } from '../../utils/gruposPrazo';
import type { LinhaAtendimento } from '../../utils/indicadoresPrazo';
import { Card, Chip } from '../../ui';
import type { ServicoCad } from '../../utils/cadenciaServico';

type FiltroServico = ServicoCad | 'Todos';
const SERVICOS: FiltroServico[] = ['Todos', 'Monitoria', 'Price'];

interface AderenciaCardProps {
  total: number;
  emDia: number;
  anterior: { emDia: number; total: number };
  /** Atendimentos com a próxima entrega já marcada (em dia ou não). */
  marcadas: number;
  rotuloAnterior: string;
  filtroServico: FiltroServico;
  onFiltroServico: (s: FiltroServico) => void;
  /** Grupos da legenda; passar o mouse mostra os atendimentos de cada um. */
  grupos: GrupoPrazo[];
  linhas: Map<string, LinhaAtendimento>;
  onAbrirCliente: (id: string) => void;
}

/** "Atendimentos no Ritmo" — dos atendimentos com prazo, quantos estão com TODOS os
 * serviços no prazo (filtrado por serviço: só aquele). A quebra de quem está fora
 * do prazo é informativa e não muda o número principal. */
export function AderenciaCard({
  total, emDia, marcadas,
  anterior, rotuloAnterior, filtroServico, onFiltroServico, grupos, linhas, onAbrirCliente,
}: AderenciaCardProps) {
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
          <div className="kpi-linha">
            <Comparacao atual={emDia} anterior={anterior.total > 0 ? anterior.emDia : null} subirEhBom rotulo={rotuloAnterior} />
            {marcadas > 0 && <span className="text-text-muted" style={{ fontSize: 12 }}>{marcadas} com entrega marcada</span>}
          </div>
          <LegendaGrupos grupos={grupos} linhas={linhas} onAbrirCliente={onAbrirCliente} />
        </>
      )}
    </Card>
  );
}
