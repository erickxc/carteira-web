interface TopCliente { empresa: string; n: number }

interface RadialItem {
  label: string;
  pct: number;
  n: number;
  color: string;
  top?: TopCliente[];
}

interface RadialStatRowProps {
  items: RadialItem[];
  size?: number;
  thickness?: number;
}

function Ring({ it, size, thickness }: { it: RadialItem; size: number; thickness: number }) {
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const len = Math.max((it.pct / 100) * circ, 0);
  return (
    <div className="radial-item">
      <div className="radial-svg-wrap" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label={`${it.label}: ${it.pct}%`}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--border)" strokeWidth={thickness} />
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
}

function Top3({ it, align }: { it: RadialItem; align: 'left' | 'right' }) {
  if (!it.top || it.top.length === 0) return null;
  return (
    <div className={`radial-top3 radial-top3-${align}`}>
      <span className="radial-top3-title">Top clientes · {it.label}</span>
      {it.top.map((t, i) => (
        <div key={t.empresa} className="radial-top3-row">
          <span className="radial-top3-rank">{i + 1}º</span>
          <span className="radial-top3-name">{t.empresa}</span>
          <span className="radial-top3-n">{t.n}x</span>
        </div>
      ))}
    </div>
  );
}

/** Anéis radiais maiores no centro; ao ter exatamente 2 itens, os rankings de
 * Top 3 clientes ficam nas pontas (esquerda/direita), espelhados. */
export function RadialStatRow({ items, size = 132, thickness = 14 }: RadialStatRowProps) {
  if (items.length === 2) {
    const [a, b] = items;
    return (
      <div className="radial-row radial-row-mirrored">
        <Top3 it={a} align="right" />
        <Ring it={a} size={size} thickness={thickness} />
        <Ring it={b} size={size} thickness={thickness} />
        <Top3 it={b} align="left" />
      </div>
    );
  }

  return (
    <div className="radial-row">
      {items.map((it) => (
        <div key={it.label} className="radial-block">
          <Ring it={it} size={size} thickness={thickness} />
          <Top3 it={it} align="left" />
        </div>
      ))}
    </div>
  );
}
