import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  onClick?: () => void;
}

export function StatCard({ title, value, icon: Icon, trend, trendUp, onClick }: StatCardProps) {
  return (
    <div className={`glass-card stat-card-container ${onClick ? 'interactive-card' : ''}`} onClick={onClick}>
      <div className="stat-card-content">
        <p className="stat-card-title">{title}</p>
        <h3 className="stat-card-value">{value}</h3>
        {trend && (
          <p className="stat-card-trend" style={{ color: trendUp ? 'var(--success)' : 'var(--danger)' }}>
            {trendUp ? '↑' : '↓'} {trend}
          </p>
        )}
      </div>
      <div
        className="stat-card-icon-container"
        style={{
          background: trendUp === undefined ? 'var(--accent-glow)' : trendUp ? 'var(--success-bg)' : 'var(--danger-bg)',
          color: trendUp === undefined ? 'var(--accent)' : trendUp ? 'var(--success)' : 'var(--danger)',
        }}
      >
        <Icon className="stat-icon" />
      </div>
    </div>
  );
}
