interface DonutItem {
  label: string;
  value: number;
}

interface DonutChartProps {
  items: DonutItem[];
  size?: number;
  thickness?: number;
  centerValue?: string | number;
  centerLabel?: string;
  colors?: string[];
}

// Paleta da marca: Soft Fawn (acento) + French Blue/Slate Grey/Burnt Caramel
// (apoio) + neutros. Identidade nunca é só cor: há legenda com rótulo + valor
// + %, e um <title> por fatia no hover.
const RAMP = ['#dabb6c', '#6f8cc4', '#8aa3ad', '#e0975a', '#f4f4f2', '#5a5a62'];

export function DonutChart({ items, size = 168, thickness = 26, centerValue, centerLabel, colors }: DonutChartProps) {
  const ramp = colors ?? RAMP;
  const total = items.reduce((s, it) => s + it.value, 0);
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const gap = total > 0 ? 3 : 0; // separação entre fatias (px de circunferência)

  let acc = 0;
  const slices = items.map((it, i) => {
    const frac = total > 0 ? it.value / total : 0;
    const len = Math.max(frac * circ - gap, 0);
    const el = {
      cor: ramp[i % ramp.length],
      dasharray: `${len} ${circ - len}`,
      dashoffset: -acc,
      pct: total > 0 ? Math.round(frac * 100) : 0,
      ...it,
    };
    acc += frac * circ;
    return el;
  });

  return (
    <div className="donut-wrap">
      <div className="donut-svg-wrap" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label="Distribuição por tipo">
          {/* trilho de fundo */}
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--border)" strokeWidth={thickness} />
          {total > 0 &&
            slices.map((s) => (
              <circle
                key={s.label}
                cx={cx}
                cy={cx}
                r={r}
                fill="none"
                stroke={s.cor}
                strokeWidth={thickness}
                strokeDasharray={s.dasharray}
                strokeDashoffset={s.dashoffset}
                transform={`rotate(-90 ${cx} ${cx})`}
              >
                <title>{`${s.label}: ${s.value} (${s.pct}%)`}</title>
              </circle>
            ))}
        </svg>
        {(centerValue !== undefined || centerLabel) && (
          <div className="donut-center">
            {centerValue !== undefined && <div className="donut-center-value">{centerValue}</div>}
            {centerLabel && <div className="donut-center-label">{centerLabel}</div>}
          </div>
        )}
      </div>

      <ul className="donut-legend">
        {slices.map((s) => (
          <li key={s.label}>
            <span className="donut-swatch" style={{ background: s.cor }} />
            <span className="donut-legend-label">{s.label}</span>
            <span className="donut-legend-val">{s.value}</span>
            <span className="donut-legend-pct">{s.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
