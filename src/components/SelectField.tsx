import type { ReactNode } from 'react';
import { Field } from '../ui';
import { Dropdown, type DropdownOption } from './Dropdown';

interface SelectFieldProps {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  /** Texto mostrado quando `value` não bate com nenhuma option (ex.: campo
   *  opcional ainda vazio). Sem isso, cai no rótulo do campo. */
  placeholder?: string;
  disabled?: boolean;
  /** Largura customizada vai aqui via Tailwind arbitrário (ex.: "w-[160px]")
   *  — mesmo padrão já usado nos `<Field>` que este componente substitui. */
  className?: string;
  labelSize?: 'default' | 'sm';
}

/**
 * `Field` (label do formulário) + `Dropdown` (popover próprio, `variant`
 * "campo" — nunca destaca em dourado, ao contrário do uso em filtro) juntos
 * — é o par que toda troca de `<select>` nativo por campo de formulário
 * usava repetido em ~40 lugares (`<Field label="X"><Select tone="modal"
 * value={...} onChange={...}>{options}</Select></Field>`), então virou este
 * componente único. Ver `Dropdown.tsx` pro motivo da troca: a lista de
 * opções de um `<select>` nativo é desenhada pelo navegador/SO, fora do
 * alcance do CSS do app.
 */
export function SelectField({ label, value, onChange, options, placeholder, disabled, className, labelSize }: SelectFieldProps) {
  return (
    <Field as="div" className={className} labelSize={labelSize} label={label}>
      <Dropdown
        variant="campo"
        label={placeholder ?? (typeof label === 'string' ? label : 'Selecione')}
        value={value}
        onChange={(v) => onChange(v as string)}
        options={options}
        disabled={disabled}
      />
    </Field>
  );
}
