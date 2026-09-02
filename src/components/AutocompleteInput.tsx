import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Input } from '../ui';
import { calcularPosicaoPopover } from '../utils/popoverPosicao';

interface AutocompleteInputProps {
  value: string;
  onChange: (v: string) => void;
  /** Sugestões reais (ex.: catálogo de produtos/clientes finais de Dados Alvos). */
  opcoes: string[];
  placeholder?: string;
  tone?: 'default' | 'modal';
  style?: React.CSSProperties;
  /** Enter com o campo preenchido e nenhuma sugestão destacada. */
  onEnter?: () => void;
}

/**
 * Campo de texto com sugestões — NÃO um select fechado: o valor final é texto
 * livre de propósito (produto/cliente novo, ainda não presente no arquivo de
 * vendas, tem de poder ser registrado). A sugestão existe pra harmonizar o
 * nome com o que existe de verdade, que era o problema de digitar às cegas:
 * "kit de amortecedores" nunca casa com "Kit Amortecedor" nos cálculos.
 *
 * Popover via portal, mesmo padrão de `Dropdown`/`ClienteCombobox` — dentro de
 * modal, um popover no fluxo normal fica cortado.
 */
export function AutocompleteInput({ value, onChange, opcoes, placeholder, tone, style, onEnter }: AutocompleteInputProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const busca = value.trim().toLowerCase();
  const filtradas = (busca ? opcoes.filter((o) => o.toLowerCase().includes(busca)) : opcoes)
    // Já digitou o nome exato: sugerir ele mesmo não ajuda em nada.
    .filter((o) => o.toLowerCase() !== busca)
    .slice(0, 8);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function abrir() {
    if (wrapRef.current) setRect(wrapRef.current.getBoundingClientRect());
    setOpen(true);
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', ...style }}>
      <Input
        tone={tone}
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); abrir(); }}
        onFocus={abrir}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); setOpen(false); onEnter?.(); }
        }}
        style={{ width: '100%' }}
      />
      {open && rect && filtradas.length > 0 && createPortal(
        <div
          ref={popRef}
          role="listbox"
          className="filter-pop"
          style={{ position: 'fixed', ...calcularPosicaoPopover(rect, { largura: Math.max(rect.width, 220) }), width: Math.max(rect.width, 220), overflowY: 'auto' }}
        >
          {filtradas.map((o) => (
            <button
              type="button"
              key={o}
              role="option"
              className="filter-pop-item"
              onClick={() => { onChange(o); setOpen(false); }}
            >
              {o}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
