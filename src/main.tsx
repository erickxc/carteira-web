import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { CarteiraProvider } from './context/CarteiraContext.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CarteiraProvider>
      <App />
    </CarteiraProvider>
  </StrictMode>
);
