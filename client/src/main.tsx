import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import './styles/main.scss';

// Aggiorna il service worker senza richiedere conferma all'utente.
registerSW({ immediate: true });

const radice = document.getElementById('root');
if (!radice) throw new Error('Elemento #root non trovato in index.html');

createRoot(radice).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
