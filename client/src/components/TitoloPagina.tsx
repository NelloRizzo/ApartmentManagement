import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PaginaVuota } from '@/components/Feedback';

/** Intestazione di pagina con titolo, descrizione e azioni. */
export function TitoloPagina({
  titolo,
  descrizione,
  azioni,
}: {
  titolo: string;
  descrizione?: string;
  azioni?: ReactNode;
}) {
  return (
    <div className="titolo-pagina">
      <div className="pila-1">
        <h1>{titolo}</h1>
        {descrizione && <p className="testo-faint">{descrizione}</p>}
      </div>
      {azioni && <div className="riga">{azioni}</div>}
    </div>
  );
}

/**
 * Wrapper per le pagine che richiedono un condominio selezionato.
 * Se l'utente non è ancora collegato a nessun condominio, spiega la situazione.
 */
export function RichiediCondominio({ children }: { children: ReactNode }) {
  const { condominioId, utente } = useAuth();

  if (condominioId) return <>{children}</>;

  // Il superadmin non ha stabili e non ne deve creare: proporgli "Crea il tuo
  // primo condominio" lo manderebbe in una pagina che poi gli viene negata.
  if (utente?.role === 'superadmin') {
    return (
      <PaginaVuota
        titolo="Nessun condominio"
        descrizione="Non amministri nessun stabile: la tua sezione è la Piattaforma, con contratti e amministratori."
        azione={
          <Link className="btn btn-primario" to="/p">
            Vai alla piattaforma
          </Link>
        }
      />
    );
  }

  return (
    <PaginaVuota
      titolo="Nessun condominio selezionato"
      descrizione={
        utente?.role === 'condomino'
          ? 'Non risulti ancora collegato a nessun condominio. Contatta l’amministratore per richiedere l’accesso alla tua unità immobiliare.'
          : 'Crea il tuo primo condominio per iniziare a gestire unità, quote e assemblee.'
      }
      azione={
        utente?.role !== 'condomino' ? (
          <Link className="btn btn-primario" to="/c/condomini">
            Vai ai miei condomini
          </Link>
        ) : undefined
      }
    />
  );
}
