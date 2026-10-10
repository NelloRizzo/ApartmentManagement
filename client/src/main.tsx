import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { collegaAttivazione, segnalaNuovaVersione } from './hooks/useAggiornamento';
import './styles/main.scss';

// La versione nuova non si applica da sola: si segnala e la applica chi usa
// l'applicazione (vedi `AvvisoAggiornamento`). Con `autoUpdate` la pagina si
// ricaricava senza avviso, anche mentre si stava scrivendo.
const attivaNuovaVersione = registerSW({
  immediate: true,
  onNeedRefresh() {
    segnalaNuovaVersione();
  },
});
collegaAttivazione(() => attivaNuovaVersione(true));

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
