import type { ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import clsx from 'clsx';

/**
 * Botão padrão (equivale às antigas classes .btn/.btn-primary/... do index.css).
 * As variantes reproduzem exatamente aquelas regras — inclusive o
 * `:hover:not(:disabled)`, aqui como `enabled:hover:`.
 */
const button = cva(
  'inline-flex items-center justify-center gap-[0.4rem] rounded-sm text-[0.82rem] font-medium cursor-pointer whitespace-nowrap border border-transparent transition-all duration-100 disabled:opacity-50 disabled:cursor-not-allowed print:hidden enabled:hover:brightness-110 enabled:active:scale-[0.97] motion-reduce:transition-none motion-reduce:hover:brightness-100 motion-reduce:active:scale-100',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-contrast enabled:hover:bg-accent-hover',
        secondary: 'bg-card text-text-primary border-border-strong enabled:hover:bg-card-hover enabled:hover:border-text-muted',
        danger: 'bg-card text-danger border-danger enabled:hover:bg-danger enabled:hover:text-white',
        success: 'bg-card text-success border-success enabled:hover:bg-success enabled:hover:text-white',
      },
      size: {
        default: 'px-[0.9rem] py-2',
        icon: 'p-2',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'default' },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={clsx(button({ variant, size }), className)} {...props} />;
}
