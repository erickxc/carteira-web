import { format } from 'date-fns';
import { Card, NumeroRolante } from '../../ui';
import { InfoComoConta, Medidor } from './Comparacao';
import { rotuloModo, type Cancelamentos, type ModoContagem } from '../../utils/analises';

/**
 * "Cancelamentos" — no mês de referência, quantas entregas o CLIENTE cancelou
 * ou deixou de comparecer, e quem. O que nós cancelamos e o legado sem motivo
 * aparecem na quebra (não são culpa do cliente); lançamento errado sai da
 * conta. Quem cancelou 2+ vezes no mês fica em vermelho: é padrão, não acaso.
 */
export function CancelamentosCard({ dados, modo, onAbrirCliente }: { dados: Cancelamentos; modo: ModoContagem; onAbrirCliente: (id: string) => void }) {
  const nome = rotuloModo(modo);
  const { itens, doCliente, porCategoria, comDesfecho, lancamentosErrados } = dados;
  const pct = comDesfecho > 0 ? Math.round((doCliente / comDesfecho) * 100) : 0;
  const canceladas = doCliente + porCategoria.nos_cancelamos + porCategoria.sem_categoria;
  const quebra = [
    porCategoria.cliente_cancelou > 0 && `cliente cancelou ${porCategoria.cliente_cancelou}`,
    porCategoria.cliente_ausente > 0 && `não apareceu ou não respondeu ${porCategoria.cliente_ausente}`,
    porCategoria.nos_cancelamos > 0 && `nós cancelamos ${porCategoria.nos_cancelamos}`,
    porCategoria.sem_categoria > 0 && `sem motivo ${porCategoria.sem_categoria}`,
  ].filter(Boolean).join(' · ');
  return (
    <Card className="kpi-card">
      <div className="section-header">
        <h3>Cancelamentos <InfoComoConta texto={`${nome.Plural} do mês canceladas pelo cliente (cancelou, pediu para remarcar, não apareceu ou não respondeu), sobre as ${nome.plural} com desfecho (realizadas + canceladas). As que nós cancelamos e as antigas sem motivo aparecem na quebra, fora do número. Lançamento errado (duplicado, errata) não conta em nada. Remarcada não é cancelada.`} /></h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>no mês</span>
      </div>
      <p className="kpi-valor-grande"><NumeroRolante valor={doCliente} /> <span className="kpi-denominador">de {comDesfecho} {nome.plural} canceladas pelo cliente ({pct}%)</span></p>
      {/* Medidor de realização (o complemento): verde quando quase nada é cancelado. */}
      <Medidor n={comDesfecho - canceladas} total={comDesfecho} rotulo={`${nome.plural} realizadas`} />
      {quebra && <p className="kpi-comparacao is-neutra">{quebra}</p>}
      {lancamentosErrados > 0 && (
        <p className="kpi-comparacao is-neutra">{lancamentosErrados} {lancamentosErrados === 1 ? 'lançamento errado' : 'lançamentos errados'} fora da conta</p>
      )}
      {itens.length > 0 && (
        <ul className="lista-analise">
          {itens.map((i) => (
            <li key={i.id}>
              <button type="button" className="link-button lista-analise-nome" onClick={() => onAbrirCliente(i.id)} title={i.nome}>{i.nome}</button>
              <span className={i.canceladas >= 2 ? 'lista-analise-valor is-ruim' : 'lista-analise-valor'}>{i.canceladas}</span>
              <span className="lista-analise-data">{i.ultima ? `últ. ${format(i.ultima, 'dd/MM')}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
