import type { ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import clsx from 'clsx';

/**
 * Opção clicável de seleção. Nenhuma das duas variantes preenche o fundo
 * quando ativa — o usuário rejeitou o "preenchimento focado" (revisão 1.6):
 * - `filter` (filtros de visão/período): texto apagado; ativo fica claro com
 *   um traço dourado embaixo (opção 1 escolhida no laboratório).
 * - `toggle` (seleção em formulário): contorno fino; ativo ganha contorno
 *   dourado e texto claro.
 */
// Ativo e inativo são pares MUTUAMENTE EXCLUSIVOS em compoundVariants (não
// base + override): nunca duas classes da mesma propriedade no mesmo elemento
// competindo pela ordem do CSS.
const chip = cva(
  'relative inline-flex items-center gap-1.5 cursor-pointer font-medium whitespace-nowrap transition-colors duration-100',
  {
    variants: {
      variant: {
        filter: "h-[30px] px-2 text-[0.8125rem] bg-transparent border-0 after:content-[''] after:absolute after:left-2 after:right-2 after:bottom-0.5 after:h-0.5 after:rounded-full after:bg-accent after:origin-center after:transition-transform after:duration-200 motion-reduce:after:transition-none",
        toggle: 'h-[30px] px-3 rounded-sm border bg-transparent text-[0.8125rem]',
      },
      active: { true: '', false: '' },
    },
    compoundVariants: [
      { variant: 'filter', active: false, class: 'text-text-muted hover:text-text-primary after:scale-x-0' },
      { variant: 'filter', active: true, class: 'text-text-primary after:scale-x-100' },
      { variant: 'toggle', active: false, class: 'text-text-secondary border-border hover:border-border-strong hover:text-text-primary' },
      { variant: 'toggle', active: true, class: 'text-text-primary border-accent' },
    ],
    defaultVariants: { variant: 'filter', active: false },
  }
);

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof chip> {}

export function Chip({ className, variant, active, type = 'button', ...props }: ChipProps) {
  // aria-pressed só quando o chip é um botão de alternar; quem usa role="radio" já informa aria-checked.
  const pressionado = props.role === 'radio' ? undefined : (active ?? false);
  return <button type={type} aria-pressed={pressionado} className={clsx(chip({ variant, active }), className)} {...props} />;
}
