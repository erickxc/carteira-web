import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import priceLogo from '../../assets/price-logo.svg';
import { revelarCredenciaisPrice } from '../../api/client';
import { toastError } from '../../utils/toast';
import { formatarCNPJ, enviarLoginPrice } from '../../utils/price';
import { useFecharAnimado } from '../../hooks/useFecharAnimado';

interface AbrirPriceModalProps {
  clientId: string;
  /** Nome da janela já aberta (em branco) pelo clique que disparou este modal
   *  — ver `AcessosExternosButton.abrir`. `enviarLoginPrice` navega essa
   *  janela pelo nome; abrir aqui, depois da animação, seria bloqueado como
   *  pop-up (só conta como "clique do usuário" o `window.open` síncrono). */
  nomeJanela: string;
  onClose: () => void;
}

/** Duração de cada "letra" digitada — pedido do usuário: gostou da animação,
 *  mas rápida (valores antigos, 45/220/320, somavam quase 2s pro CNPJ+senha
 *  inteiros; ~1s no total dá pra acompanhar sem virar demora). Senha limitada
 *  a 10 pontinhos mesmo se a senha real for maior — é só efeito visual, não
 *  precisa refletir o tamanho de verdade. */
const MS_POR_CARACTERE = 22;
const PAUSA_ENTRE_CAMPOS_MS = 110;
const PAUSA_NO_BOTAO_MS = 160;
const MAX_PONTOS_SENHA = 10;

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
export function AbrirPriceModal({ clientId, nomeJanela, onClose }: AbrirPriceModalProps) {
  const { fechando, fechar } = useFecharAnimado(onClose);
  const [fase, setFase] = useState<Fase>('carregando');
  const [cnpjMostrado, setCnpjMostrado] = useState('');
  const [senhaMostrada, setSenhaMostrada] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    // `cancelado` é LOCAL a esta execução do efeito (não um ref, que
    // sobreviveria e seria COMPARTILHADO entre execuções) — bug real visto
    // na prática com um ref: StrictMode (dev) roda montar→limpar→montar de
    // novo, e um `useRef` só zera na primeira criação. Um ref resetado "no
    // topo do efeito" parecia corrigir (não travava mais em "carregando"),
    // mas criava um bug PIOR — a 1ª execução (descartada pelo StrictMode) já
    // tinha o fetch em voo; quando ele resolvia mais tarde, lia o MESMO ref
    // que a 2ª execução já tinha zerado de novo, achava que ainda valia, e
    // completava a sequência TAMBÉM — resultado: `enviarLoginPrice` chamado
    // duas vezes, abrindo duas abas do Price. Uma variável local (closure
    // desta chamada específica do efeito) não sofre disso: o cleanup DESTA
    // execução só pode marcar a cópia DESTA execução como cancelada, nunca a
    // de uma execução irmã.
    let cancelado = false;
    const idsAgendados: number[] = [];
    const t = (fn: () => void, ms: number) => { idsAgendados.push(window.setTimeout(fn, ms)); };

    revelarCredenciaisPrice(clientId)
      .then(({ loginPrice, senhaPrice }) => {
        if (cancelado) return;
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
        const tamanhoSenha = Math.max(6, Math.min(senhaPrice.length, MAX_PONTOS_SENHA));
        for (let i = 1; i <= tamanhoSenha; i++) {
          t(() => setSenhaMostrada('•'.repeat(i)), fimCnpj + i * MS_POR_CARACTERE);
        }
        const fimSenha = fimCnpj + tamanhoSenha * MS_POR_CARACTERE + PAUSA_ENTRE_CAMPOS_MS;

        t(() => setFase('clicando'), fimSenha);
        t(() => {
          enviarLoginPrice(loginPrice, senhaPrice, nomeJanela);
          fechar();
        }, fimSenha + PAUSA_NO_BOTAO_MS);
      })
      .catch((err) => {
        if (cancelado) return;
        setFase('erro');
        setErro(err instanceof Error ? err.message : 'Falha ao buscar as credenciais do Price.');
        toastError(err instanceof Error ? err.message : 'Falha ao buscar as credenciais do Price.');
        t(fechar, 1400); // dá tempo de ler o erro antes de sumir sozinho
      });

    return () => {
      cancelado = true;
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
