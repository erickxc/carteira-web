import type { ComponentPropsWithoutRef, ElementType } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import clsx from 'clsx';

/**
 * Status curto em texto colorido (antiga pílula .badge). Sem `scale` no
 * hover de propósito: crescer a própria caixa que recebe o hover é
 * auto-referente — perto da borda, o crescimento tira o cursor de cima do
 * badge, o hover cai, ele volta ao tamanho normal, o cursor cai dentro de
 * novo, e por aí vai (tremor visível, reportado pelo usuário).
 */
// Revisão 1.6: sem pílula e sem fundo. O usuário rejeitou tanto o fundo
// pastel quanto o "marcador colorido + palavra" — a cor mora no próprio texto
// (token *-fg, que escurece no tema claro para passar AA). As variantes e a
// API ficaram as mesmas para não mexer nos ~50 chamadores.
const badge = cva(
  'inline-flex items-center gap-1 text-[0.75rem] font-medium leading-[1.5] tabular-nums whitespace-nowrap [&:is(button,a)]:hover:underline [&:is(button,a)]:underline-offset-2',
  {
    variants: {
      variant: {
        accent: 'text-[color:var(--accent-fg)] font-semibold',
        success: 'text-[color:var(--success-fg)] font-semibold',
        danger: 'text-[color:var(--danger-fg)] font-semibold',
        warning: 'text-[color:var(--warning-fg)] font-semibold',
        gratuidade: 'text-[color:var(--gratuidade-fg)] font-semibold',
        muted: 'text-text-secondary',
        // herda a cor do contexto
        plain: '',
      },
    },
    defaultVariants: { variant: 'muted' },
  }
);

export type BadgeVariant = NonNullable<VariantProps<typeof badge>['variant']>;

/** `as` aceita 'span' (padrão), 'button' (badge clicável, ex.: seletor de
 *  loja do grupo — mesmo visual, sem herdar estilo de botão), ou um
 *  componente de navegação como `Link` (react-router) — nesse caso o resto
 *  das props (`to`, etc.) do componente escolhido também é aceito. */
export type BadgeProps<T extends ElementType = 'span'> = VariantProps<typeof badge> & {
  as?: T;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className' | keyof VariantProps<typeof badge>>;

export function Badge<T extends ElementType = 'span'>({ className, variant, as, ...props }: BadgeProps<T>) {
  const Tag = (as ?? 'span') as ElementType;
  return <Tag className={clsx(badge({ variant }), as === 'button' && 'border-0 bg-transparent p-0 cursor-pointer', className)} {...props} />;
}
