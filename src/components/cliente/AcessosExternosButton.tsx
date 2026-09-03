import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import powerbiLogo from '../../assets/powerbi-logo.webp';
import priceLogo from '../../assets/price-logo.svg';
import type { Cliente } from '../../types';
import { Button } from '../../ui';
import { calcularPosicaoPopover } from '../../utils/popoverPosicao';
import { abrirAbaPrice } from '../../utils/price';
import { toastError } from '../../utils/toast';
import { AbrirPriceModal } from './AbrirPriceModal';

interface AcessoOpcao {
  label: string;
  /** Ausente = não é um link comum (`window.open`), é o Price — trata à
   *  parte, abre `AbrirPriceModal` em vez de navegar direto. */
  url?: string;
}

interface AcessosExternosButtonProps {
  cliente: Cliente;
  /** `true` na COLUNA da tabela de clientes: botão pequeno, sem o texto
   *  "Power BI"/nome do serviço (a linha da tabela não tem largura pra isso) —
   *  o nome do serviço continua no popover e no `title`. */
  compacto?: boolean;
}

const PRICE_LABEL = 'Price';

/** Ícone por opção: o Price tem a logo própria (mesma da sidebar), o resto é
 *  sempre um link de Power BI. */
function Icone({ opcao }: { opcao: AcessoOpcao }) {
  const src = opcao.label === PRICE_LABEL ? priceLogo : powerbiLogo;
  return <img src={src} alt="" style={{ width: 15, height: 15, objectFit: 'contain' }} />;
}

/**
 * Botão de acesso externo no cabeçalho do cadastro do cliente — um link por
 * SERVIÇO PowerBI que o cliente tem (`cliente.linksServicos`, preenchido no
 * cadastro por um seletor interno: escolhe o serviço, cola o link), mais o
 * Price quando o cliente tem login/senha salvos (`temSenhaPrice`) — esse não
 * abre direto: dispara `AbrirPriceModal` (animação + login automático).
 * Sem nenhum acesso cadastrado, o botão nem aparece.
 */
export function AcessosExternosButton({ cliente, compacto = false }: AcessosExternosButtonProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [priceModalAberto, setPriceModalAberto] = useState(false);
  const nomeJanelaPrice = `price-2d-${cliente.id}`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const opcoes: AcessoOpcao[] = [
    ...Object.entries(cliente.linksServicos ?? {})
      .filter(([, url]) => url?.trim())
      .map(([label, url]) => ({ label, url: url.trim() })),
    ...(cliente.temSenhaPrice ? [{ label: PRICE_LABEL }] : []),
  ];

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

  if (opcoes.length === 0) return compacto ? <span className="text-text-muted">—</span> : null;

  function abrir(o: AcessoOpcao) {
    if (o.url) {
      window.open(o.url, '_blank', 'noopener,noreferrer');
    } else {
      // Price: abre a aba (em branco) AGORA, ainda dentro do clique — é o
      // que evita o bloqueio de pop-up. `enviarLoginPrice` (chamado só depois
      // da animação, no AbrirPriceModal) navega essa MESMA janela pelo nome,
      // não abre outra — não precisa guardar a referência, só o nome.
      if (!abrirAbaPrice(nomeJanelaPrice)) {
        toastError('O navegador bloqueou a aba do Price. Permita pop-ups pra este site e tente de novo.');
        setOpen(false);
        return;
      }
      setPriceModalAberto(true);
    }
    setOpen(false);
  }

  const estiloCompacto = compacto ? { padding: '0.28rem 0.45rem' } : undefined;
  const rotuloGrupo = opcoes.some((o) => o.label === PRICE_LABEL) && opcoes.length > 1 ? 'Acessos' : 'Power BI';

  const modalPrice = priceModalAberto && (
    <AbrirPriceModal clientId={cliente.id} nomeJanela={nomeJanelaPrice} onClose={() => setPriceModalAberto(false)} />
  );

  // Um único acesso cadastrado: abre direto, sem popover — menos clique no caso comum.
  if (opcoes.length === 1) {
    const [unica] = opcoes;
    return (
      <>
        <Button variant="secondary" onClick={() => abrir(unica)} title={`Abrir ${unica.label}`} style={estiloCompacto}>
          <Icone opcao={unica} /> {!compacto && unica.label}
        </Button>
        {modalPrice}
      </>
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
        title={compacto ? `${opcoes.length} links: ${opcoes.map((o) => o.label).join(', ')}` : undefined}
        style={estiloCompacto}
      >
        <img src={powerbiLogo} alt="" style={{ width: 15, height: 15, objectFit: 'contain' }} /> {compacto ? opcoes.length : rotuloGrupo} <ChevronDown size={13} />
      </Button>
      {open && rect && createPortal(
        <div
          ref={popRef}
          role="listbox"
          className="filter-pop"
          style={{ position: 'fixed', ...calcularPosicaoPopover(rect, { largura: rect.width }), minWidth: rect.width, overflowY: 'auto' }}
        >
          {opcoes.map((o) => (
            <button type="button" key={o.label} role="option" onClick={() => abrir(o)} className="filter-pop-item">
              <Icone opcao={o} /> {o.label}
            </button>
          ))}
        </div>,
        document.body
      )}
      {modalPrice}
    </div>
  );
}
