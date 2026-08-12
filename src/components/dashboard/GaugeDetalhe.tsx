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
      {/* Grupos EMPILHADOS (um por linha), não em colunas lado a lado.
          Antes eram N colunas fixas, e como estes cards ficam 4 por linha
          (~270–330px de largura), cada coluna sobrava com 76–97px: nomes como
          "Altese - Recreio + Barra" (145px) e "Pecita - Campo Grande" (142px)
          eram truncados — a maioria da carteira, porque os nomes de loja levam
          o grupo no começo. Empilhado, cada nome tem a largura inteira do card.

          `--gauge-grupos` deixa o CSS dividir uma altura TOTAL fixa entre os
          grupos, então um card com 2 grupos e outro com 3 terminam na mesma
          altura — era essa a razão de as colunas serem em número fixo, e ela
          continua atendida. */}
      <div
        className="gauge-detalhe-grid"
        style={{ ['--gauge-grupos' as string]: grupos.length }}
      >
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
