interface TopCliente { empresa: string; n: number }

/** Qual lado da cobertura o card está mostrando — ver `ServicosCard`. */
export type ModoCobertura = 'coberto' | 'descoberto';

interface RadialItem {
  label: string;
  pct: number;
  n: number;
  color: string;
  top?: TopCliente[];
  /** Total da base do percentual (ex.: quantos contrataram o serviço). */
  base?: number;
  /** Quantos da base ficaram DE FORA — exibido separadamente no resumo do card. */
  descobertos?: number;
  /** Nomes de quem NÃO foi atendido na janela — lista do modo "descoberto". */
  descobertosClientes?: string[];
}

interface RadialStatRowProps {
  items: RadialItem[];
  size?: number;
  thickness?: number;
  /** 'coberto' (padrão) mostra quem está coberto; 'descoberto' inverte o anel
   *  e a lista pra quem NÃO está — é o seletor cheio/vazio do card. */
  modo?: ModoCobertura;
}

/** Números do item conforme o modo: coberto usa os valores como vêm;
 *  descoberto inverte (complemento do percentual e contagem de fora). */
function valoresDoModo(it: RadialItem, modo: ModoCobertura) {
  if (modo === 'coberto') return { pct: it.pct, n: it.n, color: it.color };
  const descobertos = it.descobertos ?? Math.max(0, (it.base ?? 0) - it.n);
  return {
    pct: it.base && it.base > 0 ? Math.round((descobertos / it.base) * 100) : 0,
    n: descobertos,
    // Cor de atenção: neste modo o anel representa o que FALTA atender, não
    // uma segunda série — é estado (pede ação), não identidade.
    color: 'var(--warning)',
  };
}

function Ring({ it, size, thickness, modo }: { it: RadialItem; size: number; thickness: number; modo: ModoCobertura }) {
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const { pct, n, color } = valoresDoModo(it, modo);
  const len = Math.max((pct / 100) * circ, 0);
  const descricao = modo === 'coberto' ? 'atendidos' : 'sem atendimento';
  return (
    <div className="radial-item">
      <div className="radial-svg-wrap" style={{ width: size, height: size }}>
        {/* viewBox é obrigatório aqui: sem ele, esticar o SVG por CSS (o card
            largo aumenta o anel) muda só a caixa — o desenho fica no tamanho
            original, encostado no canto, e o texto central (posicionado pela
            caixa) desalinha do anel. Com viewBox o conteúdo escala junto. */}
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`${it.label}: ${pct}% ${descricao}`}
        >
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--border)" strokeWidth={thickness} />
          <circle
            cx={cx} cy={cx} r={r} fill="none"
            stroke={color} strokeWidth={thickness} strokeLinecap="round"
            strokeDasharray={`${len} ${circ - len}`}
            transform={`rotate(-90 ${cx} ${cx})`}
          >
            <title>
              {it.base != null
                ? `${it.label}: ${n} de ${it.base} ${descricao} (${pct}%)`
                : `${it.label}: ${n} (${pct}%)`}
            </title>
          </circle>
        </svg>
        <div className="radial-center">
          <div className="radial-center-value">{pct}%</div>
          {/* Com base definida, mostra a fração — "36 clientes" sozinho não deixa
              claro sobre quantos o percentual foi calculado. */}
          <div className="radial-center-label">
            {it.base != null ? `${n} de ${it.base}` : `${n} clientes`}
          </div>
        </div>
      </div>
      <span className="radial-item-label"><span className="donut-swatch" style={{ background: color }} /> {it.label}</span>
    </div>
  );
}

/** Lista lateral: no modo coberto, o ranking de quem foi mais atendido; no modo
 *  descoberto, quem não foi atendido (sem contagem — todos estão em zero). */
function ListaLateral({ it, align, modo }: { it: RadialItem; align: 'left' | 'right'; modo: ModoCobertura }) {
  if (modo === 'descoberto') {
    const nomes = it.descobertosClientes ?? [];
    if (nomes.length === 0) return null;
    return (
      <div className={`radial-top3 radial-top3-${align}`}>
        <span className="radial-top3-title">{`Sem atendimento · ${it.label}`}</span>
        {nomes.slice(0, 5).map((empresa) => (
          <div key={empresa} className="radial-top3-row">
            <span className="radial-top3-name">{empresa}</span>
          </div>
        ))}
        {nomes.length > 5 && (
          <div className="radial-top3-row">
            <span className="radial-top3-name text-text-muted">+{nomes.length - 5} outro(s)</span>
          </div>
        )}
      </div>
    );
  }

  if (!it.top || it.top.length === 0) return null;
  return (
    <div className={`radial-top3 radial-top3-${align}`}>
      <span className="radial-top3-title">
        {`Top · ${it.label}`}
      </span>
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

/** Anéis radiais maiores no centro; ao ter exatamente 2 itens, as listas de
 * clientes ficam nas pontas (esquerda/direita), espelhadas. */
export function RadialStatRow({ items, size = 132, thickness = 14, modo = 'coberto' }: RadialStatRowProps) {
  if (items.length === 2) {
    const [a, b] = items;
    return (
      <div className="radial-row radial-row-mirrored">
        <ListaLateral it={a} align="right" modo={modo} />
        <Ring it={a} size={size} thickness={thickness} modo={modo} />
        <Ring it={b} size={size} thickness={thickness} modo={modo} />
        <ListaLateral it={b} align="left" modo={modo} />
      </div>
    );
  }

  return (
    <div className="radial-row">
      {items.map((it) => (
        <div key={it.label} className="radial-block">
          <Ring it={it} size={size} thickness={thickness} modo={modo} />
          <ListaLateral it={it} align="left" modo={modo} />
        </div>
      ))}
    </div>
  );
}
