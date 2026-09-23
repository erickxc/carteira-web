import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { iniciarEnderecoLocal } from './enderecoLocal/iniciar';
import './index.css';
import App from './App.tsx';
import { CarteiraProvider } from './context/CarteiraContext.tsx';

// Registra o service worker só em produção (build servido por HTTPS/localhost
// — "contexto seguro") — em dev pelo Vite isso só criaria confusão (SW de uma
// build antiga interceptando o servidor de dev). Existe só pra permitir
// "Instalar app" no navegador (PWA) — ver public/sw.js, não cacheia nada.
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Falha ao registrar o service worker (PWA):', err);
    });
  });
}

iniciarEnderecoLocal().then((resultado) => {
  if (resultado === 'redirecionando') return;
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {/* "user": segue o prefers-reduced-motion do sistema — some deslocamento/escala, fade continua. */}
      <MotionConfig reducedMotion="user">
        <CarteiraProvider>
          <App />
        </CarteiraProvider>
      </MotionConfig>
    </StrictMode>
  );
});
