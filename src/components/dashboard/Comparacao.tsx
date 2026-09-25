import { Info } from 'lucide-react';

/** Ícone ⓘ ao lado do título com a regra do card no hover/foco — tira o texto
 * explicativo do corpo do card sem esconder a regra de quem quer saber. */
export function InfoComoConta({ texto }: { texto: string }) {
  return (
    <span className="kpi-info" title={texto} aria-label={texto} role="img" tabIndex={0}>
      <Info size={13} />
    </span>
  );
}

/** Legenda compacta numa linha: ponto colorido + rótulo + número (nunca só a cor). */
export function LegendaCompacta({ itens }: { itens: { cor: string; label: string; n: number }[] }) {
  return (
    <div className="kpi-legenda">
      {itens.map((i) => (
        <span key={i.label}><i style={{ background: i.cor }} />{i.label} <strong>{i.n}</strong></span>
      ))}
    </div>
  );
}

interface ComparacaoProps {
  atual: number;
  /** null = não há como comparar (o card deve dizer por quê em `semBase`). */
  anterior: number | null | undefined;
  /** Subir é bom? Define a cor: reagendamento subindo é ruim, atendimento em dia subindo é bom. */
  subirEhBom: boolean;
  /** Nome do período comparado, ex.: "25/08" ou "agosto até dia 25". */
  rotulo: string;
  /** Texto quando não há comparação. */
  semBase?: string;
}

/** Linha "▲ 2 vs 25/08 (29)" — seta e cor pela direção × se subir é bom; texto sempre junto (nunca só cor). */
export function Comparacao({ atual, anterior, subirEhBom, rotulo, semBase }: ComparacaoProps) {
  if (anterior === null || anterior === undefined) {
    return semBase ? <p className="kpi-comparacao is-neutra">{semBase}</p> : null;
  }
  const diff = atual - anterior;
  if (diff === 0) return <p className="kpi-comparacao is-neutra">= igual a {rotulo} ({anterior})</p>;
  const bom = diff > 0 === subirEhBom;
  return (
    <p className={`kpi-comparacao ${bom ? 'is-boa' : 'is-ruim'}`}>
      {diff > 0 ? '▲' : '▼'} {Math.abs(diff)} vs {rotulo} ({anterior})
    </p>
  );
}

/** Tom semântico de uma proporção "X de Y": 80%+ bom, 50%+ atenção, abaixo disso ruim. */
function tomDaProporcao(n: number, total: number): 'boa' | 'atencao' | 'ruim' {
  const pct = total > 0 ? n / total : 0;
  if (pct >= 0.8) return 'boa';
  if (pct >= 0.5) return 'atencao';
  return 'ruim';
}

/** Barra de progresso "X de Y" (substitui os donuts de proporção). */
export function Medidor({ n, total, rotulo }: { n: number; total: number; rotulo: string }) {
  const pct = total > 0 ? Math.round((n / total) * 100) : 0;
  return (
    <div
      className={`kpi-medidor is-${tomDaProporcao(n, total)}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={n}
      aria-label={`${n} de ${total} ${rotulo} (${pct}%)`}
    >
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}
