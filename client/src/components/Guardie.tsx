import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PaginaVuota } from '@/components/Feedback';
import type { Permesso, UserRole } from '@/types/domain';

export function RichiediAutenticazione({ children }: { children: ReactNode }) {
  const { autenticato, inCaricamento } = useAuth();

  if (inCaricamento) {
    return (
      <div className="splash">
        <div className="stato-caricamento" role="status">
          <div className="girac" aria-hidden="true" />
          <span>Ripristino sessione…</span>
        </div>
      </div>
    );
  }

  if (!autenticato) return <Navigate to="/accedi" replace />;
  return <>{children}</>;
}

/** Blocca le pagine riservate ad amministratori e assistenti. */
export function RichiediAmministratore({ children }: { children: ReactNode }) {
  const { utente } = useAuth();
  if (utente && utente.role === 'condomino') {
    return <Navigate to="/c/versamenti" replace />;
  }
  return <>{children}</>;
}

/**
 * Blocca le pagine il cui permesso non è stato delegato.
 *
 * Non reindirizza: spiega il motivo, così un assistente capisce che la sezione
 * è nascosta per una scelta dell'amministratore e non per un errore.
 */
export function RichiediPermesso({ permesso, children }: { permesso: Permesso; children: ReactNode }) {
  const { puo } = useAuth();
  if (!puo(permesso)) {
    return (
      <PaginaVuota
        titolo="Sezione non disponibile"
        descrizione="L’amministratore non ti ha delegato questo ambito. Chiedigli di abilitare gli ambiti necessari."
      />
    );
  }
  return <>{children}</>;
}

/** Area riservata all'amministratore di piattaforma. */
export function RichiediSuperadmin({ children }: { children: ReactNode }) {
  const { isSuperadmin, inCaricamento, autenticato } = useAuth();
  if (inCaricamento || !autenticato) return null;
  if (!isSuperadmin) return <Navigate to="/c/panorama" replace />;
  return <>{children}</>;
}

/**
 * Riserva una sezione ai ruoli indicati.
 *
 * `RichiediAmministratore` esclude solo il condòmino e lascia passare il
 * portiere: va bene per le pagine di gestione, dove al portiere può servire
 * leggere, ma non per quelle che riguardano il contratto di fornitura, che è di
 * chi amministra davvero.
 */
export function RichiediRuoli({ ruoli, children }: { ruoli: UserRole[]; children: ReactNode }) {
  const { utente, inCaricamento } = useAuth();
  if (inCaricamento) return null;
  if (!utente || !ruoli.includes(utente.role)) {
    return <Navigate to="/c/panorama" replace />;
  }
  return <>{children}</>;
}
