interface LinePoint {
  label: string;
  value: number;
  full?: string; // rótulo completo p/ tooltip (ex.: "Julho 2026")
  /** Projeção (realizado + agendado). Se > value, vira ponto pontilhado acima. */
  projecao?: number;
}

interface LineChartProps {
  points: LinePoint[];
  highlightIndex?: number;
  height?: number;
  /** Formata o valor exibido no ponto e nos ticks (ex.: 1 decimal). */
  formatValue?: (v: number) => string;
  /** Sufixo do tooltip. Default mantém o uso original (reuniões por mês). */
  unidade?: string;
  /** Oculta o rótulo numérico sobre cada ponto (série densa em card estreito). */
  ocultarRotulos?: boolean;
}

const W = 760;

/**
 * Gráfico de linha (tendência de reuniões por mês). SVG com viewBox escalável
 * e traços non-scaling. Cor da marca (dourado). Ponto do mês selecionado é
 * destacado; cada ponto tem <title> para hover.
 */
export function LineChart({
  points,
  highlightIndex = -1,
  height = 240,
  formatValue = (v) => String(v),
  unidade = 'reunião(ões)',
  ocultarRotulos = false,
}: LineChartProps) {
  const H = height;
  const padL = 34;
  const padR = 14;
  const padT = 18;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const max = Math.max(1, ...points.map((p) => Math.max(p.value, p.projecao ?? 0)));
  const n = points.length;
  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const y = (v: number) => padT + plotH * (1 - v / max);

  const linePts = points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const areaPts = `${padL},${padT + plotH} ${linePts} ${padL + plotW},${padT + plotH}`;

  // 3 linhas de grade horizontais + rótulos do eixo Y. Sem arredondar para
  // inteiro: séries decimais (ex.: 2.8 ações por entrega) teriam o tick do meio
  // e o do topo colapsando no mesmo número.
  const ticks = [0, max / 2, max];

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Reuniões por mês" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="lc-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} y1={y(t)} x2={padL + plotW} y2={y(t)} stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <text x={padL - 8} y={y(t) + 3} textAnchor="end" fontSize="10" fill="var(--text-muted)" fontFamily="var(--font)">{formatValue(t)}</text>
        </g>
      ))}

      {n > 0 && <polygon points={areaPts} fill="url(#lc-area)" />}
      {n > 1 && <polyline points={linePts} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />}

      {/* Projeção: onde projecao > value, um ponto pontilhado acima ligado por
          traço tracejado (realizado → projetado, se as agendadas acontecerem). */}
      {points.map((p, i) => {
        if (p.projecao == null || p.projecao <= p.value) return null;
        const py = y(p.value);
        const pyProj = y(p.projecao);
        return (
          <g key={`proj-${i}`}>
            <line x1={x(i)} y1={py} x2={x(i)} y2={pyProj} stroke="var(--text-muted)" strokeWidth="1.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <circle cx={x(i)} cy={pyProj} r={4} fill="var(--bg)" stroke="var(--text-muted)" strokeWidth="2" strokeDasharray="2.5 2" vectorEffect="non-scaling-stroke">
              <title>{`${p.full ?? p.label}: projeção ${p.projecao} (realizado + agendado)`}</title>
            </circle>
            <text x={x(i)} y={pyProj - 9} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-muted)" fontFamily="var(--font)">{p.projecao}</text>
          </g>
        );
      })}

      {points.map((p, i) => {
        const sel = i === highlightIndex;
        const py = y(p.value);
        // rótulo de dados: acima do ponto; se muito no topo, joga pra baixo
        const labelAbove = py - 12 > padT;
        return (
          <g key={i}>
            {sel && <line x1={x(i)} y1={padT} x2={x(i)} y2={padT + plotH} stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.5" />}
            <circle cx={x(i)} cy={py} r={sel ? 5 : 3.5} fill={sel ? 'var(--accent)' : 'var(--bg)'} stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke">
              <title>{`${p.full ?? p.label}: ${formatValue(p.value)} ${unidade}`}</title>
            </circle>
            {!ocultarRotulos && (
              <text
                x={x(i)}
                y={labelAbove ? py - 10 : py + 16}
                textAnchor="middle"
                fontSize="11"
                fontWeight="600"
                fill="var(--text-primary)"
                fontFamily="var(--font)"
              >
                {formatValue(p.value)}
              </text>
            )}
            <text x={x(i)} y={H - 10} textAnchor="middle" fontSize="10" fill={sel ? 'var(--accent)' : 'var(--text-muted)'} fontFamily="var(--font)" fontWeight={sel ? 600 : 400}>
              {p.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
