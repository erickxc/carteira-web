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

  const texto = selected.length === 0 ? label : `${label} (${selected.length})`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-2 min-w-[150px] rounded-sm border border-border-strong bg-card px-[0.7rem] py-[0.5rem] text-[0.85rem] hover:border-text-muted transition-colors"
      >
        <span className={selected.length ? 'text-accent font-medium' : 'text-text-secondary'}>{texto}</span>
        <ChevronDown size={15} className="text-text-muted" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-[190px] max-h-64 overflow-auto rounded-sm border border-border-strong bg-card shadow-lg p-1">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-[0.8rem] text-text-muted">Sem opções</div>
          ) : (
            options.map((o) => (
              <button
                type="button"
                key={o}
                onClick={() => toggle(o)}
                className="flex items-center gap-2 w-full text-left rounded-sm px-2 py-[0.4rem] text-[0.85rem] text-text-secondary hover:bg-card-hover transition-colors"
              >
                <span className={`w-4 h-4 rounded-[3px] border flex items-center justify-center shrink-0 ${selected.includes(o) ? 'bg-accent border-accent' : 'border-border-strong'}`}>
                  {selected.includes(o) && <Check size={11} className="text-black" />}
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
