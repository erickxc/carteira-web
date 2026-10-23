import type { ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import clsx from 'clsx';

/**
 * Botão padrão. Um botão só: TODAS as variantes têm a mesma altura, padding,
 * raio, fonte, tamanho de ícone e borda de 1px — muda apenas a tinta (pedido
 * do usuário na revisão de componentes da 1.6: "sem padronização").
 * Secundário/destrutivo/sucesso compartilham a superfície `raise` com um
 * brilho de 1px no topo; o destrutivo só fica vermelho no texto e na borda
 * do hover (nada de botão vermelho cheio fora da confirmação).
 */
const superficie = 'bg-raise border-border shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_1px_1px_rgba(0,0,0,0.18)] enabled:hover:bg-card-hover';

const button = cva(
  'relative inline-flex items-center justify-center gap-1.5 h-[30px] px-3 rounded-sm border text-[0.8125rem] font-medium leading-none cursor-pointer whitespace-nowrap transition-[background-color,border-color,color,transform] duration-100 disabled:opacity-45 disabled:cursor-not-allowed print:hidden enabled:active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 [&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-accent border-accent text-accent-contrast enabled:hover:bg-accent-hover enabled:hover:border-accent-hover',
        secondary: clsx(superficie, 'text-text-primary enabled:hover:border-border-strong'),
        ghost: 'bg-transparent border-transparent text-text-secondary enabled:hover:bg-card-hover enabled:hover:text-text-primary',
        danger: clsx(superficie, 'text-[color:var(--danger-fg)] enabled:hover:border-danger'),
        success: clsx(superficie, 'text-[color:var(--success-fg)] enabled:hover:border-success'),
      },
      size: {
        default: '',
        sm: 'h-6 px-2.5 text-[0.78rem]',
        icon: 'w-[30px] px-0',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'default' },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  /** Mostra o girador e bloqueia o clique enquanto a ação roda. O texto
   *  continua o do chamador ("Salvando..."), o botão não muda de tamanho. */
  carregando?: boolean;
}

export function Button({ className, variant, size, type = 'button', carregando, disabled, children, onClick, ...props }: ButtonProps) {
  // `carregando` NÃO vira `disabled`: o atributo tira o foco de quem usa
  // teclado no meio do salvamento e deixa o botão com cara de apagado. O
  // clique (e o envio implícito por Enter, que passa pelo clique do botão de
  // submit) é cancelado aqui — mesmo bloqueio de envio duplo de antes.
  return (
    <button
      type={type}
      className={clsx(button({ variant, size }), carregando && 'cursor-wait', className)}
      disabled={disabled}
      aria-disabled={carregando || undefined}
      aria-busy={carregando || undefined}
      onClick={(e) => {
        if (carregando) { e.preventDefault(); return; }
        onClick?.(e);
      }}
      {...props}
    >
      {carregando && <span className="btn-giro" aria-hidden />}
      {children}
    </button>
  );
}
