import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '@/api/client';
import { Caricamento, PaginaVuota } from '@/components/Feedback';
import { TitoloPagina } from '@/components/TitoloPagina';

/**
 * Conferma dell'indirizzo email, raggiunta dal link nell'email.
 *
 * Il token non viene spedito in automatico al solo caricamento della pagina: i
 * filtri anti-spam dei provider aprono i link in anteprima e consumerebbero il
 * token senza che nessuno l'abbia letto. Serve una POST esplicita, e per questo
 * l'invio parte da qui e non da un'immagine o un link.
 */
export default function PaginaConfermaEmail() {
  const [parametri] = useSearchParams();
  const token = parametri.get('token') ?? '';

  const [esito, setEsito] = useState<'in_corso' | 'riuscito' | 'fallito'>('in_corso');
  const [messaggio, setMessaggio] = useState<string>('');
  const [email, setEmail] = useState<string | null>(null);
  const giaInviato = useRef(false);

  useEffect(() => {
    if (!token || giaInviato.current) return;
    giaInviato.current = true;

    api
      .post<{ email: string; emailConfermato: boolean }>('/auth/conferma-email', { token }, { senzaRefresh: true })
      .then((risposta) => {
        setEmail(risposta.data.email);
        setEsito('riuscito');
      })
      .catch((e: unknown) => {
        setMessaggio(
          e instanceof ApiError
            ? (e.primoErroreValidazione ?? e.message)
            : 'Non è stato possibile completare la conferma',
        );
        setEsito('fallito');
      });
  }, [token]);

  if (esito === 'in_corso') {
    return (
      <div className="scheda" style={{ maxWidth: '34rem', margin: '0 auto' }}>
        <div className="scheda-corpo">
          <Caricamento testo="Conferma in corso…" />
        </div>
      </div>
    );
  }

  if (esito === 'riuscito') {
    return (
      <div style={{ maxWidth: '34rem', margin: '0 auto' }}>
        <TitoloPagina
          titolo="Indirizzo confermato"
          descrizione="Ora l'indirizzo email è verificato: puoi accedere e l'avviso sparirà."
        />
        <div className="avviso avviso-successo" role="status">
          <div>
            Confermato <strong>{email}</strong>. Puoi già accedere con le credenziali che ti sono state
            comunicate.
          </div>
        </div>
        <div className="riga" style={{ marginTop: 'var(--sp-4)' }}>
          <a className="btn btn-primario" href="/accedi">
            Vai all'accesso
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '34rem', margin: '0 auto' }}>
      <TitoloPagina titolo="Conferma non riuscita" />
      <PaginaVuota
        titolo="Il link non è più valido"
        descrizione={messaggio || 'Il token di conferma non è riconosciuto.'}
        azione={
          <a className="btn btn-primario" href="/accedi">
            Accediti e richiedi un nuovo invio
          </a>
        }
      />
    </div>
  );
}
