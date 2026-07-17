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
      className={`glass-card flex items-start justify-between gap-2 min-w-0 text-left ${onClick ? 'interactive-card' : ''}`}
      onClick={onClick}
    >
      <div className="flex-1 min-w-0 flex flex-col items-start">
        <p className="text-[0.8rem] font-medium mb-[0.6rem] max-w-full truncate text-[color:var(--text-secondary)]">{title}</p>
        <h3 className="text-[2.2rem] font-semibold leading-[1.1] tracking-[-0.02em] tabular-nums text-[color:var(--text-primary)]">{value}</h3>
        {trend && (
          <p className="text-[0.8rem] mt-2 flex items-center gap-1 font-medium" style={{ color: trendColor }}>
            {seta}{trend}
          </p>
        )}
      </div>
      <div className="w-[38px] h-[38px] rounded-[var(--radius-sm)] shrink-0 flex items-center justify-center bg-[var(--accent-soft)] text-[color:var(--accent)]">
        <Icon className="w-[19px] h-[19px]" />
      </div>
    </div>
  );
}
