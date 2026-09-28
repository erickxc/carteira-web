import { format } from 'date-fns';
import { Card } from '../../ui';
import { InfoComoConta, Medidor } from './Comparacao';
import { rotuloModo, type Cancelamentos, type ModoContagem } from '../../utils/analises';

/**
 * "Cancelamentos" — reuniões canceladas nos últimos 90 dias e quem cancela.
 * Quem cancelou 2+ vezes fica em vermelho: é padrão, não acaso.
 */
export function CancelamentosCard({ dados, modo, onAbrirCliente }: { dados: Cancelamentos; modo: ModoContagem; onAbrirCliente: (id: string) => void }) {
  const nome = rotuloModo(modo);
  const { itens, canceladas, comDesfecho } = dados;
  const pct = comDesfecho > 0 ? Math.round((canceladas / comDesfecho) * 100) : 0;
  const reincidentes = itens.filter((i) => i.canceladas >= 2).length;
  return (
    <Card className="kpi-card">
      <div className="section-header">
        <h3>Cancelamentos <InfoComoConta texto={`${nome.Plural} canceladas nos últimos 90 dias, sobre as ${nome.plural} com desfecho (realizadas + canceladas). Remarcada não é cancelada.`} /></h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>90 dias</span>
      </div>
      <p className="kpi-valor-grande">{canceladas} <span className="kpi-denominador">de {comDesfecho} {nome.plural} canceladas ({pct}%)</span></p>
      {/* Medidor de realização (o complemento): verde quando quase nada é cancelado. */}
      <Medidor n={comDesfecho - canceladas} total={comDesfecho} rotulo={`${nome.plural} realizadas`} />
      <p className="kpi-comparacao is-neutra">{itens.length} atendimentos cancelaram{reincidentes > 0 ? ` · ${reincidentes} com 2 ou mais` : ''}</p>
      {itens.length > 0 && (
        <ul className="lista-analise">
          {itens.map((i) => (
            <li key={i.id}>
              <button type="button" className="link-button lista-analise-nome" onClick={() => onAbrirCliente(i.id)} title={i.nome}>{i.nome}</button>
              <span className={i.canceladas >= 2 ? 'lista-analise-valor is-ruim' : 'lista-analise-valor'}>{i.canceladas} de {i.comDesfecho}</span>
              <span className="lista-analise-data">{i.ultima ? `últ. ${format(i.ultima, 'dd/MM')}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
