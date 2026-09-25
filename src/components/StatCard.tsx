import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '../ui';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  /** Base da proporção, ao lado do valor: "de 38". */
  denominador?: string;
  /** Comparação com um período anterior (`<Comparacao />`). */
  comparacao?: ReactNode;
  /** Linha fixa dizendo o que o número conta. */
  comoConta?: string;
  /** Texto da variação (legado: telas que ainda não usam `comparacao`). */
  trend?: string;
  /** true = alta (verde ↑), false = queda (vermelho ↓), undefined = neutro (sem seta). */
  trendUp?: boolean;
  onClick?: () => void;
}

export function StatCard({ title, value, icon: Icon, denominador, comparacao, comoConta, trend, trendUp, onClick }: StatCardProps) {
  const trendColor = trendUp === undefined ? 'var(--text-secondary)' : trendUp ? 'var(--success)' : 'var(--danger)';
  const seta = trendUp === undefined ? '' : trendUp ? '↑ ' : '↓ ';

  return (
    <Card
      interactive={!!onClick}
      className="stat-card-sm flex items-start justify-between gap-2 min-w-0 text-left"
      onClick={onClick}
    >
      <span className="stat-card-accent-bar" />
      <div className="flex-1 min-w-0 flex flex-col items-start">
        <p className="text-[0.8rem] font-medium mb-[0.3rem] max-w-full leading-tight min-h-[2.1em] flex items-start text-[color:var(--text-secondary)]">{title}</p>
        {/* Algarismos proporcionais: tabular-nums deixa número grande "frouxo"; fica só em tabelas. */}
        <h3 className="text-[1.9rem] font-bold leading-[1.1] tracking-[-0.02em] text-[color:var(--text-primary)]">
          {value}
          {denominador && <span className="kpi-denominador"> {denominador}</span>}
        </h3>
        {comparacao}
        {trend && (
          <p className="text-[0.78rem] mt-[0.35rem] flex items-center gap-1 font-medium max-w-full min-w-0" style={{ color: trendColor }}>
            {seta && <span className="shrink-0">{seta}</span>}
            <span title={trend} className="overflow-hidden text-ellipsis whitespace-nowrap min-w-0">{trend}</span>
          </p>
        )}
        {comoConta && <p className="kpi-como-conta">{comoConta}</p>}
      </div>
      <div className="w-[34px] h-[34px] rounded-[var(--radius-sm)] shrink-0 flex items-center justify-center bg-[var(--accent)] text-[color:var(--accent-contrast)] shadow-[0_2px_10px_rgba(218,187,108,0.35)]">
        <Icon className="w-[17px] h-[17px]" />
      </div>
    </Card>
  );
}
