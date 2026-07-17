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
    <div className={`glass-card stat-card-container ${onClick ? 'interactive-card' : ''}`} onClick={onClick}>
      <div className="stat-card-content">
        <p className="stat-card-title">{title}</p>
        <h3 className="stat-card-value">{value}</h3>
        {trend && (
          <p className="stat-card-trend" style={{ color: trendColor }}>
            {seta}{trend}
          </p>
        )}
      </div>
      <div className="stat-card-icon-container" style={{ background: 'var(--accent-glow)', color: 'var(--accent)' }}>
        <Icon className="stat-icon" />
      </div>
    </div>
  );
}
