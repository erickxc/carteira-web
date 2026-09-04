import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { calcularPosicaoPopover } from '../utils/popoverPosicao';

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
  disabled?: boolean;
  /**
   * 'filtro' (default) = destaque dourado quando difere do padrão — faz
   * sentido num FILTRO (sinaliza "está restringindo algo"). 'campo' = mesmo
   * componente usado como campo de formulário comum (`SelectField`) — nunca
   * destaca, senão todo campo preenchido pareceria "ativo"/especial, o que
   * não é o caso (um Monitor selecionado é o estado normal, não um filtro).
   */
  variant?: 'filtro' | 'campo';
}

/**
 * Dropdown padronizado para TODOS os filtros (single e múltipla escolha) e,
 * via `SelectField`, para campo de formulário comum — substitui o `<select>`
 * nativo, cuja lista de opções é desenhada pelo navegador/SO e não segue o
 * CSS do app (reportado como "frontend do seletor é um html simples").
 * O popover é renderizado via portal no <body> com posição fixa — assim nunca
 * fica preso atrás da tabela (contexto de empilhamento dos cards).
 */
export function Dropdown({ label, options, value, onChange, multiple, defaultValue, disabled, variant = 'filtro' }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
    }
    function reposicionaOuFecha() {
      if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', reposicionaOuFecha);
    window.addEventListener('scroll', reposicionaOuFecha, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', reposicionaOuFecha);
      window.removeEventListener('scroll', reposicionaOuFecha, true);
    };
  }, [open]);

  function toggleOpen() {
    if (disabled) return;
    if (open) { setOpen(false); return; }
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    setOpen(true);
  }

  const arr = Array.isArray(value) ? value : [];
  const isSel = (v: string) => (multiple ? arr.includes(v) : value === v);
  const ativo = variant === 'filtro' && (multiple ? arr.length > 0 : !!value && value !== (defaultValue ?? ''));
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
    <div className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`filter-ctl w-full justify-between${ativo ? ' is-active' : ''}${open ? ' is-open' : ''}${disabled ? ' opacity-50 cursor-not-allowed' : ''}`}
      >
        <span className="truncate">
          {triggerText}
          {multiple && ativo && <span className="filter-ctl-count">{arr.length}</span>}
        </span>
        <ChevronDown size={15} className="filter-ctl-chevron shrink-0" />
      </button>

      {open && rect && createPortal(
        <div
          ref={popRef}
          role="listbox"
          aria-multiselectable={multiple}
          className="filter-pop"
          style={{ position: 'fixed', ...calcularPosicaoPopover(rect, { largura: rect.width }), width: rect.width, overflowY: 'auto' }}
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-[0.8rem] text-text-muted">Sem opções</div>
          ) : (
            options.map((o) => (
              <button type="button" key={o.value} role="option" aria-selected={isSel(o.value)} onClick={() => pick(o.value)} className="filter-pop-item">
                <span className={`filter-check${isSel(o.value) ? ' is-on' : ''}`}>
                  {isSel(o.value) && <Check size={11} strokeWidth={3} />}
                </span>
                {o.label}
              </button>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
