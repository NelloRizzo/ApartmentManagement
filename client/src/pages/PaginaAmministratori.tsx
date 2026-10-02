import { useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { api, ApiError } from '@/api/client';
import { notifica } from '@/hooks/useNotifiche';
import { Caricamento, ErroreCaricamento, PaginaVuota } from '@/components/Feedback';
import { TitoloPagina } from '@/components/TitoloPagina';
import { data as fmtData } from '@/lib/formattazione';
import { ElencoAmbiti } from '@/pages/PaginaTeam';
import { RinviaConferma } from '@/components/RinviaConferma';
import type { Collaboratore, EsitoConferma } from '@/types/domain';

export default function PaginaAmministratori() {
  const [inCreazione, setInCreazione] = useState(false);

  const elenco = useApi<{ data: Collaboratore[]; meta: { total: number } }>(
    async (segnale) => {
      const risposta = await api.get<Collaboratore[]>(
        '/staff/amministratori',
        { page: 1, limit: 100, sort: 'cognome' },
        { signal: segnale },
      );
      return { data: risposta.data, meta: { total: risposta.meta?.total ?? risposta.data.length } };
    },
    [],
  );

  const amministratori = elenco.dati?.data ?? [];

  return (
    <>
      <TitoloPagina
        titolo="Amministratori"
        descrizione="Gli amministratori di condominio che operano sulla piattaforma."
        azioni={
          <button type="button" className="btn btn-primario" onClick={() => setInCreazione(true)}>
            + Nuovo amministratore
          </button>
        }
      />

      {elenco.inCorso && <Caricamento />}
      {elenco.errore && <ErroreCaricamento messaggio={elenco.errore} onRiprova={elenco.ricarica} />}

      {elenco.dati && amministratori.length === 0 && (
        <PaginaVuota titolo="Nessun amministratore" />
      )}

      <div className="elenco">
        {amministratori.map((a) => (
          <div key={a.id} className="scheda" style={{ marginBottom: 'var(--sp-2)' }}>
            <div className="scheda-corpo pila-2">
              <div className="riga riga-tra">
                <strong>
                  {a.nome} {a.cognome}
                </strong>
                <div className="riga">
                  {!a.attivo && <span className="etichetta etichetta-pericolo">Disattivato</span>}
                  {!a.emailConfermato && (
                    <span className="etichetta etichetta-avviso">Email non confermata</span>
                  )}
                  {a.role === 'superadmin' ? (
                    <span className="etichetta etichetta-accento">Piattaforma</span>
                  ) : a.accessoPieno ? (
                    <span className="etichetta etichetta-info">Accesso completo</span>
                  ) : (
                    <span className="etichetta etichetta-avviso">Delegato</span>
                  )}
                </div>
              </div>
              <div className="testo-faint testo-faint-blocco">
                {a.email}
                {a.ultimoAccesso ? ` · ultimo accesso ${fmtData(a.ultimoAccesso)}` : ' · mai collegato'}
              </div>
              {!a.emailConfermato && a.role === 'admin' && (
                <RinviaConferma
                  url={`/staff/amministratori/${a.id}/reinvia-conferma`}
                  destinatario={a.email}
                  alTermine={elenco.ricarica}
                />
              )}
              {!a.accessoPieno && a.role === 'admin' && <ElencoAmbiti permessi={a.permessi} />}
            </div>
          </div>
        ))}
      </div>

      {inCreazione && (
        <ModuloAmministratore
          onChiuso={() => setInCreazione(false)}
          onCreato={() => {
            setInCreazione(false);
            elenco.ricarica();
          }}
        />
      )}
    </>
  );
}

function ModuloAmministratore({ onChiuso, onCreato }: { onChiuso: () => void; onCreato: () => void }) {
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function salva() {
    setErrore(null);
    setInCorso(true);
    try {
      const risposta = await api.post<Collaboratore & { conferma?: EsitoConferma }>('/staff/amministratori', {
        nome: nome.trim(),
        cognome: cognome.trim(),
        email: email.trim(),
        telefono: telefono.trim() || undefined,
        password,
      });
      // L'utente esiste comunque: se l'email non è partita va detto, altrimenti
      // l'amministratore resterebbe in attesa di una conferma che non arriverà.
      if (risposta.data.conferma?.inviata) {
        notifica('Amministratore creato, email di conferma inviata. Ora stipula un contratto per abilitarlo.');
      } else {
        notifica('Amministratore creato, ma l’email di conferma non è partita: riprova dall’elenco.', 'errore');
      }
      onCreato();
    } catch (e) {
      setErrore(
        e instanceof ApiError ? (e.primoErroreValidazione ?? e.message) : 'Creazione non riuscita',
      );
    } finally {
      setInCorso(false);
    }
  }

  const valido =
    nome.trim() && cognome.trim() && email.trim() && password.length >= 10 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);

  return (
    <div className="velo" role="presentation" onClick={onChiuso}>
      <div
        className="scheda"
        role="dialog"
        aria-modal="true"
        aria-label="Nuovo amministratore"
        style={{ width: 'min(30rem, 94vw)', maxHeight: '92dvh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scheda-intestazione">
          <h2>Nuovo amministratore di condominio</h2>
          <button type="button" className="btn btn-fantasma btn-sm" onClick={onChiuso} aria-label="Chiudi">
            ✕
          </button>
        </div>

        <div className="scheda-corpo pila-3">
          <div className="avviso avviso-info">
            L’account avrà accesso completo, ma potrà operare solo dopo la stipula di un contratto.
          </div>

          <div className="riga">
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="m-nome">
                Nome
              </label>
              <input id="m-nome" className="area" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="m-cognome">
                Cognome
              </label>
              <input
                id="m-cognome"
                className="area"
                value={cognome}
                onChange={(e) => setCognome(e.target.value)}
              />
            </div>
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="m-email">
              Email
            </label>
            <input
              id="m-email"
              className="area"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="m-tel">
              Telefono
            </label>
            <input
              id="m-tel"
              className="area"
              type="tel"
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="m-pass">
              Password iniziale
            </label>
            <input
              id="m-pass"
              className="area"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="campo-aiuto">
              Almeno 10 caratteri, con una lettera maiuscola, una minuscola e una cifra.
            </span>
          </div>

          {errore && (
            <div className="avviso avviso-pericolo" role="alert">
              {errore}
            </div>
          )}

          <div className="riga">
            <button
              type="button"
              className="btn btn-primario cresci"
              onClick={salva}
              disabled={inCorso || !valido}
            >
              {inCorso ? 'Creazione…' : 'Crea amministratore'}
            </button>
            <button type="button" className="btn btn-fantasma" onClick={onChiuso}>
              Annulla
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}