import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  /** Texto quando nada selecionado (multi) ou fallback. */
  label: string;
  options: DropdownOption[];
  /** string (single) ou string[] (multi). */
  value: string | string[];
  onChange: (value: string | string[]) => void;
  multiple?: boolean;
  /** Single: valor que representa "sem filtro" (não destaca em dourado). */
  defaultValue?: string;
}

/** Dropdown padronizado para TODOS os filtros (single e múltipla escolha). */
export function Dropdown({ label, options, value, onChange, multiple, defaultValue }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const arr = Array.isArray(value) ? value : [];
  const isSel = (v: string) => (multiple ? arr.includes(v) : value === v);

  const ativo = multiple ? arr.length > 0 : !!value && value !== (defaultValue ?? '');
  const triggerText = multiple ? label : (options.find((o) => o.value === value)?.label ?? label);

  function pick(v: string) {
    if (multiple) {
      onChange(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
    } else {
      onChange(v);
      setOpen(false);
    }
  }

  return (
    <div className={`relative min-w-0${open ? ' z-40' : ''}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`filter-ctl w-full justify-between${ativo ? ' is-active' : ''}${open ? ' is-open' : ''}`}
      >
        <span className="truncate">
          {triggerText}
          {multiple && ativo && <span className="filter-ctl-count">{arr.length}</span>}
        </span>
        <ChevronDown size={15} className="filter-ctl-chevron shrink-0" />
      </button>
      {open && (
        <div className="filter-pop">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-[0.8rem] text-text-muted">Sem opções</div>
          ) : (
            options.map((o) => (
              <button type="button" key={o.value} onClick={() => pick(o.value)} className="filter-pop-item">
                <span className={`filter-check${isSel(o.value) ? ' is-on' : ''}`}>
                  {isSel(o.value) && <Check size={11} strokeWidth={3} />}
                </span>
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
