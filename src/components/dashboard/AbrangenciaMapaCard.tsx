import { useMemo, useState } from 'react';
import { Card } from '../../ui';
import { ESTADOS_BRASIL, BRASIL_VIEWBOX } from '../../data/brasilEstados';
import { contarClientesPorUf } from '../../utils/ddd';
import type { Cliente } from '../../types';

interface AbrangenciaMapaCardProps {
  clientes: Cliente[];
}

/** Escala de intensidade em degradê (do neutro ao dourado da marca) conforme a
 * contagem de clientes no estado, relativa ao estado com mais clientes. */
function corPorIntensidade(count: number, max: number): string {
  // Estados sem cliente precisam continuar visíveis como parte do contorno do
  // Brasil (não somem no fundo escuro) — usa a borda, não o fundo do card.
  if (count === 0) return 'var(--border-strong)';
  const t = max > 0 ? count / max : 0;
  // interpola entre o dourado claro (pouco) e o dourado forte (muito) via opacidade
  const alpha = 0.35 + t * 0.65;
  return `color-mix(in srgb, var(--accent) ${Math.round(alpha * 100)}%, var(--card-hover))`;
}

/** Mapa do Brasil (contorno real, simplificado — ver src/data/brasilEstados.ts)
 * pintado por concentração de clientes, inferida do DDD dos telefones de
 * contato cadastrados. Cobertura por CLIENTE (não por contato/telefone) — ver
 * contarClientesPorUf. Estados sem nenhum contato com DDD reconhecível ficam
 * neutros, não em branco/erro — a ausência de dado é um estado válido aqui. */
export function AbrangenciaMapaCard({ clientes }: AbrangenciaMapaCardProps) {
  const [ufAtivo, setUfAtivo] = useState<string | null>(null);

  const contagem = useMemo(() => contarClientesPorUf(clientes), [clientes]);
  const max = useMemo(() => Math.max(0, ...Object.values(contagem)), [contagem]);
  const totalComUf = useMemo(() => Object.values(contagem).reduce((s, n) => s + n, 0), [contagem]);

  const ranking = useMemo(
    () => ESTADOS_BRASIL
      .map((e) => ({ ...e, count: contagem[e.sigla] ?? 0 }))
      .filter((e) => e.count > 0)
      .sort((a, b) => b.count - a.count),
    [contagem]
  );

  const semDdd = clientes.length - totalComUf; // aproximado: clientes cujo(s) contato(s) não geraram nenhuma UF

  return (
    <Card className="cobertura-card">
      <div className="section-header">
        <h3>Abrangência da Monitoria</h3>
        <span className="text-text-muted" style={{ fontSize: 12 }}>{totalComUf} cliente(s) com estado identificado</span>
      </div>
      <p className="text-text-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 12, lineHeight: 1.4 }}>
        Estado inferido pelo DDD do telefone de contato cadastrado — cliente sem contato com DDD reconhecível não aparece no mapa.
      </p>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <svg viewBox={BRASIL_VIEWBOX} style={{ width: 260, flexShrink: 0 }} role="img" aria-label="Mapa do Brasil por concentração de clientes">
          {ESTADOS_BRASIL.map((e) => {
            const count = contagem[e.sigla] ?? 0;
            return (
              <path
                key={e.sigla}
                d={e.path}
                fill={corPorIntensidade(count, max)}
                stroke="var(--bg)"
                strokeWidth={0.7}
                onMouseEnter={() => setUfAtivo(e.sigla)}
                onMouseLeave={() => setUfAtivo((u) => (u === e.sigla ? null : u))}
                style={{ cursor: count > 0 ? 'pointer' : 'default' }}
              >
                <title>{`${e.nome}: ${count} cliente(s)`}</title>
              </path>
            );
          })}
        </svg>

        <div style={{ flex: 1, minWidth: 160 }}>
          {ranking.length === 0 ? (
            <div className="empty-state">Nenhum contato com DDD reconhecível ainda.</div>
          ) : (
            <div className="flex flex-col gap-[0.3rem]">
              {ranking.slice(0, 8).map((e) => (
                <div
                  key={e.sigla}
                  onMouseEnter={() => setUfAtivo(e.sigla)}
                  onMouseLeave={() => setUfAtivo((u) => (u === e.sigla ? null : u))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                    padding: '3px 6px', borderRadius: 6,
                    background: ufAtivo === e.sigla ? 'var(--card-hover)' : 'transparent',
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: corPorIntensidade(e.count, max), flexShrink: 0 }} />
                  <span style={{ fontWeight: 600 }}>{e.sigla}</span>
                  <span className="text-text-muted" style={{ flex: 1 }}>{e.nome}</span>
                  <span className="text-text-muted">{e.count}</span>
                </div>
              ))}
            </div>
          )}
          {semDdd > 0 && (
            <p className="text-text-muted" style={{ fontSize: 12, marginTop: 10 }}>
              {semDdd} cliente(s) sem contato com DDD reconhecível.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
