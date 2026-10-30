import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '../ui';

export interface ItemMenuMais {
  rotulo: ReactNode;
  onClick: () => void;
  perigo?: boolean;
}

/** Botão "..." com as ações menos usadas da tela. Fecha ao clicar fora ou com Esc. */
export function MenuMais({ itens }: { itens: ItemMenuMais[] }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setAberto(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [aberto]);

  return (
    <div ref={ref} className="relative">
      <Button variant="secondary" size="icon" onClick={() => setAberto((v) => !v)} aria-label="Mais ações" aria-haspopup="menu" aria-expanded={aberto}>
        <MoreHorizontal size={15} />
      </Button>
      {aberto && (
        <div role="menu" className="filter-pop absolute right-0 top-[calc(100%+4px)]">
          {itens.map((item, i) => (
            <button key={i} type="button" role="menuitem" className="filter-pop-item" style={item.perigo ? { color: 'var(--danger-fg)' } : undefined} onClick={() => { setAberto(false); item.onClick(); }}>
              {item.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
