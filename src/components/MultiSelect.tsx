import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

interface MultiSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}

/** Seleção múltipla com popover de checkboxes (fecha ao clicar fora). */
export function MultiSelect({ label, options, selected, onChange }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const toggle = (o: string) =>
    onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]);

  const ativo = selected.length > 0;

  return (
    <div className="relative min-w-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`filter-ctl w-full justify-between${ativo ? ' is-active' : ''}${open ? ' is-open' : ''}`}
      >
        <span className="truncate">
          {label}{ativo && <span className="filter-ctl-count">{selected.length}</span>}
        </span>
        <ChevronDown size={15} className="filter-ctl-chevron shrink-0" />
      </button>
      {open && (
        <div className="filter-pop">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-[0.8rem] text-text-muted">Sem opções</div>
          ) : (
            options.map((o) => (
              <button
                type="button"
                key={o}
                onClick={() => toggle(o)}
                className="filter-pop-item"
              >
                <span className={`filter-check${selected.includes(o) ? ' is-on' : ''}`}>
                  {selected.includes(o) && <Check size={11} strokeWidth={3} />}
                </span>
                {o}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
