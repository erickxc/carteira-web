import type { ThHTMLAttributes, TdHTMLAttributes } from 'react';
import clsx from 'clsx';

/**
 * Células de tabela (equivalem à antiga `.data-table th`/`td` do index.css —
 * só a variante realmente renderizada da cascata, confirmada via computed
 * style no navegador antes de migrar, já que o CSS tinha dois blocos
 * `.data-table` conflitantes e o segundo vencia a maior parte das props).
 * Uso: `<table className="w-full border-collapse text-[0.9rem]">` dentro de
 * um wrapper `overflow-auto rounded`, `<tr>` com `className="group
 * [&:last-child>td]:border-b-0"` para o hover funcionar e a última linha não
 * ter borda.
 */
export function Th({ className, sortable, ...props }: ThHTMLAttributes<HTMLTableCellElement> & { sortable?: boolean }) {
  return (
    <th
      className={clsx(
        'text-left px-4 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.04em] text-text-muted bg-card-hover border-b border-border whitespace-nowrap',
        sortable && 'cursor-pointer select-none hover:text-accent',
        className
      )}
      {...props}
    />
  );
}

export function Td({ className, first, ...props }: TdHTMLAttributes<HTMLTableCellElement> & { first?: boolean }) {
  return (
    <td
      className={clsx(
        'px-4 py-[0.7rem] border-b border-border text-text-secondary align-middle transition-colors duration-100 group-hover:bg-card-hover',
        first && 'group-hover:shadow-[inset_3px_0_0_var(--accent)]',
        className
      )}
      {...props}
    />
  );
}
