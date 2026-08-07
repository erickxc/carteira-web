import { useMemo, useState, type MouseEvent } from 'react';
import { Card } from '../../ui';
import { ESTADOS_BRASIL, BRASIL_VIEWBOX } from '../../data/brasilEstados';
import { agruparClientesPorUf } from '../../utils/ddd';
import type { Cliente } from '../../types';

interface AbrangenciaMapaCardProps {
  clientes: Cliente[];
}

interface Tooltip {
  titulo: string;
  nomes: string[];
  x: number;
  y: number;
}

/** Escala de intensidade em degradê (do neutro ao dourado da marca) conforme a
 * contagem de lojas no estado, relativa ao estado com mais lojas. */
function corPorIntensidade(count: number, max: number): string {
  // Estados sem cliente precisam continuar visíveis como parte do contorno do
  // Brasil (não somem no fundo escuro) — usa a borda, não o fundo do card.
  if (count === 0) return 'var(--border-strong)';
  const t = max > 0 ? count / max : 0;
  const alpha = 0.35 + t * 0.65;
  return `color-mix(in srgb, var(--accent) ${Math.round(alpha * 100)}%, var(--card-hover))`;
}

/** Mapa do Brasil (contorno real, simplificado — ver src/data/brasilEstados.ts)
 * pintado por concentração de LOJAS (linhas de cliente — um grupo segmentado
 * como "Pecita" tem várias), inferida do DDD dos telefones de contato
 * cadastrados. Loja sem contato próprio herda o estado de outra loja do mesmo
 * grupo — ver agruparClientesPorUf. Hover mostra um card pequeno com os
 * nomes — tanto nos estados quanto em "sem contato" (pra saber QUEM falta
 * cadastrar, não só o número). */
export function AbrangenciaMapaCard({ clientes }: AbrangenciaMapaCardProps) {
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  const { porUf, semContato } = useMemo(() => agruparClientesPorUf(clientes), [clientes]);
  const max = useMemo(() => Math.max(0, ...Object.values(porUf).map((l) => l.length)), [porUf]);
  const totalComUf = useMemo(() => Object.values(porUf).reduce((s, l) => s + l.length, 0), [porUf]);

  const ranking = useMemo(
    () => ESTADOS_BRASIL
      .map((e) => ({ sigla: e.sigla, nome: e.nome, nomes: porUf[e.sigla] ?? [] }))
      .filter((e) => e.nomes.length > 0)
      .sort((a, b) => b.nomes.length - a.nomes.length),
    [porUf]
  );

  function mostrar(e: MouseEvent, titulo: string, nomes: string[]) {
    if (nomes.length === 0) return;
    setTooltip({ titulo, nomes, x: e.clientX, y: e.clientY });
  }

  return (
    <Card className="cobertura-card" style={{ position: 'relative' }}>
      <div className="section-header">
        <h3 style={{ fontSize: '0.92rem' }}>Abrangência da Monitoria</h3>
        <span className="text-text-muted" style={{ fontSize: 11 }}>{totalComUf} loja(s)</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
        <svg viewBox={BRASIL_VIEWBOX} style={{ width: 140 }} role="img" aria-label="Mapa do Brasil por concentração de clientes">
          {ESTADOS_BRASIL.map((e) => {
            const nomes = porUf[e.sigla] ?? [];
            return (
              <path
                key={e.sigla}
                d={e.path}
                fill={corPorIntensidade(nomes.length, max)}
                stroke="var(--bg)"
                strokeWidth={0.7}
                onMouseMove={(ev) => mostrar(ev, e.nome, nomes)}
                onMouseLeave={() => setTooltip(null)}
                style={{ cursor: nomes.length > 0 ? 'pointer' : 'default' }}
              />
            );
          })}
        </svg>
      </div>

      {ranking.length === 0 ? (
        <div className="empty-state" style={{ fontSize: 12 }}>Nenhum contato com DDD reconhecível ainda.</div>
      ) : (
        <div className="flex flex-col gap-[0.15rem]" style={{ fontSize: 12 }}>
          {ranking.slice(0, 5).map((e) => (
            <div
              key={e.sigla}
              onMouseMove={(ev) => mostrar(ev, e.nome, e.nomes)}
              onMouseLeave={() => setTooltip(null)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '1px 4px', borderRadius: 5, cursor: 'pointer' }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 2, background: corPorIntensidade(e.nomes.length, max), flexShrink: 0 }} />
              <span style={{ fontWeight: 600 }}>{e.sigla}</span>
              <span className="text-text-muted" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.nome}</span>
              <span className="text-text-muted">{e.nomes.length}</span>
            </div>
          ))}
        </div>
      )}

      {semContato.length > 0 && (
        <p
          className="text-text-muted"
          onMouseMove={(ev) => mostrar(ev, 'Sem contato com DDD reconhecível', semContato)}
          onMouseLeave={() => setTooltip(null)}
          style={{ fontSize: 11, marginTop: 8, cursor: 'pointer' }}
        >
          {semContato.length} loja(s) sem contato com DDD reconhecível (nem própria nem do grupo).
        </p>
      )}

      {tooltip && (
        <div
          style={{
            position: 'fixed', left: tooltip.x + 14, top: tooltip.y + 14, zIndex: 1000,
            background: 'var(--card)', border: '1px solid var(--border-strong)', borderRadius: 8,
            boxShadow: 'var(--shadow-lg)', padding: '8px 10px', fontSize: 12, maxWidth: 220,
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{tooltip.titulo} <span className="text-text-muted" style={{ fontWeight: 400 }}>({tooltip.nomes.length})</span></div>
          {tooltip.nomes.slice(0, 10).map((n) => <div key={n} className="text-text-secondary">{n}</div>)}
          {tooltip.nomes.length > 10 && <div className="text-text-muted">+{tooltip.nomes.length - 10} outro(s)</div>}
        </div>
      )}
    </Card>
  );
}
