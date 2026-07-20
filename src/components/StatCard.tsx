import type { LucideIcon } from 'lucide-react';

interface StatCardSecondary {
  label: string;
  value: string | number;
  /** true = alta (verde), false = queda (vermelho), undefined = neutro. */
  tone?: boolean;
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  /** Texto da variação (ex.: "12% vs mês anterior"). */
  trend?: string;
  /** true = alta (verde ↑), false = queda (vermelho ↓), undefined = neutro (sem seta). */
  trendUp?: boolean;
  /** Métricas extras exibidas em linha abaixo do valor principal (rótulo · valor). */
  secondary?: StatCardSecondary[];
  onClick?: () => void;
}

function toneColor(tone?: boolean): string {
  return tone === undefined ? 'var(--text-secondary)' : tone ? 'var(--success)' : 'var(--danger)';
}

export function StatCard({ title, value, icon: Icon, trend, trendUp, secondary, onClick }: StatCardProps) {
  const trendColor = toneColor(trendUp);
  const seta = trendUp === undefined ? '' : trendUp ? '↑ ' : '↓ ';

  return (
    <div
      className={`glass-card stat-card-sm flex flex-col gap-1.5 min-w-0 text-left ${onClick ? 'interactive-card' : ''}`}
      onClick={onClick}
    >
      <span className="stat-card-accent-bar" />
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex-1 min-w-0 flex flex-col items-start">
          <p className="text-[0.76rem] font-medium mb-[0.3rem] max-w-full truncate text-[color:var(--text-secondary)]">{title}</p>
          <h3 className="text-[1.55rem] font-bold leading-[1.1] tracking-[-0.02em] tabular-nums text-[color:var(--text-primary)]">{value}</h3>
          {trend && (
            <p className="text-[0.74rem] mt-1 flex items-center gap-1 font-medium" style={{ color: trendColor }}>
              {seta}{trend}
            </p>
          )}
        </div>
        <div className="w-[30px] h-[30px] rounded-[var(--radius-sm)] shrink-0 flex items-center justify-center bg-[var(--accent)] text-[color:var(--accent-contrast)] shadow-[0_2px_10px_rgba(189,149,47,0.35)]">
          <Icon className="w-[15px] h-[15px]" />
        </div>
      </div>

      {secondary && secondary.length > 0 && (
        <div className="flex-1 flex flex-col justify-center gap-2 pt-2.5 mt-1 border-t border-border">
          {secondary.map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-3">
              <span className="text-[0.86rem] text-[color:var(--text-secondary)]">{s.label}</span>
              <strong className="text-[0.95rem] tabular-nums" style={{ color: toneColor(s.tone), fontWeight: 700 }}>{s.value}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
