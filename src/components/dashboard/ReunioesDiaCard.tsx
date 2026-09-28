import { format, getDay, isToday } from 'date-fns';
import { Card } from '../../ui';
import { InfoComoConta } from './Comparacao';
import { rotuloModo, type ModoContagem, type ReunioesPorDia } from '../../utils/analises';

const SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex'];
const formatar1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/**
 * "Reuniões por dia" — calendário dos dias úteis do mês com a quantidade de
 * reuniões (realizadas e marcadas). Cor mais forte = dia mais cheio: mostra os
 * dias sobrecarregados e os vazios para encaixar reunião.
 */
export function ReunioesDiaCard({ dados, mes, modo }: { dados: ReunioesPorDia; mes: string; modo: ModoContagem }) {
  const nome = rotuloModo(modo);
  const uteis = dados.dias.filter((d) => getDay(d.data) >= 1 && getDay(d.data) <= 5);
  const max = Math.max(1, ...uteis.map((d) => d.n));
  // Espaços vazios antes do dia 1 para alinhar com a coluna do dia da semana.
  const vazios = uteis.length ? getDay(uteis[0].data) - 1 : 0;
  return (
    <Card className="kpi-card">
      <div className="section-header">
        <h3>{nome.Plural} por dia <InfoComoConta texto={`Número grande = ${nome.plural} realizadas e marcadas no dia; em vermelho no canto, as canceladas (não ocupam agenda, mas explicam dia vazio). Média e dias vazios contam só os dias úteis até hoje; a projeção soma as marcadas nos dias que faltam e divide por todos os dias úteis do mês. Feriado aparece apagado.`} /></h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>{mes}</span>
      </div>
      <p className="kpi-valor-grande" style={{ fontSize: '1.6rem' }}>
        {formatar1.format(dados.mediaPorDiaUtil)} <span className="kpi-denominador">por dia útil</span>
      </p>
      {/* Pico e dias vazios o calendário já mostra; aqui só o que ele não mostra. */}
      <p className="kpi-comparacao is-neutra">
        {dados.projecaoPorDiaUtil !== null && <span title="Feitas até hoje + marcadas nos dias que faltam, sobre todos os dias úteis do mês">projeção {formatar1.format(dados.projecaoPorDiaUtil)}</span>}
        {dados.projecaoPorDiaUtil !== null && dados.canceladas > 0 && ' · '}
        {dados.canceladas > 0 && <span style={{ color: 'var(--danger)' }}>{dados.canceladas} {dados.canceladas === 1 ? 'cancelada' : 'canceladas'}</span>}
      </p>
      <div className="dia-grade" role="grid" aria-label={`${nome.Plural} por dia em ${mes}`}>
        {SEMANA.map((s) => <span key={s} className="dia-grade-semana">{s}</span>)}
        {Array.from({ length: vazios }, (_, i) => <span key={`v${i}`} />)}
        {uteis.map((d) => (
          <span
            key={d.data.toISOString()}
            className={`dia-grade-celula${d.util ? '' : ' is-feriado'}${isToday(d.data) ? ' is-hoje' : ''}`}
            style={d.util && d.n > 0 ? { background: `color-mix(in srgb, var(--accent) ${Math.round(18 + 62 * (d.n / max))}%, var(--card-hover))` } : undefined}
            title={`${format(d.data, 'dd/MM')}: ${d.util ? `${d.n} ${d.n === 1 ? nome.singular : nome.plural}${d.canceladas ? ` · ${d.canceladas} ${d.canceladas === 1 ? 'cancelada' : 'canceladas'}` : ''}` : 'feriado'}`}
          >
            <span className="dia-grade-num">{format(d.data, 'd')}</span>
            {d.util && d.n > 0 && <strong>{d.n}</strong>}
            {d.canceladas > 0 && <span className="dia-grade-cancel" aria-label={`${d.canceladas} cancelada(s)`}>×{d.canceladas}</span>}
          </span>
        ))}
      </div>
    </Card>
  );
}
