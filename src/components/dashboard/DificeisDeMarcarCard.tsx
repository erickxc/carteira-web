import { Card, Chip } from '../../ui';
import { InfoComoConta } from './Comparacao';
import type { DificilDeMarcar } from '../../utils/analises';

const PERIODOS = [
  { meses: 1, label: 'Mês', canto: 'no mês', janela: 'no mês' },
  { meses: 3, label: 'Trimestre', canto: '3 meses', janela: 'nos últimos 3 meses' },
  { meses: 6, label: 'Semestre', canto: '6 meses', janela: 'nos últimos 6 meses' },
  { meses: 12, label: 'Ano', canto: '12 meses', janela: 'nos últimos 12 meses' },
];

/** Muita tentativa para pouca entrega: 3+ tentativas e mais que o dobro das entregas. */
const muitaTentativa = (i: DificilDeMarcar) => i.tentativas >= 3 && i.tentativas > 2 * i.entregas;

interface DificeisDeMarcarCardProps {
  itens: DificilDeMarcar[];
  /** Janela em meses terminando no mês escolhido no topo (1, 3, 6 ou 12). */
  meses: number;
  onMeses: (meses: number) => void;
  onAbrirCliente: (id: string) => void;
}

/**
 * "Difíceis de marcar" — no período escolhido no card (terminando no mês do topo), quem mais exigiu tentativa de
 * contato por entrega feita (ver `dificeisDeMarcar`). Serve para decidir com
 * quem mudar a abordagem: outro canal, outro contato, ou rever se continua ativo.
 */
export function DificeisDeMarcarCard({ itens, meses, onMeses, onAbrirCliente }: DificeisDeMarcarCardProps) {
  const periodo = PERIODOS.find((p) => p.meses === meses) ?? PERIODOS[0];
  const top = itens.slice(0, 10);
  const max = Math.max(1, ...top.map((i) => i.tentativas));
  const semEntrega = itens.filter((i) => i.entregas === 0).length;
  return (
    <Card className="kpi-card">
      <div className="section-header">
        <h3>Difíceis de marcar <InfoComoConta texto="Tentativas de contato no período (o mês escolhido no topo e, em Trimestre/Semestre/Ano, os meses anteriores), por atendimento, contra as entregas feitas (reunião ou precificação concluída). Tentativa = contato ou ligação concluído que partiu de nós, ou ação de contato concluída; contato em que o cliente nos procurou e aviso de cancelamento não contam, e ações repetidas no mesmo dia contam uma vez. Tentativas em amarelo = 3+ e mais que o dobro das entregas." /></h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>{periodo.canto}</span>
      </div>
      <div className="flex flex-wrap items-center gap-[0.35rem] mb-2">
        {PERIODOS.map((p) => (
          <Chip key={p.meses} active={periodo.meses === p.meses} onClick={() => onMeses(p.meses)}>{p.label}</Chip>
        ))}
      </div>
      {top.length === 0 ? (
        <div className="empty-state">Nenhuma tentativa de contato {periodo.janela}.</div>
      ) : (
        <>
          <p className="kpi-comparacao is-neutra" style={{ marginTop: 0 }}>
            {itens.length} {itens.length === 1 ? 'atendimento precisou' : 'atendimentos precisaram'} de tentativa de contato
            {semEntrega > 0 && <>; <strong className="text-text-primary">{semEntrega}</strong> sem nenhuma entrega {periodo.janela}</>}.
          </p>
          <div className="dificeis-tabela" role="table" aria-label="Tentativas de contato por atendimento">
            <div className="dificeis-cab" role="row">
              <span role="columnheader">Atendimento</span>
              <span role="columnheader">Tentativas</span>
              <span role="columnheader">Entregas</span>
            </div>
            {top.map((i) => (
              <div key={i.id} className="dificeis-linha" role="row">
                <button type="button" role="cell" className="link-button dificeis-nome" onClick={() => onAbrirCliente(i.id)} title={i.nome}>{i.nome}</button>
                <span role="cell" className="dificeis-tentativas">
                  <i style={{ width: `${(i.tentativas / max) * 100}%` }} />
                  <strong className={muitaTentativa(i) ? 'is-atencao' : undefined} title={muitaTentativa(i) ? 'Muita tentativa para pouca entrega' : undefined}>{i.tentativas}</strong>
                </span>
                <span role="cell">{i.entregas || '—'}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
