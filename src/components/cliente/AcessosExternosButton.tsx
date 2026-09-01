import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ExternalLink } from 'lucide-react';
import plataformaLogo from '../../assets/plataforma-logo.svg';
import type { Cliente } from '../../types';
import { Button } from '../../ui';

interface AcessoOpcao {
  label: string;
  url: string;
  icon: ReactNode;
}

interface AcessosExternosButtonProps {
  cliente: Cliente;
}

/**
 * Botão de acesso externo no cabeçalho do cadastro do cliente (Power BI /
 * Plataforma). Diferente de PRISMA/Price na sidebar (2 botões fixos, link
 * único pro app inteiro): aqui o link é PRÓPRIO de cada cliente — por isso é
 * um seletor só, que lista apenas o que está preenchido pra este cliente
 * (campo "Links externos" na edição). Sem nenhum link cadastrado, o botão
 * nem aparece.
 */
export function AcessosExternosButton({ cliente }: AcessosExternosButtonProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const candidatos: (AcessoOpcao | null)[] = [
    cliente.linkPowerBI?.trim()
      ? { label: 'Power BI', url: cliente.linkPowerBI.trim(), icon: <ExternalLink size={15} /> }
      : null,
    cliente.linkPlataforma?.trim()
      ? { label: 'Plataforma', url: cliente.linkPlataforma.trim(), icon: <img src={plataformaLogo} alt="" style={{ width: 15, height: 15, objectFit: 'contain' }} /> }
      : null,
  ];
  const opcoes = candidatos.filter((o): o is AcessoOpcao => o !== null);

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
        {unica.icon} {unica.label}
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
        <ExternalLink size={15} /> Acessar <ChevronDown size={13} />
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
              {o.icon} {o.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
