import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import clsx from 'clsx';

/**
 * Tile de card padrão do app (equivale a .glass-card do index.css). Hover
 * nítido em todos os cards (elevação + sombra forte + borda destacada); com
 * `interactive` a borda de hover vira dourada em vez de --border-strong.
 *
 * SEM `translate`/`scale` no hover de propósito: deslocar a própria caixa que
 * recebe o hover é auto-referente — passar o mouse perto da borda faz a
 * caixa se mover pra fora do cursor, o hover cai, ela volta, o cursor cai
 * dentro de novo, e por aí vai (tremor visível, reportado pelo usuário em
 * vários lugares do app). A elevação fica só na sombra/borda, que não move a
 * área de hit-test.
 */
const card = cva(
  'relative bg-card border border-border rounded p-5 shadow-sm transition-[box-shadow,border-color] duration-150 hover:border-border-strong hover:shadow-lg',
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
