import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import powerbiLogo from '../../assets/powerbi-logo.webp';
import type { Cliente } from '../../types';
import { Button } from '../../ui';

interface AcessoOpcao {
  label: string;
  url: string;
}

interface AcessosExternosButtonProps {
  cliente: Cliente;
}

const Icone = () => <img src={powerbiLogo} alt="" style={{ width: 15, height: 15, objectFit: 'contain' }} />;

/**
 * Botão de acesso a PowerBI no cabeçalho do cadastro do cliente — um link por
 * SERVIÇO PowerBI que o cliente tem (`cliente.linksServicos`, preenchido no
 * cadastro por um seletor interno: escolhe o serviço, cola o link). Sem
 * nenhum link cadastrado, o botão nem aparece.
 */
export function AcessosExternosButton({ cliente }: AcessosExternosButtonProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const opcoes: AcessoOpcao[] = Object.entries(cliente.linksServicos ?? {})
    .filter(([, url]) => url?.trim())
    .map(([label, url]) => ({ label, url: url.trim() }));

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (opcoes.length === 0) return null;

  function abrir(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer');
    setOpen(false);
  }

  // Um único link cadastrado: abre direto, sem popover — menos clique no caso comum.
  if (opcoes.length === 1) {
    const [unica] = opcoes;
    return (
      <Button variant="secondary" onClick={() => abrir(unica.url)} title={`Abrir ${unica.label}`}>
        <Icone /> {unica.label}
      </Button>
    );
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <Button
        variant="secondary"
        onClick={() => {
          if (!open && wrapRef.current) setRect(wrapRef.current.getBoundingClientRect());
          setOpen((o) => !o);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Icone /> Power BI <ChevronDown size={13} />
      </Button>
      {open && rect && createPortal(
        <div
          ref={popRef}
          role="listbox"
          className="filter-pop"
          style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, minWidth: rect.width }}
        >
          {opcoes.map((o) => (
            <button type="button" key={o.label} role="option" onClick={() => abrir(o.url)} className="filter-pop-item">
              <Icone /> {o.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
