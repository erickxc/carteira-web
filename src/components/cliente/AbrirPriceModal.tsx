import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import priceLogo from '../../assets/price-logo.svg';

export type FasePrice = 'carregando' | 'cnpj' | 'senha' | 'clicando' | 'erro' | 'bloqueado';

interface AbrirPriceModalProps {
  fase: FasePrice;
  cnpjMostrado: string;
  senhaMostrada: string;
  erro: string;
  onClose: () => void;
  /** Só usado na fase 'bloqueado' — reabre a aba a partir de um clique real
   *  do usuário (o navegador só permite pop-up dentro de um gesto). */
  onAbrirManualmente?: () => void;
}

/**
 * Réplica VISUAL (não funcional) da tela de login do Price — puramente
 * apresentacional, sem estado nem `useEffect` próprios. Toda a sequência
 * (buscar credenciais → animar → enviar o login de verdade) mora no clique
 * que abre isto (`AcessosExternosButton.abrirPrice`), de propósito: um
 * `useEffect` aqui já causou dois bugs reais em produção — o StrictMode do
 * React (dev) roda montar→limpar→montar de novo, e a sequência (fetch +
 * timers) acabava executando MAIS DE UMA VEZ (duas abas do Price abertas,
 * ou a animação pulada porque uma execução fantasma terminava antes da
 * visível começar). Um componente sem side-effect nenhum não pode sofrer
 * disso — só mostra o que o clique manda mostrar.
 */
export function AbrirPriceModal({ fase, cnpjMostrado, senhaMostrada, erro, onClose, onAbrirManualmente }: AbrirPriceModalProps) {
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
        <div className="p-6 flex flex-col items-center gap-4">
          <img src={priceLogo} alt="Price" style={{ height: 28, width: 'auto' }} />

          {fase === 'carregando' ? (
            <p className="text-[0.85rem] text-text-muted flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Buscando credenciais...
            </p>
          ) : fase === 'erro' ? (
            <p className="text-[0.85rem] text-danger text-center">{erro}</p>
          ) : fase === 'bloqueado' ? (
            <>
              <p className="text-[0.85rem] text-text-muted text-center">
                O navegador bloqueou a abertura automática. Clique abaixo pra abrir o Price já logado.
              </p>
              <button type="button" className="price-fake-botao" onClick={onAbrirManualmente}>
                Abrir o Price
              </button>
            </>
          ) : (
            <div className="w-full flex flex-col gap-3">
              <div className="price-fake-input">
                <span className="text-text-muted" style={{ fontSize: 11 }}>CNPJ</span>
                <div className="price-fake-input-valor">
                  {cnpjMostrado}
                  {fase === 'cnpj' && <span className="price-fake-cursor" />}
                </div>
              </div>
              <div className="price-fake-input">
                <span className="text-text-muted" style={{ fontSize: 11 }}>Senha</span>
                <div className="price-fake-input-valor">
                  {senhaMostrada}
                  {fase === 'senha' && <span className="price-fake-cursor" />}
                </div>
              </div>
              <button
                type="button"
                tabIndex={-1}
                className={`price-fake-botao${fase === 'clicando' ? ' is-pressed' : ''}`}
              >
                Entrar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
