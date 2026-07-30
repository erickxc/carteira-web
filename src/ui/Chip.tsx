import type { ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import clsx from 'clsx';

/**
 * Pílula clicável de seleção. Duas variantes que existiam como classes CSS
 * distintas (mesma ideia, detalhes de estilo levemente diferentes — mantidos
 * fiéis em vez de unificados, para não mudar visual nenhum dos dois usos):
 * - `filter` = antiga `.chip`/`.chip.is-active` (filtros de visão/período).
 * - `toggle` = antiga `.chip-toggle`/`.is-on` (seleção em formulários).
 */
// Ativo e inativo são definidos como pares MUTUAMENTE EXCLUSIVOS em
// compoundVariants (não base + override) — assim nunca há duas classes de mesma
// propriedade (bg/cor/borda) no mesmo elemento competindo por ordem no CSS, que
// era o motivo do chip ativo não "ficar dourado" (o bg-transparent da base
// vencia o bg-accent do ativo).
const chip = cva(
  'inline-flex items-center border cursor-pointer font-medium transition-all duration-100',
  {
    variants: {
      variant: {
        filter: 'rounded-full px-[0.8rem] py-[0.3rem] text-[0.8rem]',
        toggle: 'rounded-[20px] px-[0.8rem] py-[0.4rem] text-[0.82rem]',
      },
      active: { true: '', false: '' },
    },
    compoundVariants: [
      { variant: 'filter', active: false, class: 'bg-card text-text-secondary border-border-strong hover:border-accent hover:text-accent' },
      { variant: 'filter', active: true, class: 'bg-accent text-accent-contrast border-accent' },
      { variant: 'toggle', active: false, class: 'bg-transparent text-text-secondary border-border-strong hover:border-accent hover:text-text-primary' },
      { variant: 'toggle', active: true, class: 'bg-accent text-black font-semibold border-accent' },
    ],
    defaultVariants: { variant: 'filter', active: false },
  }
);

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof chip> {}

export function Chip({ className, variant, active, type = 'button', ...props }: ChipProps) {
  return <button type={type} className={clsx(chip({ variant, active }), className)} {...props} />;
}
