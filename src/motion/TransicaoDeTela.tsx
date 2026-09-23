import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion, type Variants } from 'motion/react';
import { useLocation } from 'react-router-dom';
import { curva } from './tokens';
import { tipoTransicao, type TipoTransicao } from './tipoTransicao';

const DESLOCAMENTO_LATERAL = 12;
// Troca entre páginas da sidebar: só um sopro de subida (achada "radical" com 8px).
const SUBIDA_ENTRE_PAGINAS = 3;
// Ajustado a olho com o usuário: ~10% mais lenta que o token `medio` (250ms).
const ENTRADA_S = 0.275;
const SAIDA_S = 0.132;

// A direção vai via `custom` do AnimatePresence (não por prop): a tela que
// está SAINDO já foi renderizada com a direção antiga e precisa da nova.
const variantes: Variants = {
  inicial: (tipo: TipoTransicao) => ({
    opacity: 0,
    x: tipo === 'entrar' ? DESLOCAMENTO_LATERAL : tipo === 'voltar' ? -DESLOCAMENTO_LATERAL : 0,
    y: tipo === 'lateral' ? SUBIDA_ENTRE_PAGINAS : 0,
  }),
  visivel: {
    opacity: 1,
    x: 0,
    y: 0,
    transition: { duration: ENTRADA_S, ease: curva.saida },
  },
  saida: (tipo: TipoTransicao) => ({
    opacity: 0,
    x: tipo === 'entrar' ? -DESLOCAMENTO_LATERAL / 2 : tipo === 'voltar' ? DESLOCAMENTO_LATERAL / 2 : 0,
    y: 0,
    transition: { duration: SAIDA_S, ease: 'easeIn' },
  }),
};

export function TransicaoDeTela({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [navegacao, setNavegacao] = useState<{ rota: string; tipo: TipoTransicao }>({ rota: pathname, tipo: 'lateral' });

  // Atualizado durante o render (padrão do React pra "valor da renderização
  // anterior"), não em efeito: em efeito, a direção só valeria um render depois.
  if (navegacao.rota !== pathname) {
    setNavegacao({ rota: pathname, tipo: tipoTransicao(navegacao.rota, pathname) });
  }

  return (
    <AnimatePresence mode="wait" custom={navegacao.tipo} onExitComplete={() => window.scrollTo(0, 0)}>
      <motion.div
        key={pathname}
        custom={navegacao.tipo}
        variants={variantes}
        initial="inicial"
        animate="visivel"
        exit="saida"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
