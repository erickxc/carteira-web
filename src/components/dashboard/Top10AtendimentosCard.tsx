import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card } from '../../ui';

interface ItemRanking { label: string; n: number }

interface Top10AtendimentosCardProps {
  itens: ItemRanking[];
  ano: number;
  /** Amplitude real dos atendimentos contados — o ano pode não ter dado de jan a
   *  dez, então o rótulo mostra o intervalo de verdade, não o ano inteiro. */
  inicio: Date | null;
  fim: Date | null;
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
 */
export function Top10AtendimentosCard({ itens, ano, inicio, fim }: Top10AtendimentosCardProps) {
  const max = Math.max(1, ...itens.map((i) => i.n));
  const periodo = periodoLabel(inicio, fim);

  return (
    <Card className="cobertura-card">
      <div className="section-header">
        <h3 style={{ fontSize: '0.92rem' }}>Top 10 Atendimentos</h3>
        <span className="text-text-muted" style={{ fontSize: 11 }}>{periodo ? `${periodo}/${ano}` : ano}</span>
      </div>
      {itens.length === 0 ? (
        <div className="empty-state" style={{ fontSize: 12 }}>Nenhum atendimento concluído neste ano.</div>
      ) : (
        <div className="flex flex-col gap-[3px]">
          {itens.map((item, i) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
              <span className="text-text-muted" style={{ width: 13, flexShrink: 0, textAlign: 'right' }}>{i + 1}</span>
              <span
                title={item.label}
                style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {item.label}
              </span>
              <div style={{ width: 44, height: 6, borderRadius: 999, background: 'var(--card-hover)', overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ width: `${(item.n / max) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 999 }} />
              </div>
              <strong style={{ width: 16, textAlign: 'right', flexShrink: 0 }}>{item.n}</strong>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
