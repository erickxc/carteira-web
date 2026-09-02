import { Card } from '../../ui';

interface ItemDistribuicao {
  label: string;
  n: number;
  /** Cor da barra/dot — default é a cor da marca (`--accent`). */
  color?: string;
}

interface DistribuicaoListCardProps {
  titulo: string;
  subtitulo?: string;
  items: ItemDistribuicao[];
  emptyMsg: string;
  /** Limita quantas linhas aparecem (o resto soma num "+N outros"). */
  limite?: number;
  /** Frase de leitura direta, acima da lista (ex.: "Fulano responde por 62% da carteira"). */
  insight?: string;
}

/**
 * Lista de barras horizontais (label + contagem + % do total) — recorte
 * genérico de composição, reutilizado pelas distribuições por Monitor/Status/
 * Segmento no Dashboard da Carteira. Mesmo padrão visual de `ListaEstados`
 * (AbrangenciaMapaCard), mas com barra de proporção em vez de mapa.
 */
export function DistribuicaoListCard({ titulo, subtitulo, items, emptyMsg, limite, insight }: DistribuicaoListCardProps) {
  const total = items.reduce((s, i) => s + i.n, 0);
  const visiveis = limite ? items.slice(0, limite) : items;
  const restoN = limite ? items.slice(limite).reduce((s, i) => s + i.n, 0) : 0;
  const max = Math.max(1, ...items.map((i) => i.n));

  return (
    <Card>
      <div className="section-header">
        <h3>{titulo}</h3>
        {subtitulo && <span className="text-text-muted" style={{ fontSize: 12 }}>{subtitulo}</span>}
      </div>
      {total === 0 ? (
        <div className="empty-state">{emptyMsg}</div>
      ) : (
        <>
          {insight && <p style={{ fontSize: 13, marginBottom: 10 }}>{insight}</p>}
          <div className="flex flex-col gap-[8px]">
          {visiveis.map((item) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
              <span
                className="text-text-secondary"
                style={{ width: '38%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={item.label}
              >
                {item.label}
              </span>
              <div style={{ flex: 1, height: 8, borderRadius: 999, background: 'var(--card-hover)', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${(item.n / max) * 100}%`,
                    height: '100%',
                    borderRadius: 999,
                    background: item.color || 'var(--accent)',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
              <strong style={{ minWidth: 20, textAlign: 'right' }}>{item.n}</strong>
              <span className="text-text-muted" style={{ minWidth: 34, textAlign: 'right' }}>
                {total > 0 ? Math.round((item.n / total) * 100) : 0}%
              </span>
            </div>
          ))}
          {restoN > 0 && (
            <p className="text-text-muted" style={{ fontSize: 11, marginTop: 2 }}>
              +{items.length - limite!} outro(s) somando {restoN}
            </p>
          )}
          </div>
        </>
      )}
    </Card>
  );
}
