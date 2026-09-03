import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import priceLogo from '../../assets/price-logo.svg';
import { revelarCredenciaisPrice } from '../../api/client';
import { toastError } from '../../utils/toast';
import { formatarCNPJ, enviarLoginPrice } from '../../utils/price';
import { useFecharAnimado } from '../../hooks/useFecharAnimado';

interface AbrirPriceModalProps {
  clientId: string;
  onClose: () => void;
}

/** Duração de cada "letra" digitada — rápido o bastante pra não parecer lento,
 *  devagar o bastante pra dar pra acompanhar (pedido do usuário: ver a
 *  animação, não só um flash). */
const MS_POR_CARACTERE = 45;
const PAUSA_ENTRE_CAMPOS_MS = 220;
const PAUSA_NO_BOTAO_MS = 320;

type Fase = 'carregando' | 'cnpj' | 'senha' | 'clicando' | 'erro';

/**
 * Réplica VISUAL (não funcional) da tela de login do Price, só pra dar
 * feedback de que a Carteira está "preenchendo e entrando" — nunca gira em
 * cima da página real do Price (impossível: outra origem, o navegador não
 * deixa nenhum site controlar visualmente outro). Depois da animação, envia
 * o formulário de verdade (`enviarLoginPrice`) numa aba nova de verdade, com
 * a sessão normal do navegador de quem clicou.
 *
 * Fecha sozinho ao final — não é um modal que o usuário opera, é uma
 * transição.
 */
export function AbrirPriceModal({ clientId, onClose }: AbrirPriceModalProps) {
  const { fechando, fechar } = useFecharAnimado(onClose);
  const [fase, setFase] = useState<Fase>('carregando');
  const [cnpjMostrado, setCnpjMostrado] = useState('');
  const [senhaMostrada, setSenhaMostrada] = useState('');
  const [erro, setErro] = useState('');
  const cancelado = useRef(false);

  useEffect(() => {
    // Local ao efeito (não um ref): só o `t`/cleanup DESTA execução leem isto,
    // não precisa sobreviver a re-render nenhum.
    const idsAgendados: number[] = [];
    const t = (fn: () => void, ms: number) => { idsAgendados.push(window.setTimeout(fn, ms)); };

    revelarCredenciaisPrice(clientId)
      .then(({ loginPrice, senhaPrice }) => {
        if (cancelado.current) return;
        const cnpjFormatado = formatarCNPJ(loginPrice);

        // Sequência: digita CNPJ char a char, pausa, digita senha (como
        // pontos — nunca mostra a senha real na tela, mesmo sendo uma
        // animação nossa), pausa, "aperta" o botão, envia de verdade.
        setFase('cnpj');
        for (let i = 1; i <= cnpjFormatado.length; i++) {
          t(() => setCnpjMostrado(cnpjFormatado.slice(0, i)), i * MS_POR_CARACTERE);
        }
        const fimCnpj = cnpjFormatado.length * MS_POR_CARACTERE + PAUSA_ENTRE_CAMPOS_MS;

        t(() => setFase('senha'), fimCnpj);
        const tamanhoSenha = Math.max(6, Math.min(senhaPrice.length, 16));
        for (let i = 1; i <= tamanhoSenha; i++) {
          t(() => setSenhaMostrada('•'.repeat(i)), fimCnpj + i * MS_POR_CARACTERE);
        }
        const fimSenha = fimCnpj + tamanhoSenha * MS_POR_CARACTERE + PAUSA_ENTRE_CAMPOS_MS;

        t(() => setFase('clicando'), fimSenha);
        t(() => {
          enviarLoginPrice(loginPrice, senhaPrice);
          fechar();
        }, fimSenha + PAUSA_NO_BOTAO_MS);
      })
      .catch((err) => {
        if (cancelado.current) return;
        setFase('erro');
        setErro(err instanceof Error ? err.message : 'Falha ao buscar as credenciais do Price.');
        toastError(err instanceof Error ? err.message : 'Falha ao buscar as credenciais do Price.');
        t(fechar, 1400); // dá tempo de ler o erro antes de sumir sozinho
      });

    return () => {
      cancelado.current = true;
      idsAgendados.forEach((id) => window.clearTimeout(id));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  return createPortal(
    <div className={`modal-overlay${fechando ? ' is-closing' : ''}`} onClick={fechar}>
      <div className="modal" style={{ maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
        <div className="p-6 flex flex-col items-center gap-4">
          <img src={priceLogo} alt="Price" style={{ height: 28, width: 'auto' }} />

          {fase === 'carregando' ? (
            <p className="text-[0.85rem] text-text-muted flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Buscando credenciais...
            </p>
          ) : fase === 'erro' ? (
            <p className="text-[0.85rem] text-danger text-center">{erro}</p>
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
