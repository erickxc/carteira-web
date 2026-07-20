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

/** Fileira de anéis radiais (1 por item), cada um com o Top 3 de clientes
 * empilhado abaixo — cresce em altura, não em largura. Rótulo nunca depende
 * só da cor. */
export function RadialStatRow({ items, size = 116, thickness = 11 }: RadialStatRowProps) {
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;

  return (
    <div className="radial-row">
      {items.map((it) => {
        const len = Math.max((it.pct / 100) * circ, 0);
        return (
          <div key={it.label} className="radial-block">
            <div className="radial-item">
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

            {it.top && it.top.length > 0 && (
              <div className="radial-top3">
                <span className="radial-top3-title">Top clientes</span>
                {it.top.map((t, i) => (
                  <div key={t.empresa} className="radial-top3-row">
                    <span className="radial-top3-rank">{i + 1}º</span>
                    <span className="radial-top3-name">{t.empresa}</span>
                    <span className="radial-top3-n">{t.n}x</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
