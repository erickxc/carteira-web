import type { KeyboardEvent, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import clsx from 'clsx';

/**
 * Células de tabela. Uso: `<table className="w-full border-collapse text-[0.9rem]">`
 * dentro de um wrapper `overflow-auto rounded`, `<tr>` com `className="group
 * [&:last-child>td]:border-b-0"` para o hover funcionar e a última linha não
 * ter borda.
 *
 * Revisão 1.6 (mistura A+B do laboratório): cabeçalho em maiúsculas pequenas
 * sobre o próprio card (sem faixa de fundo), linhas mais baixas com divisória
 * fina, números alinhados (`tabular-nums`).
 */
export function Th({ className, sortable, onClick, onKeyDown, ...props }: ThHTMLAttributes<HTMLTableCellElement> & { sortable?: boolean }) {
  // Ordenável também pelo teclado: o clique fica no <th>, então ele precisa
  // ser focável e responder a Enter/Espaço (antes só funcionava com mouse).
  const teclado = (e: KeyboardEvent<HTMLTableCellElement>) => {
    onKeyDown?.(e);
    if (sortable && onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick(e as unknown as Parameters<typeof onClick>[0]);
    }
  };
  return (
    <th
      className={clsx(
        'text-left px-4 h-9 text-[0.66rem] font-semibold uppercase tracking-[0.06em] text-text-muted border-b border-border whitespace-nowrap',
        sortable && 'cursor-pointer select-none hover:text-text-primary focus-visible:text-text-primary',
        className
      )}
      tabIndex={sortable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={teclado}
      {...props}
    />
  );
}

export function Td({ className, first, ...props }: TdHTMLAttributes<HTMLTableCellElement> & { first?: boolean }) {
  // `first` continua aceito (chamadores antigos) mas não pinta mais a barra
  // dourada na lateral: borda colorida grossa à esquerda é o padrão "cara de IA".
  void first;
  return (
    <td
      className={clsx(
        'px-4 py-[0.55rem] border-b border-hair text-text-secondary align-middle tabular-nums transition-colors duration-100 group-hover:bg-card-hover',
        className
      )}
      {...props}
    />
  );
}
