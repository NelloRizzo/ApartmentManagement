import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/hooks/useApi';
import { api, ApiError } from '@/api/client';
import { notifica } from '@/hooks/useNotifiche';
import { Caricamento, ErroreCaricamento, PaginaVuota } from '@/components/Feedback';
import { useConferma } from '@/components/Conferma';
import { TitoloPagina } from '@/components/TitoloPagina';
import { data as fmtData } from '@/lib/formattazione';
import { ElencoAmbiti } from '@/pages/PaginaTeam';
import { RinviaConferma } from '@/components/RinviaConferma';
import type { Collaboratore, EsitoConferma } from '@/types/domain';

export default function PaginaAmministratori() {
  const [inModifica, setInModifica] = useState<Collaboratore | 'nuovo' | null>(null);

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
          <button type="button" className="btn btn-primario" onClick={() => setInModifica('nuovo')}>
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
          <button
            key={a.id}
            type="button"
            className="scheda voce-clicabile"
            style={{ marginBottom: 'var(--sp-2)', textAlign: 'left' }}
            onClick={() => setInModifica(a)}
          >
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
              {!a.accessoPieno && a.role === 'admin' && <ElencoAmbiti permessi={a.permessi} />}
            </div>
          </button>
        ))}
      </div>

      {elenco.dati && amministratori.length > 0 && (
        <p className="testo-faint testo-centrato" style={{ marginTop: 'var(--sp-3)' }}>
          {elenco.dati.meta.total} amministratori · tocca una scheda per modificarne i dati
        </p>
      )}

      {inModifica && (
        <ModuloAmministratore
          amministratore={inModifica === 'nuovo' ? null : inModifica}
          onChiuso={() => setInModifica(null)}
          onSalvato={() => {
            setInModifica(null);
            elenco.ricarica();
          }}
        />
      )}
    </>
  );
}

function ModuloAmministratore({
  amministratore,
  onChiuso,
  onSalvato,
}: {
  amministratore: Collaboratore | null;
  onChiuso: () => void;
  onSalvato: () => void;
}) {
  const { utente } = useAuth();
  const [nome, setNome] = useState(amministratore?.nome ?? '');
  const [cognome, setCognome] = useState(amministratore?.cognome ?? '');
  const [email, setEmail] = useState(amministratore?.email ?? '');
  const [telefono, setTelefono] = useState(amministratore?.telefono ?? '');
  const [password, setPassword] = useState('');
  const [attivo, setAttivo] = useState(amministratore?.attivo ?? true);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const { chiedi, elemento: conferma } = useConferma();

  /*
   * Il pulsante di reset non sta sulla card: la card è essa stessa un pulsante
   * che apre questo modulo, e annidarne un secondo produrrebbe HTML non valido e
   * un click ambiguo. Vale la regola dei pulsanti annidati, non una preferenza.
   */
  const sonoIo = amministratore?.id === utente?.id;

  async function salva() {
    setErrore(null);
    setInCorso(true);
    try {
      if (amministratore) {
        await api.patch(`/staff/amministratori/${amministratore.id}`, {
          nome: nome.trim(),
          cognome: cognome.trim(),
          telefono: telefono.trim() || null,
          attivo,
        });
        notifica('Amministratore aggiornato');
      } else {
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
      }
      onSalvato();
    } catch (e) {
      setErrore(
        e instanceof ApiError ? (e.primoErroreValidazione ?? e.message) : 'Salvataggio non riuscito',
      );
    } finally {
      setInCorso(false);
    }
  }

  /**
   * Genera una nuova password e la fa recapitare con l'email di conferma.
   *
   * Il server non restituisce la password e non la scrive da nessuna parte in
   * chiaro: l'unico modo per ottenerla è che arrivi nella casella dell'amministratore.
   * Se l'email non parte il server non cambia nulla, quindi il pulsante si può
   * premere di nuovo senza conseguenze.
   */
  async function reimpostaPassword() {
    if (!amministratore) return;
    const confermato = await chiedi({
      titolo: 'Reimposta la password',
      messaggio: `Verrà generata una nuova password e inviata a ${amministratore.email} con un nuovo link di conferma. Le sessioni già aperte verranno chiuse e l'amministratore dovrà cambiare la password al primo accesso.`,
      conferma: 'Reimposta',
      pericolo: true,
    });
    if (!confermato) return;
    setInCorso(true);
    setErrore(null);
    try {
      await api.post(`/staff/amministratori/${amministratore.id}/reimposta-password`);
      notifica(`Nuova password inviata a ${amministratore.email}`);
      onSalvato();
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Reimpostazione non riuscita');
      setInCorso(false);
    }
  }

  const valido =
    nome.trim() &&
    cognome.trim() &&
    (amministratore ||
      (email.trim() && password.length >= 10 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password)));

  return (
    <div className="velo" role="presentation" onClick={onChiuso}>
      <div
        className="scheda"
        role="dialog"
        aria-modal="true"
        aria-label={amministratore ? 'Modifica amministratore' : 'Nuovo amministratore'}
        style={{ width: 'min(38rem, 96vw)', maxHeight: '92dvh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scheda-intestazione">
          <h2>
            {amministratore
              ? `${amministratore.nome} ${amministratore.cognome}`
              : 'Nuovo amministratore di condominio'}
          </h2>
          <button type="button" className="btn btn-fantasma btn-sm" onClick={onChiuso} aria-label="Chiudi">
            ✕
          </button>
        </div>

        <div className="scheda-corpo pila-3">
          {!amministratore && (
            <div className="avviso avviso-info">
              L&apos;account avrà accesso completo, ma potrà operare solo dopo la stipula di un contratto.
            </div>
          )}

          {amministratore && (
            <div className="avviso avviso-info">
              <div>
                <strong>{amministratore.email}</strong>
                {sonoIo ? ' · sei tu' : ''}
              </div>
              {!amministratore.accessoPieno && (
                <div>
                  Le deleghe di un assistente si modificano dal suo amministratore, nella pagina Team.
                </div>
              )}
            </div>
          )}

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

          {!amministratore && (
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
          )}

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

          {!amministratore && (
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
          )}

          {amministratore && (
            <label className="casella">
              <input
                type="checkbox"
                checked={attivo}
                // Disabilitata e non solo ignorata: senza accesso non si potrebbe
                // nemmeno tornare indietro, quindi il click deve dirlo.
                disabled={sonoIo}
                onChange={(e) => setAttivo(e.target.checked)}
              />
              <span>Accesso consentito</span>
            </label>
          )}

          {amministratore && sonoIo && (
            <span className="campo-aiuto">Non puoi disattivare il tuo stesso account.</span>
          )}

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
              {inCorso ? 'Salvataggio…' : amministratore ? 'Salva' : 'Crea amministratore'}
            </button>
            <button type="button" className="btn btn-fantasma" onClick={onChiuso}>
              Annulla
            </button>
          </div>

          {amministratore && !sonoIo && (
            <div className="avviso avviso-avviso pila-2">
              <div>
                <strong>Password dimenticata.</strong> La nuova password viene generata dal server e
                inviata a {amministratore.email} insieme al link di conferma dell&apos;indirizzo. Chi
                preme il pulsante non la vede, quindi non può essere trasmessa a voce.
              </div>
              <button
                type="button"
                className="btn btn-pericolo"
                onClick={reimpostaPassword}
                disabled={inCorso}
              >
                Reimposta password
              </button>
            </div>
          )}

          {amministratore && !amministratore.emailConfermato && (
            <div className="avviso avviso-avviso pila-2">
              <div>
                <strong>Indirizzo email non confermato.</strong> Se l&apos;indirizzo non è suo, nessuno
                potrà accorgersene: conviene reinviare la conferma o correggerlo.
              </div>
              <RinviaConferma
                url={`/staff/amministratori/${amministratore.id}/reinvia-conferma`}
                destinatario={amministratore.email}
                alTermine={onSalvato}
              />
            </div>
          )}
        </div>
      </div>
      {conferma}
    </div>
  );
}