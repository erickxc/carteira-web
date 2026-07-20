import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  /** Texto da variação (ex.: "12% vs mês anterior"). */
  trend?: string;
  /** true = alta (verde ↑), false = queda (vermelho ↓), undefined = neutro (sem seta). */
  trendUp?: boolean;
  onClick?: () => void;
}

export function StatCard({ title, value, icon: Icon, trend, trendUp, onClick }: StatCardProps) {
  const trendColor = trendUp === undefined ? 'var(--text-secondary)' : trendUp ? 'var(--success)' : 'var(--danger)';
  const seta = trendUp === undefined ? '' : trendUp ? '↑ ' : '↓ ';

  return (
    <div
      className={`glass-card stat-card-sm flex items-start justify-between gap-2 min-w-0 text-left ${onClick ? 'interactive-card' : ''}`}
      onClick={onClick}
    >
      <span className="stat-card-accent-bar" />
      <div className="flex-1 min-w-0 flex flex-col items-start">
        <p className="text-[0.8rem] font-medium mb-[0.4rem] max-w-full truncate text-[color:var(--text-secondary)]">{title}</p>
        <h3 className="text-[1.9rem] font-bold leading-[1.1] tracking-[-0.02em] tabular-nums text-[color:var(--text-primary)]">{value}</h3>
        {trend && (
          <p className="text-[0.78rem] mt-1.5 flex items-center gap-1 font-medium" style={{ color: trendColor }}>
            {seta}{trend}
          </p>
        )}
      </div>
      <div className="w-[34px] h-[34px] rounded-[var(--radius-sm)] shrink-0 flex items-center justify-center bg-[var(--accent)] text-[color:var(--accent-contrast)] shadow-[0_2px_10px_rgba(189,149,47,0.35)]">
        <Icon className="w-[17px] h-[17px]" />
      </div>
    </div>
  );
}
