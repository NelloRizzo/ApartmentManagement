import { useState } from 'react';
import { api, ApiError } from '@/api/client';
import { notifica } from '@/hooks/useNotifiche';

/**
 * Pulsante per reinviare la conferma dell'indirizzo a un utente appena creato.
 *
 * Serve perché la creazione non va in fuga se l'email non parte: l'utente
 * esiste comunque, ma senza il link nessuno potrà confermare l'indirizzo, e chi
 * lo ha creato deve poter riprovare.
 */
export function RinviaConferma({
  url,
  destinatario,
  alTermine,
}: {
  url: string;
  destinatario: string;
  alTermine: () => void;
}) {
  const [inCorso, setInCorso] = useState(false);

  async function reinvia() {
    setInCorso(true);
    try {
      await api.post(url);
      notifica(`Conferma reinviata a ${destinatario}`);
      alTermine();
    } catch (e) {
      notifica(
        e instanceof ApiError ? e.message : 'Invio non riuscito: riprova tra qualche minuto',
        'errore',
      );
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="riga">
      <span className="testo-faint testo-faint-blocco">
        Nessuna email di conferma ricevuta. L&apos;indirizzo è sbagliato, o l&apos;invio non è ancora
        riuscito.
      </span>
      <button type="button" className="btn btn-secondario btn-sm" onClick={reinvia} disabled={inCorso}>
        {inCorso ? 'Invio…' : 'Reinvia conferma'}
      </button>
    </div>
  );
}
