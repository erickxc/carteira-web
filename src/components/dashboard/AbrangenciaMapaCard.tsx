import { useMemo, useState, type FormEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2 } from 'lucide-react';
import { Button, Card } from '../../ui';
import { ModalShell } from '../ModalShell';
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

interface EstadoComNomes {
  sigla: string;
  nome: string;
  nomes: string[];
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

/** SVG do mapa reutilizado no card compacto e no modal expandido — só muda a
 * largura. O hover é sempre por aqui, então o comportamento é idêntico nos
 * dois tamanhos (evita ter 2 implementações de tooltip divergindo). */
function MapaSvg({
  largura, porUf, max, onHover, onLeave,
}: {
  largura: number;
  porUf: Record<string, string[]>;
  max: number;
  onHover: (e: MouseEvent, nome: string, nomes: string[]) => void;
  onLeave: () => void;
}) {
  return (
    <svg viewBox={BRASIL_VIEWBOX} style={{ width: largura }} role="img" aria-label="Mapa do Brasil por concentração de lojas">
      {ESTADOS_BRASIL.map((e) => {
        const nomes = porUf[e.sigla] ?? [];
        return (
          <path
            key={e.sigla}
            d={e.path}
            fill={corPorIntensidade(nomes.length, max)}
            stroke="var(--bg)"
            strokeWidth={0.7}
            onMouseMove={(ev) => onHover(ev, e.nome, nomes)}
            onMouseLeave={onLeave}
            style={{ cursor: nomes.length > 0 ? 'pointer' : 'default' }}
          />
        );
      })}
    </svg>
  );
}

function ListaEstados({
  ranking, max, limite, onHover, onLeave,
}: {
  ranking: EstadoComNomes[];
  max: number;
  limite?: number;
  onHover: (e: MouseEvent, nome: string, nomes: string[]) => void;
  onLeave: () => void;
}) {
  const lista = limite ? ranking.slice(0, limite) : ranking;
  return (
    <div className="flex flex-col gap-[0.15rem]" style={{ fontSize: 12 }}>
      {lista.map((e) => (
        <div
          key={e.sigla}
          onMouseMove={(ev) => onHover(ev, e.nome, e.nomes)}
          onMouseLeave={onLeave}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 4px', borderRadius: 5, cursor: 'pointer' }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 2, background: corPorIntensidade(e.nomes.length, max), flexShrink: 0 }} />
          <span style={{ fontWeight: 600 }}>{e.sigla}</span>
          <span className="text-text-muted" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.nome}</span>
          <span className="text-text-muted">{e.nomes.length}</span>
        </div>
      ))}
    </div>
  );
}

/** Mapa do Brasil (contorno real, simplificado — ver src/data/brasilEstados.ts)
 * pintado por concentração de LOJAS (linhas de cliente — um grupo segmentado
 * como "Pecita" tem várias), inferida do DDD dos telefones de contato
 * cadastrados. Loja sem contato próprio herda o estado de outra loja do mesmo
 * grupo — ver agruparClientesPorUf. Hover mostra um card pequeno com os
 * nomes; clique abre o mapa grande num modal (o card compacto é apertado
 * demais pra caçar estado pequeno com precisão). */
export function AbrangenciaMapaCard({ clientes }: AbrangenciaMapaCardProps) {
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [expandido, setExpandido] = useState(false);

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
  function esconder() {
    setTooltip(null);
  }
  function fecharModal(e: FormEvent) {
    e.preventDefault();
    setExpandido(false);
  }

  return (
    <Card className="cobertura-card" style={{ position: 'relative' }}>
      <div className="section-header">
        <h3 style={{ fontSize: '0.92rem' }}>Abrangência da Monitoria</h3>
        <span className="text-text-muted" style={{ fontSize: 11 }}>{totalComUf} loja(s)</span>
      </div>

      <div
        onClick={() => setExpandido(true)}
        title="Clique para expandir"
        style={{ display: 'flex', justifyContent: 'center', marginBottom: 8, cursor: 'pointer', position: 'relative' }}
      >
        <MapaSvg largura={140} porUf={porUf} max={max} onHover={mostrar} onLeave={esconder} />
        <Maximize2 size={12} className="text-text-muted" style={{ position: 'absolute', top: 0, right: 'calc(50% - 70px)' }} />
      </div>

      {ranking.length === 0 ? (
        <div className="empty-state" style={{ fontSize: 12 }}>Nenhum contato com DDD reconhecível ainda.</div>
      ) : (
        <ListaEstados ranking={ranking} max={max} limite={5} onHover={mostrar} onLeave={esconder} />
      )}

      {semContato.length > 0 && (
        <p
          className="text-text-muted"
          onMouseMove={(ev) => mostrar(ev, 'Sem contato com DDD reconhecível', semContato)}
          onMouseLeave={esconder}
          style={{ fontSize: 11, marginTop: 8, cursor: 'pointer' }}
        >
          {semContato.length} loja(s) sem contato com DDD reconhecível (nem própria nem do grupo).
        </p>
      )}

      {tooltip && createPortal(
        <div
          style={{
            // Portal pro <body> (mesmo padrão de Dropdown.tsx/ModalShell): o
            // ".card" tem `transform: translateY(-3px)` no hover, e um
            // ancestral com transform vira a referência de um `position:
            // fixed` descendente (deixa de valer contra a viewport). Era por
            // isso que o tooltip não seguia o mouse direito e podia ficar
            // preso atrás do modal, mesmo com z-index alto — ele estava preso
            // no stacking context local do card, não no do documento.
            position: 'fixed', left: tooltip.x + 16, top: tooltip.y + 10, zIndex: 2100,
            background: 'var(--card)', border: '1px solid var(--border-strong)', borderRadius: 8,
            boxShadow: 'var(--shadow-lg)', padding: '8px 10px', fontSize: 12, maxWidth: 220,
            pointerEvents: 'none',
          }}
        >
          {/* Setinha apontando pro cursor/estado, efeito de balão. */}
          <span
            style={{
              position: 'absolute', left: -5, top: 12, width: 9, height: 9,
              background: 'var(--card)', borderLeft: '1px solid var(--border-strong)', borderBottom: '1px solid var(--border-strong)',
              transform: 'rotate(45deg)',
            }}
          />
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{tooltip.titulo} <span className="text-text-muted" style={{ fontWeight: 400 }}>({tooltip.nomes.length})</span></div>
          {tooltip.nomes.slice(0, 10).map((n) => <div key={n} className="text-text-secondary">{n}</div>)}
          {tooltip.nomes.length > 10 && <div className="text-text-muted">+{tooltip.nomes.length - 10} outro(s)</div>}
        </div>,
        document.body
      )}

      {expandido && (
        <ModalShell
          title="Abrangência da Monitoria"
          onClose={() => setExpandido(false)}
          onSubmit={fecharModal}
          size="xl"
          footer={<Button variant="secondary" onClick={() => setExpandido(false)}>Fechar</Button>}
        >
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flexShrink: 0 }}>
              <MapaSvg largura={520} porUf={porUf} max={max} onHover={mostrar} onLeave={esconder} />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <p className="text-text-muted" style={{ fontSize: 12, marginBottom: 10 }}>
                Estado inferido pelo DDD do telefone de contato — passe o mouse num estado (ou na lista) pra ver as lojas.
              </p>
              {ranking.length === 0 ? (
                <div className="empty-state">Nenhum contato com DDD reconhecível ainda.</div>
              ) : (
                <ListaEstados ranking={ranking} max={max} onHover={mostrar} onLeave={esconder} />
              )}
              {semContato.length > 0 && (
                <p
                  className="text-text-muted"
                  onMouseMove={(ev) => mostrar(ev, 'Sem contato com DDD reconhecível', semContato)}
                  onMouseLeave={esconder}
                  style={{ fontSize: 12, marginTop: 12, cursor: 'pointer' }}
                >
                  {semContato.length} loja(s) sem contato com DDD reconhecível (nem própria nem do grupo).
                </p>
              )}
            </div>
          </div>
        </ModalShell>
      )}
    </Card>
  );
}
