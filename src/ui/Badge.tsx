import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import clsx from 'clsx';

/** Pílula de status (equivale a .badge/.badge-* do index.css). */
const badge = cva(
  'inline-flex items-center gap-1 px-[9px] py-[2px] rounded-full text-[0.72rem] font-medium leading-[1.5] transition-[filter,transform] duration-100 hover:brightness-[1.3] hover:scale-[1.06]',
  {
    variants: {
      variant: {
        accent: 'bg-accent-soft text-[color:var(--accent-fg)]',
        // Texto usa o token *-fg (não a cor viva): no tema claro a cor viva
        // sobre o próprio fundo do badge dava contraste de 1.3 a 2.5:1.
        success: 'bg-[var(--success-bg)] text-[color:var(--success-fg)]',
        danger: 'bg-[var(--danger-bg)] text-[color:var(--danger-fg)]',
        warning: 'bg-[var(--warning-bg)] text-[color:var(--warning-fg)]',
        gratuidade: 'bg-[var(--gratuidade-bg)] text-[color:var(--gratuidade-fg)]',
        muted: 'bg-bg text-text-secondary border border-border',
        // sem fundo/cor própria (herda a cor do contexto) — equivale ao `.badge`
        // "puro" sem modificador de cor.
        plain: '',
      },
    },
    defaultVariants: { variant: 'muted' },
  }
);

export type BadgeVariant = NonNullable<VariantProps<typeof badge>['variant']>;

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badge> {
  /** 'button' quando o badge é clicável (ex.: seletor de loja do grupo) — troca
   *  o elemento para <button> mantendo o mesmo visual, sem herdar estilo de
   *  botão nenhum. */
  as?: 'span' | 'button';
}

export function Badge({ className, variant, as = 'span', ...props }: BadgeProps) {
  const Tag = as as 'span';
  return <Tag className={clsx(badge({ variant }), as === 'button' && 'border-0 cursor-pointer font-[inherit]', className)} {...props} />;
}
