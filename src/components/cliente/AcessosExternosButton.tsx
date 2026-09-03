import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import powerbiLogo from '../../assets/powerbi-logo.webp';
import priceLogo from '../../assets/price-logo.svg';
import type { Cliente } from '../../types';
import { Button } from '../../ui';
import { calcularPosicaoPopover } from '../../utils/popoverPosicao';
import { abrirEEnviarLoginPrice, formatarCNPJ } from '../../utils/price';
import { revelarCredenciaisPrice } from '../../api/client';
import { toastError } from '../../utils/toast';
import { AbrirPriceModal, type FasePrice } from './AbrirPriceModal';

interface AcessoOpcao {
  label: string;
  /** Ausente = não é um link comum (`window.open`), é o Price — trata à
   *  parte, dispara `abrirPrice` em vez de navegar direto. */
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

// Duração de cada "letra" digitada na animação — pedido do usuário: gostou
// do efeito, mas rápido (~1s no total pro CNPJ+senha inteiros).
const MS_POR_CARACTERE = 22;
const PAUSA_ENTRE_CAMPOS_MS = 110;
const PAUSA_NO_BOTAO_MS = 160;
const MAX_PONTOS_SENHA = 10;

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

interface PriceModalState {
  fase: FasePrice;
  cnpjMostrado: string;
  senhaMostrada: string;
  erro: string;
}

/** Ícone por opção: o Price tem a logo própria (mesma da sidebar), o resto é
 *  sempre um link de Power BI. */
function Icone({ opcao }: { opcao: AcessoOpcao }) {
  if (opcao.label === PRICE_LABEL) {
    return <img src={priceLogo} alt="" style={{ height: 18, width: 'auto', objectFit: 'contain' }} />;
  }
  return <img src={powerbiLogo} alt="" style={{ width: 15, height: 15, objectFit: 'contain' }} />;
}

/**
 * Botão de acesso externo no cabeçalho do cadastro do cliente — um link por
 * SERVIÇO PowerBI que o cliente tem (`cliente.linksServicos`, preenchido no
 * cadastro por um seletor interno: escolhe o serviço, cola o link), mais o
 * Price quando o cliente tem login/senha salvos (`temSenhaPrice`) — esse não
 * abre direto: mostra uma animação (`AbrirPriceModal`, puramente visual) e
 * envia o login de verdade numa aba nova. Sem nenhum acesso cadastrado, o
 * botão nem aparece.
 */
export function AcessosExternosButton({ cliente, compacto = false }: AcessosExternosButtonProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [priceState, setPriceState] = useState<PriceModalState | null>(null);
  const nomeJanelaPrice = `price-2d-${cliente.id}`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Token da execução ATUAL da sequência do Price — não um "cancelado"
  // boolean (isso já causou bug real: um useEffect que resetava um ref desses
  // no topo acabava sendo enganado pelo StrictMode do React, que roda
  // montar→limpar→montar de novo em dev, e a sequência rodava DUAS vezes —
  // duas abas do Price abertas, ou a animação pulada). Um número que só
  // AUMENTA a cada clique, comparado antes de cada atualização de estado,
  // não sofre disso: mesmo se algo dessincronizar, só a execução MAIS
  // RECENTE de fato atualiza a tela.
  const execucaoPriceRef = useRef(0);
  // Guarda a credencial já revelada só pra viabilizar o botão manual da fase
  // 'bloqueado' (retry com um clique novo, de verdade) — nunca persiste, é
  // limpa assim que o login é enviado ou o modal fecha.
  const credencialPendenteRef = useRef<{ loginPrice: string; senhaPrice: string } | null>(null);

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

  /**
   * Sequência inteira do Price: busca credencial → anima → envia o login de
   * verdade. Vive na função do CLIQUE (não num `useEffect` de componente) de
   * propósito — é o que garante que só roda uma vez por clique, sem depender
   * de nenhuma garantia de ciclo de vida do React.
   */
  async function abrirPrice() {
    const meuToken = ++execucaoPriceRef.current;
    const aindaValido = () => execucaoPriceRef.current === meuToken;

    setPriceState({ fase: 'carregando', cnpjMostrado: '', senhaMostrada: '', erro: '' });

    const credenciais = await revelarCredenciaisPrice(cliente.id).catch(async (err: unknown) => {
      if (!aindaValido()) return null;
      const msg = err instanceof Error ? err.message : 'Falha ao buscar as credenciais do Price.';
      setPriceState({ fase: 'erro', cnpjMostrado: '', senhaMostrada: '', erro: msg });
      toastError(msg);
      await delay(1400);
      if (aindaValido()) setPriceState(null);
      return null;
    });
    if (!credenciais || !aindaValido()) return;
    const { loginPrice, senhaPrice } = credenciais;

    // Digita CNPJ char a char, pausa, digita senha (como pontos — nunca
    // mostra a senha real na tela, mesmo sendo uma animação nossa), pausa,
    // "aperta" o botão, envia de verdade.
    const cnpjFormatado = formatarCNPJ(loginPrice);
    setPriceState({ fase: 'cnpj', cnpjMostrado: '', senhaMostrada: '', erro: '' });
    for (let i = 1; i <= cnpjFormatado.length; i++) {
      await delay(MS_POR_CARACTERE);
      if (!aindaValido()) return;
      setPriceState({ fase: 'cnpj', cnpjMostrado: cnpjFormatado.slice(0, i), senhaMostrada: '', erro: '' });
    }
    await delay(PAUSA_ENTRE_CAMPOS_MS);
    if (!aindaValido()) return;

    const tamanhoSenha = Math.max(6, Math.min(senhaPrice.length, MAX_PONTOS_SENHA));
    setPriceState({ fase: 'senha', cnpjMostrado: cnpjFormatado, senhaMostrada: '', erro: '' });
    for (let i = 1; i <= tamanhoSenha; i++) {
      await delay(MS_POR_CARACTERE);
      if (!aindaValido()) return;
      setPriceState({ fase: 'senha', cnpjMostrado: cnpjFormatado, senhaMostrada: '•'.repeat(i), erro: '' });
    }
    await delay(PAUSA_ENTRE_CAMPOS_MS);
    if (!aindaValido()) return;

    setPriceState({ fase: 'clicando', cnpjMostrado: cnpjFormatado, senhaMostrada: '•'.repeat(tamanhoSenha), erro: '' });
    await delay(PAUSA_NO_BOTAO_MS);
    if (!aindaValido()) return;

    // Só agora a aba nasce — nada de janela/aba aparece antes disso. O custo:
    // já se passou tempo (busca de credencial + animação) desde o clique
    // original, então o navegador pode não reconhecer mais isso como gesto
    // do usuário e bloquear o pop-up. Nesse caso, cai no fallback manual.
    if (abrirEEnviarLoginPrice(loginPrice, senhaPrice, nomeJanelaPrice)) {
      setPriceState(null);
    } else {
      credencialPendenteRef.current = { loginPrice, senhaPrice };
      setPriceState({ fase: 'bloqueado', cnpjMostrado: cnpjFormatado, senhaMostrada: '•'.repeat(tamanhoSenha), erro: '' });
    }
  }

  function abrirPriceManualmente() {
    const credencial = credencialPendenteRef.current;
    if (!credencial) return;
    // Clique novo e real no botão do fallback — sempre passa como gesto do
    // usuário, então não precisa checar o retorno de novo.
    abrirEEnviarLoginPrice(credencial.loginPrice, credencial.senhaPrice, nomeJanelaPrice);
    credencialPendenteRef.current = null;
    setPriceState(null);
  }

  function fecharPriceModal() {
    execucaoPriceRef.current++; // invalida a sequência em andamento, se houver
    credencialPendenteRef.current = null;
    setPriceState(null);
  }

  function abrir(o: AcessoOpcao) {
    if (o.url) window.open(o.url, '_blank', 'noopener,noreferrer');
    else void abrirPrice();
    setOpen(false);
  }

  const estiloCompacto = compacto ? { padding: '0.28rem 0.45rem' } : undefined;
  const rotuloGrupo = opcoes.some((o) => o.label === PRICE_LABEL) && opcoes.length > 1 ? 'Acessos' : 'Power BI';

  const modalPrice = priceState && (
    <AbrirPriceModal
      fase={priceState.fase}
      cnpjMostrado={priceState.cnpjMostrado}
      senhaMostrada={priceState.senhaMostrada}
      erro={priceState.erro}
      onClose={fecharPriceModal}
      onAbrirManualmente={abrirPriceManualmente}
    />
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
