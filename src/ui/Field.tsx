import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import clsx from 'clsx';

/**
 * Campo de formulário (label + controle) — equivale à antiga `.field` do
 * index.css. É `group` para que o hover no label também destaque o controle
 * filho (antes: regra `.field:hover > .field-input`): o label fica dourado/
 * negrito e o input ganha borda + brilho.
 */
export function Field({
  label,
  children,
  className,
  as: Tag = 'label',
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  /** 'div' quando o conteúdo não é um único controle focável (ex.: grupo de
   *  chips/checkboxes) — evita um <label> envolvendo vários controles. */
  as?: 'label' | 'div';
}) {
  return (
    <Tag
      className={clsx(
        'group flex flex-col gap-[0.35rem] mb-4 text-[0.8rem] font-medium text-text-secondary transition-colors duration-150 hover:text-accent hover:font-bold',
        className
      )}
    >
      {label}
      {children}
    </Tag>
  );
}

/**
 * Base comum a input/select/textarea (antiga `.field-input`). `tone="modal"`
 * usa o fundo mais escuro (var(--bg)) dos campos dentro de modais (antiga regra
 * `.modal .field-input`); `default` usa var(--card) para campos fora de modal.
 */
const control = cva(
  'w-full border border-border-strong rounded-sm text-[0.875rem] text-text-primary outline-none transition-[border-color,box-shadow] duration-100 hover:border-text-muted focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)] group-hover:border-accent group-hover:shadow-[0_0_0_3px_var(--accent-soft)]',
  {
    variants: {
      tone: { default: 'bg-card', modal: 'bg-bg' },
    },
    defaultVariants: { tone: 'default' },
  }
);

type ControlTone = VariantProps<typeof control>;

export function Input({ className, tone, ...props }: InputHTMLAttributes<HTMLInputElement> & ControlTone) {
  return <input className={clsx(control({ tone }), 'px-[0.7rem] py-[0.55rem]', className)} {...props} />;
}

export function Textarea({ className, tone, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & ControlTone) {
  return <textarea className={clsx(control({ tone }), 'px-[0.7rem] py-[0.55rem] resize-y min-h-[74px]', className)} {...props} />;
}

export function Select({ className, tone, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & ControlTone) {
  return (
    <select
      className={clsx(
        control({ tone }),
        'appearance-none cursor-pointer py-2 pl-[0.7rem] pr-8 bg-no-repeat bg-[position:calc(100%-0.6rem)_center] bg-[image:var(--select-chevron)] [&>option]:bg-card [&>option]:text-text-primary',
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
