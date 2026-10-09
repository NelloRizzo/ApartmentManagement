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

/**
 * Blocca le pagine riservate ad amministratori e assistenti.
 *
 * Il condòmino torna alle proprie quote. Il superadmin torna alla piattaforma:
 * non amministra nessuno stabile e il profilo non gli restituisce posizioni,
 * quindi da queste pagine vedrebbe stabili non suoi. Le API restano aperte per
 * lui (è una scelta del backend e i test la coprono): qui si decide solo cosa
 * l'interfaccia gli mette davanti.
 */
export function RichiediAmministratore({ children }: { children: ReactNode }) {
  const { utente } = useAuth();
  if (utente?.role === 'superadmin') return <Navigate to="/p" replace />;
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

/**
 * La rubrica dei residenti dello stabile.
 *
 * Chi amministra deve avere il permesso sugli iscritti; il personale dello stabile
 * passa perché serve quello stabile e non perché ha un permesso, che è la stessa
 * distinzione del guard `requireRubrica` sul server. Serve a non ripetere qui il
 * ragionamento: il perimetro del portiere è una lista di permessi vuota, quindi
 * `RichiediPermesso` da solo gli mostrerebbe "sezione non disponibile" su una
 * pagina che invece può aprire.
 */
export function RichiediRubrica({ children }: { children: ReactNode }) {
  const { utente } = useAuth();
  if (utente?.role === 'portiere') return <>{children}</>;
  return <RichiediPermesso permesso="iscritti:leggere">{children}</RichiediPermesso>;
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
 * `RichiediAmministratore` esclude condòmino e superadmin e lascia passare il
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
