import { Card } from '../../ui';

interface Segmento {
  label: string;
  n: number;
  pct: number;
  color: string;
}

interface StackedBarCardProps {
  titulo: string;
  subtitulo?: string;
  segmentos: Segmento[];
  emptyMsg: string;
  /** Frase de leitura direta, acima da barra (ex.: "78% da carteira está regular"). */
  insight?: string;
}

/**
 * Barra única empilhada (parte-do-todo, <= 6 categorias) + legenda — usada
 * pra composição por status ("Saúde da Carteira") e por profundidade de
 * serviços. Um gap de superfície separa os segmentos (nunca uma borda), e as
 * pontas da barra (não cada segmento) são as únicas arredondadas.
 */
export function StackedBarCard({ titulo, subtitulo, segmentos, emptyMsg, insight }: StackedBarCardProps) {
  const total = segmentos.reduce((s, i) => s + i.n, 0);

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
          <div
            role="img"
            aria-label={segmentos.map((s) => `${s.label} ${s.n} (${s.pct}%)`).join(', ')}
            style={{ display: 'flex', gap: 2, height: 12, borderRadius: 999, overflow: 'hidden', marginBottom: 14 }}
          >
            {segmentos.map((s) => (
              <div
                key={s.label}
                title={`${s.label}: ${s.n} (${s.pct}%)`}
                style={{ width: `${(s.n / total) * 100}%`, background: s.color, transition: 'width 0.2s ease' }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px' }}>
            {segmentos.map((s) => (
              <span key={s.label} className="inline-flex items-center gap-[6px]" style={{ fontSize: '0.76rem' }}>
                <i style={{ width: 9, height: 9, borderRadius: 3, background: s.color, display: 'inline-block', flexShrink: 0 }} />
                <span className="text-text-secondary">{s.label}</span>
                <strong>{s.n}</strong>
                <span className="text-text-muted">({s.pct}%)</span>
              </span>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
