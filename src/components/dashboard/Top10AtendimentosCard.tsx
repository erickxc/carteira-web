import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, Chip } from '../../ui';

interface ItemRanking { label: string; n: number }

type FiltroTop10 = 'Todos' | 'Monitoria' | 'Price';
const FILTROS: FiltroTop10[] = ['Todos', 'Monitoria', 'Price'];
const FILTRO_LABEL: Record<FiltroTop10, string> = { Todos: 'Geral', Monitoria: 'Monitoria', Price: 'Precificação' };

interface Top10AtendimentosCardProps {
  itens: ItemRanking[];
  ano: number;
  /** Amplitude real dos atendimentos contados — o ano pode não ter dado de jan a
   *  dez, então o rótulo mostra o intervalo de verdade, não o ano inteiro. */
  inicio: Date | null;
  fim: Date | null;
  filtro: FiltroTop10;
  onFiltro: (f: FiltroTop10) => void;
}

/** "Mar" (mesmo mês) ou "Mar–Set" (intervalo) — sem repetir o ano, que já
 *  aparece em `ano`; capitalizado (date-fns devolve minúsculo em pt-BR). */
function periodoLabel(inicio: Date | null, fim: Date | null): string | null {
  if (!inicio || !fim) return null;
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const mIni = cap(format(inicio, 'MMM', { locale: ptBR }).replace('.', ''));
  const mFim = cap(format(fim, 'MMM', { locale: ptBR }).replace('.', ''));
  return mIni === mFim ? mIni : `${mIni}–${mFim}`;
}

/**
 * Ranking dos 10 clientes com mais ATENDIMENTOS (reunião ou relatório)
 * CONCLUÍDOS no ano — ocupa o slot do mapa de Abrangência (que foi pro
 * Dashboard da Carteira) na fileira de gauges da Visão Geral. Mesma classe
 * `cobertura-card` (280px mín., altura esticada igual aos outros 3 cards da
 * fileira) e mesmo padrão de lista compacta com truncamento + title (igual
 * `ListaEstados`, AbrangenciaMapaCard) — sem isso 10 linhas não caberiam num
 * card estreito.
 *
 * Layout: o nome do cliente ocupa a largura livre e a barra vem colada ao
 * número, à direita — antes a barra tinha largura fixa no meio, o que deixava
 * um vão entre nome e barra e quebrava o alinhamento das linhas entre si.
 */
export function Top10AtendimentosCard({ itens, ano, inicio, fim, filtro, onFiltro }: Top10AtendimentosCardProps) {
  const max = Math.max(1, ...itens.map((i) => i.n));
  const periodo = periodoLabel(inicio, fim);

  return (
    <Card className="cobertura-card">
      <div className="section-header">
        <h3 style={{ fontSize: '0.92rem' }}>Top 10 Atendimentos</h3>
        <span className="text-text-muted" style={{ fontSize: 11 }}>{periodo ? `${periodo}/${ano}` : ano}</span>
      </div>
      <div className="gauge-card-filtros flex flex-wrap gap-[0.35rem] mb-3">
        {FILTROS.map((f) => (
          <Chip key={f} active={filtro === f} onClick={() => onFiltro(f)}>{FILTRO_LABEL[f]}</Chip>
        ))}
      </div>
      {itens.length === 0 ? (
        <div className="empty-state" style={{ fontSize: 12 }}>Nenhum atendimento concluído neste período.</div>
      ) : (
        <div className="flex flex-col gap-[4px]">
          {itens.map((item, i) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5 }}>
              <span className="text-text-muted" style={{ width: 14, flexShrink: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
              <span
                title={item.label}
                className="text-text-primary"
                style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {item.label}
              </span>
              {/* Barra proporcional colada ao número, ambos com largura fixa —
                  é o que mantém as 10 linhas alinhadas na mesma coluna. */}
              <span style={{ width: 52, height: 5, borderRadius: 999, background: 'var(--card-hover)', overflow: 'hidden', flexShrink: 0 }}>
                <span style={{ display: 'block', width: `${(item.n / max) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 999 }} />
              </span>
              <strong style={{ width: 16, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{item.n}</strong>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
