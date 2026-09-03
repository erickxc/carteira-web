import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import powerbiLogo from '../../assets/powerbi-logo.webp';
import priceLogo from '../../assets/price-logo.svg';
import type { Cliente } from '../../types';
import { Button } from '../../ui';
import { calcularPosicaoPopover } from '../../utils/popoverPosicao';
import {
  abrirAbaPriceComAnimacao, enviarLoginPrice, formatarCNPJ, mostrarErroNaAbaPrice,
  type AnimacaoPrice,
} from '../../utils/price';
import { revelarCredenciaisPrice } from '../../api/client';
import { toastError } from '../../utils/toast';

interface AcessoOpcao {
  label: string;
  /** Ausente = não é um link comum (`window.open`), é o Price — abre a aba
   *  com a animação de login (ver `abrirPrice`). */
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

// Duração de cada "letra" digitada — pedido do usuário: gostou do efeito,
// mas rápido (~1s no total pro CNPJ + senha inteiros).
const MS_POR_CARACTERE = 22;
const PAUSA_ENTRE_CAMPOS_MS = 110;
const PAUSA_NO_BOTAO_MS = 160;
const MAX_PONTOS_SENHA = 10;

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Ícone por opção: o Price tem a logo própria (mesma da sidebar), o resto é
 *  sempre um link de Power BI. */
function Icone({ opcao }: { opcao: AcessoOpcao }) {
  const src = opcao.label === PRICE_LABEL ? priceLogo : powerbiLogo;
  return <img src={src} alt="" style={{ width: 15, height: 15, objectFit: 'contain' }} />;
}

/** Digita um texto caractere por caractere dentro da aba, com cursor piscando. */
async function digitar(alvo: HTMLElement, cursor: HTMLElement, texto: string, aindaValido: () => boolean) {
  cursor.style.display = 'inline-block';
  for (let i = 1; i <= texto.length; i++) {
    await delay(MS_POR_CARACTERE);
    if (!aindaValido()) return;
    alvo.textContent = texto.slice(0, i);
  }
  cursor.style.display = 'none';
}

/**
 * Botão de acesso externo no cabeçalho do cadastro do cliente — um link por
 * SERVIÇO PowerBI que o cliente tem (`cliente.linksServicos`, preenchido no
 * cadastro por um seletor interno: escolhe o serviço, cola o link), mais o
 * Price quando o cliente tem login/senha salvos (`temSenhaPrice`) — esse não
 * abre direto: a aba nova mostra o login sendo preenchido e depois entra.
 * Sem nenhum acesso cadastrado, o botão nem aparece.
 */
export function AcessosExternosButton({ cliente, compacto = false }: AcessosExternosButtonProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const nomeJanelaPrice = `price-2d-${cliente.id}`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Token da execução ATUAL da sequência do Price — não um "cancelado"
  // boolean (isso já causou bug real: com `useEffect` + ref, o StrictMode do
  // React rodava a sequência duas vezes, abrindo duas abas). Um número que
  // só AUMENTA a cada clique garante que só a execução mais recente escreve
  // na aba.
  const execucaoPriceRef = useRef(0);

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

  /** Anima o preenchimento DENTRO da aba e envia o login de verdade. */
  async function animarEEntrar(els: AnimacaoPrice, loginPrice: string, senhaPrice: string, aindaValido: () => boolean) {
    await digitar(els.cnpj, els.cursorCnpj, formatarCNPJ(loginPrice), aindaValido);
    if (!aindaValido()) return;
    await delay(PAUSA_ENTRE_CAMPOS_MS);
    if (!aindaValido()) return;

    // Senha sempre em pontinhos — nunca mostra o texto real, nem numa
    // animação nossa; o tamanho é só visual, não reflete a senha de verdade.
    const pontos = '•'.repeat(Math.max(6, Math.min(senhaPrice.length, MAX_PONTOS_SENHA)));
    await digitar(els.senha, els.cursorSenha, pontos, aindaValido);
    if (!aindaValido()) return;
    await delay(PAUSA_ENTRE_CAMPOS_MS);
    if (!aindaValido()) return;

    els.botao.classList.add('apertado');
    await delay(PAUSA_NO_BOTAO_MS);
  }

  /**
   * Sequência inteira do Price: abre a aba (síncrono, pro pop-up não ser
   * bloqueado) → busca credencial → anima DENTRO da aba → envia o login.
   * Vive na função do CLIQUE, não num `useEffect`, de propósito: o React
   * nunca invoca um handler de clique em duplicidade, e isso já foi a causa
   * raiz de dois bugs aqui (duas abas / animação pulada).
   */
  async function abrirPrice() {
    const aberta = abrirAbaPriceComAnimacao(nomeJanelaPrice);
    if (!aberta) {
      toastError('O navegador bloqueou a aba do Price. Permita pop-ups pra este site e tente de novo.');
      return;
    }

    const meuToken = ++execucaoPriceRef.current;
    const aindaValido = () => execucaoPriceRef.current === meuToken && !aberta.janela.closed;

    const credenciais = await revelarCredenciaisPrice(cliente.id).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Falha ao buscar as credenciais do Price.';
      if (aindaValido()) mostrarErroNaAbaPrice(aberta.janela, msg);
      toastError(msg);
      return null;
    });
    if (!credenciais || !aindaValido()) return;

    const { loginPrice, senhaPrice } = credenciais;
    if (aberta.els) await animarEEntrar(aberta.els, loginPrice, senhaPrice, aindaValido);
    if (!aindaValido()) return;

    enviarLoginPrice(loginPrice, senhaPrice, nomeJanelaPrice);
  }

  function abrir(o: AcessoOpcao) {
    if (o.url) window.open(o.url, '_blank', 'noopener,noreferrer');
    else void abrirPrice();
    setOpen(false);
  }

  const estiloCompacto = compacto ? { padding: '0.28rem 0.45rem' } : undefined;
  const rotuloGrupo = opcoes.some((o) => o.label === PRICE_LABEL) && opcoes.length > 1 ? 'Acessos' : 'Power BI';

  // Um único acesso cadastrado: abre direto, sem popover — menos clique no caso comum.
  if (opcoes.length === 1) {
    const [unica] = opcoes;
    return (
      <Button variant="secondary" onClick={() => abrir(unica)} title={`Abrir ${unica.label}`} style={estiloCompacto}>
        <Icone opcao={unica} /> {!compacto && unica.label}
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
    </div>
  );
}
