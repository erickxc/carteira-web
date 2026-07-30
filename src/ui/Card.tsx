import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import clsx from 'clsx';

/**
 * Tile de card padrão do app (equivale a .glass-card do index.css). Hover
 * nítido em todos os cards (elevação + sombra forte + borda destacada); com
 * `interactive` a borda de hover vira dourada em vez de --border-strong.
 */
const card = cva(
  'relative bg-card border border-border rounded p-5 shadow-sm transition-[box-shadow,border-color,transform] duration-150 hover:border-border-strong hover:shadow-lg hover:-translate-y-[3px]',
  {
    variants: {
      flat: { true: 'shadow-none' },
      interactive: { true: 'cursor-pointer hover:border-accent' },
    },
    defaultVariants: { flat: false, interactive: false },
  }
);

export interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof card> {}

export function Card({ className, flat, interactive, ...props }: CardProps) {
  return <div className={clsx(card({ flat, interactive }), className)} {...props} />;
}
