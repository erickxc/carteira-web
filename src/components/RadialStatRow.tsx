interface RadialItem {
  label: string;
  pct: number;
  n: number;
  color: string;
}

interface RadialStatRowProps {
  items: RadialItem[];
  size?: number;
  thickness?: number;
}

/** Fileira de anéis radiais (1 por item) — usado quando há poucas categorias
 * e uma barra fina deixaria espaço vazio. Cada anel traz valor central +
 * legenda abaixo (rótulo nunca depende só da cor). */
export function RadialStatRow({ items, size = 132, thickness = 12 }: RadialStatRowProps) {
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;

  return (
    <div className="radial-row">
      {items.map((it) => {
        const len = Math.max((it.pct / 100) * circ, 0);
        return (
          <div key={it.label} className="radial-item">
            <div className="radial-svg-wrap" style={{ width: size, height: size }}>
              <svg width={size} height={size} role="img" aria-label={`${it.label}: ${it.pct}%`}>
                <circle cx={cx} cy={cx} r={r} fill="none" stroke="#26262c" strokeWidth={thickness} />
                <circle
                  cx={cx} cy={cx} r={r} fill="none"
                  stroke={it.color} strokeWidth={thickness} strokeLinecap="round"
                  strokeDasharray={`${len} ${circ - len}`}
                  transform={`rotate(-90 ${cx} ${cx})`}
                >
                  <title>{`${it.label}: ${it.n} (${it.pct}%)`}</title>
                </circle>
              </svg>
              <div className="radial-center">
                <div className="radial-center-value">{it.pct}%</div>
                <div className="radial-center-label">{it.n} clientes</div>
              </div>
            </div>
            <span className="radial-item-label"><span className="donut-swatch" style={{ background: it.color }} /> {it.label}</span>
          </div>
        );
      })}
    </div>
  );
}
