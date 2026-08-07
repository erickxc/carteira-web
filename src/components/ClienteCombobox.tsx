import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Input } from '../ui';

interface ClienteOption {
  id: string;
  empresa: string;
}

interface ClienteComboboxProps {
  clientes: ClienteOption[];
  value: string;
  onChange: (id: string) => void;
  tone?: 'default' | 'modal';
  placeholder?: string;
}

/**
 * Select de cliente com busca por texto — o nativo <select> não permite
 * digitar pra filtrar (só "pular" pra opção que começa com a letra digitada),
 * o que é inviável com dezenas de clientes. Lista sempre em ordem alfabética.
 * Popover via portal (mesmo padrão de Dropdown.tsx) pra não ficar preso atrás
 * do conteúdo do modal.
 */
export function ClienteCombobox({ clientes, value, onChange, tone, placeholder = 'Selecione...' }: ClienteComboboxProps) {
  const ordenados = useMemo(
    () => [...clientes].sort((a, b) => a.empresa.localeCompare(b.empresa, 'pt-BR')),
    [clientes]
  );
  const selecionado = ordenados.find((c) => c.id === value);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [ativo, setAtivo] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const filtrados = query.trim()
    ? ordenados.filter((c) => c.empresa.toLowerCase().includes(query.trim().toLowerCase()))
    : ordenados;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (!wrapperRef.current?.contains(t) && !popRef.current?.contains(t)) { setOpen(false); setQuery(''); }
    }
    function reposiciona() { if (wrapperRef.current) setRect(wrapperRef.current.getBoundingClientRect()); }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', reposiciona);
    window.addEventListener('scroll', reposiciona, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('resize', reposiciona);
      window.removeEventListener('scroll', reposiciona, true);
    };
  }, [open]);

  function abrir() {
    if (wrapperRef.current) setRect(wrapperRef.current.getBoundingClientRect());
    setQuery('');
    setAtivo(0);
    setOpen(true);
  }

  function escolher(c: ClienteOption) {
    onChange(c.id);
    setQuery('');
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { e.preventDefault(); abrir(); }
      return;
    }
    if (e.key === 'Escape') { setOpen(false); setQuery(''); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo((i) => Math.min(i + 1, filtrados.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtrados[ativo]) escolher(filtrados[ativo]); }
  }

  return (
    <div className="relative min-w-0" ref={wrapperRef}>
      <Input
        tone={tone}
        value={open ? query : (selecionado?.empresa ?? '')}
        placeholder={selecionado && !open ? selecionado.empresa : placeholder}
        onFocus={abrir}
        onChange={(e) => { setQuery(e.target.value); setAtivo(0); if (!open) setOpen(true); }}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      {open && rect && createPortal(
        <div
          ref={popRef}
          role="listbox"
          className="filter-pop"
          style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: rect.width, maxHeight: 240, overflowY: 'auto' }}
        >
          {filtrados.length === 0 ? (
            <div className="px-3 py-2 text-[0.8rem] text-text-muted">Nenhum cliente encontrado</div>
          ) : (
            filtrados.map((c, i) => (
              <button
                type="button"
                key={c.id}
                role="option"
                aria-selected={c.id === value}
                className={`filter-pop-item${i === ativo ? ' is-active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(c)}
              >
                {c.empresa}
              </button>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
