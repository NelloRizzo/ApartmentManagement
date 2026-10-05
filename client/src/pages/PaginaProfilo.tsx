import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api, ApiError } from '@/api/client';
import { notifica } from '@/hooks/useNotifiche';
import { TitoloPagina } from '@/components/TitoloPagina';
import { etichette } from '@/components/Elementi';

export default function PaginaProfilo() {
  const { utente, logout, ricarica } = useAuth();
  const [nome, setNome] = useState(utente?.nome ?? '');
  const [cognome, setCognome] = useState(utente?.cognome ?? '');
  const [telefono, setTelefono] = useState(utente?.telefono ?? '');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  /** Almeno una riga con regime: l'utente è condomino da qualche parte. */
  const haPosizioniDiProprieta = (utente?.condomini ?? []).some((c) => c.regime !== null);

  if (!utente) return null;

  async function salva() {
    setErrore(null);
    setInCorso(true);
    try {
      await api.patch('/auth/me', { nome, cognome, telefono: telefono || undefined });
      await ricarica();
      notifica('Profilo aggiornato');
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Salvataggio non riuscito');
    } finally {
      setInCorso(false);
    }
  }

  return (
    <>
      <TitoloPagina titolo="Profilo" descrizione={etichette.ruolo(utente.role)} />

      <section className="scheda" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="scheda-corpo pila-3">
          <div className="riga">
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="nome">
                Nome
              </label>
              <input id="nome" className="area" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="cognome">
                Cognome
              </label>
              <input id="cognome" className="area" value={cognome} onChange={(e) => setCognome(e.target.value)} />
            </div>
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="tel">
              Telefono
            </label>
            <input
              id="tel"
              className="area"
              type="tel"
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="+39 340 0000000"
            />
          </div>

          <div className="campo">
            <span className="campo-etichetta">Email</span>
            <p className="testo-muto">{utente.email}</p>
          </div>

          {errore && (
            <div className="avviso avviso-pericolo" role="alert">
              {errore}
            </div>
          )}

          <button type="button" className="btn btn-primario" onClick={salva} disabled={inCorso}>
            {inCorso ? 'Salvataggio…' : 'Salva profilo'}
          </button>
        </div>
      </section>

      <section className="scheda" style={{ marginBottom: 'var(--sp-4)' }}>
        <ModuloPassword />
      </section>

<section className="scheda" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="scheda-intestazione">
          {/* Il titolo segue il contenuto: un amministratore che non ha unità di
              proprietà non ha "posizioni", ha condomini che amministra. */}
          <h2>{haPosizioniDiProprieta ? 'Le mie posizioni' : 'Condomìni amministrati'}</h2>
        </div>
        <div className="elenco">
          {utente.condomini.map((c) => (
            <div key={c.condominioId} className="voce">
              <span className="cresci pila-1">
                <strong>
                  {c.nome} ({c.codice})
                </strong>
                <span className="testo-faint">
                  {/* `regime` è `null` per una posizione solo operativa: mostrare
                      "Proprietario" e un elenco unità vuoto raccontava il
                      contrario di quello che è. */}
                  {c.regime
                    ? `${etichette.regime(c.regime)} · unità ${c.unita.join(', ')}${
                        c.quota < 100 ? ` · quota ${c.quota}%` : ''
                      }`
                    : etichette.posizione(c.ruolo)}
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="scheda" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="scheda-intestazione">
          <h2>Sessione</h2>
        </div>
        <div className="scheda-corpo pila-3">
          <p className="testo-muto">
            Accesso effettuato come {etichette.ruolo(utente.role)} su {utente.email}.
          </p>
          <button type="button" className="btn btn-secondario btn-pieno" onClick={() => void logout()}>
            Esci dall’account
          </button>
        </div>
      </section>
    </>
  );
}

/**
 * Cambio della password.
 *
 * Va in un modulo separato dal resto della pagina perché il submit è un'azione
 * diversa dal salvataggio del profilo: cambiano i campi, le regole e l'esito.
 */
function ModuloPassword() {
  const { logout } = useAuth();
  const [attuale, setAttuale] = useState('');
  const [nuova, setNuova] = useState('');
  const [conferma, setConferma] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const completo = attuale !== '' && nuova !== '' && conferma !== '';

  async function cambia() {
    setErrore(null);
    // Le stesse regole del server, controllate prima: mandare una richiesta per
    // un errore che l'utente può vedere subito fa perdere un giro e mostra un
    // errore meno vicino al campo che lo ha causato.
    if (nuova.length < 8) {
      setErrore('La nuova password deve avere almeno 8 caratteri');
      return;
    }
    if (nuova !== conferma) {
      setErrore('La conferma non coincide con la nuova password');
      return;
    }

    setInCorso(true);
    try {
      await api.post('/auth/cambia-password', { attuale, nuova, conferma });
      setAttuale('');
      setNuova('');
      setConferma('');
      notifica('Password aggiornata, accedi di nuovo');
      // Il server ha già cancellato il cookie di refresh e invalidato ogni
      // sessione, quindi `logout` serve solo a chiudere quella locale: senza, il
      // token in memoria resterebbe valido fino alla prossima richiesta.
      await logout();
    } catch (e) {
      setErrore(
        e instanceof ApiError ? (e.primoErroreValidazione ?? e.message) : 'Salvataggio non riuscito',
      );
    } finally {
      setInCorso(false);
    }
  }

  return (
    <>
      <div className="scheda-intestazione">
        <h2>Password</h2>
      </div>
      <div className="scheda-corpo pila-3">
        <p className="testo-muto">
          Cambiandola verranno chiuse tutte le sessioni aperte, compresa questa: dovrai accedere di
          nuovo.
        </p>

        <div className="campo">
          <label className="campo-etichetta" htmlFor="pw-attuale">
            Password attuale
          </label>
          <input
            id="pw-attuale"
            className="area"
            type="password"
            autoComplete="current-password"
            value={attuale}
            onChange={(e) => setAttuale(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        <div className="campo">
          <label className="campo-etichetta" htmlFor="pw-nuova">
            Nuova password
          </label>
          <input
            id="pw-nuova"
            className="area"
            type="password"
            autoComplete="new-password"
            value={nuova}
            onChange={(e) => setNuova(e.target.value)}
            placeholder="Almeno 8 caratteri"
          />
        </div>

        <div className="campo">
          <label className="campo-etichetta" htmlFor="pw-conferma">
            Conferma la nuova password
          </label>
          <input
            id="pw-conferma"
            className="area"
            type="password"
            autoComplete="new-password"
            value={conferma}
            onChange={(e) => setConferma(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {errore && (
          <div className="avviso avviso-pericolo" role="alert">
            {errore}
          </div>
        )}

        <button type="button" className="btn btn-secondario margine-sopra" onClick={cambia} disabled={inCorso || !completo}>
          {inCorso ? 'Cambio in corso…' : 'Cambia password'}
        </button>
      </div>
    </>
  );
}
