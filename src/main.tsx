import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CarteiraProvider>
      <App />
    </CarteiraProvider>
  </StrictMode>
);
