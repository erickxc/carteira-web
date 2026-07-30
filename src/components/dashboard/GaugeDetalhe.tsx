export interface GaugeGrupo {
  label: string;
  cor: string;
  clientes: string[];
}

/** Seção que expande DENTRO do próprio card de gauge (clique no botão "Ver
 * clientes", não hover) — o card cresce, sem virar outro card. Controlado
 * pelo pai via `aberto` (estado React, não CSS :hover). */
export function GaugeDetalhe({ grupos, aberto }: { grupos: GaugeGrupo[]; aberto: boolean }) {
  return (
    <div className={`gauge-detalhe${aberto ? ' is-open' : ''}`}>
      <div className="gauge-detalhe-grid">
        {grupos.map((g) => (
          <div key={g.label} className="gauge-detalhe-col">
            <span className="gauge-detalhe-titulo">
              <span className="acao-dot" style={{ background: g.cor }} /> {g.label} · {g.clientes.length}
            </span>
            {g.clientes.length === 0 ? (
              <span className="gauge-detalhe-vazio">—</span>
            ) : (
              <ul>
                {g.clientes.map((c) => (
                  <li key={c} title={c}>{c}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
