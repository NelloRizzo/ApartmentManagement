import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/hooks/useApi';
import { api, ApiError } from '@/api/client';
import { notifica } from '@/hooks/useNotifiche';
import { Caricamento, ErroreCaricamento, PaginaVuota } from '@/components/Feedback';
import { AllegatiElenco, AllegatiSelettore, allegatiInFormData, allegatiVuoti } from '@/components/Allegati';
import { EtichettaStato, etichette } from '@/components/Elementi';
import { TitoloPagina, RichiediCondominio } from '@/components/TitoloPagina';
import { dataRelativa, dataOra } from '@/lib/formattazione';
import type { ApiEnvelope, Comunicazione, TipoComunicazione } from '@/types/domain';

type Bandiera = 'posta' | 'inviate' | 'bozze' | 'tutte';

const TIPI_CONDOMINO: TipoComunicazione[] = ['segnalazione', 'richiesta', 'reclamo'];
const TIPI_AMMINISTRATORE: TipoComunicazione[] = ['avviso', 'convocazione'];

export default function PaginaComunicazioni() {
  const { utente, condominioId, nonLette, aggiornaNonLette } = useAuth();
  const [bandiera, setBandiera] = useState<Bandiera>('posta');
  const [composizioneAperta, setComposizioneAperta] = useState(false);
  const [selezionata, setSelezionata] = useState<Comunicazione | null>(null);

  const amministratore = utente?.role !== 'condomino';

  const elenco = useApi<ApiEnvelope<Comunicazione[]>>(
    (segnale) =>
      api.get<Comunicazione[]>(
        `/condomini/${condominioId}/comunicazioni`,
        { page: 1, limit: 30, bandiera },
        { signal: segnale },
      ),
    [condominioId, bandiera],
    { attivo: Boolean(condominioId) },
  );

  if (!condominioId) return null;

  const messaggi = elenco.dati?.data ?? [];

  return (
    <RichiediCondominio>
      <TitoloPagina
        titolo="Comunicazioni"
        descrizione={amministratore ? 'Avvisi ai condòmini e richieste ricevute.' : 'Scrivi all’amministratore del condominio.'}
        azioni={
          <button
            type="button"
            className="btn btn-primario"
            onClick={() => setComposizioneAperta((v) => !v)}
          >
            {composizioneAperta ? 'Annulla' : amministratore ? '+ Nuovo avviso' : '+ Nuovo messaggio'}
          </button>
        }
      />

      {composizioneAperta && (
        <ModuloComposizione
          tipi={amministratore ? TIPI_AMMINISTRATORE : TIPI_CONDOMINO}
          onInviato={() => {
            setComposizioneAperta(false);
            elenco.ricarica();
            void aggiornaNonLette();
          }}
          onAnnulla={() => setComposizioneAperta(false)}
        />
      )}

      <div className="riga" style={{ marginBottom: 'var(--sp-3)' }}>
        {(
          [
            ['posta', 'Posta in arrivo'],
            ['inviate', 'Inviate'],
            ['bozze', 'Bozze'],
            ['tutte', 'Tutte'],
          ] as [Bandiera, string][]
        )
          .filter(([b]) => b !== 'inviate' || amministratore)
          .filter(([b]) => b !== 'bozze' || amministratore)
          .map(([valore, testo]) => (
            <button
              key={valore}
              type="button"
              className={`btn btn-sm ${bandiera === valore ? 'btn-primario' : 'btn-secondario'}`}
              onClick={() => setBandiera(valore)}
            >
              {testo}
              {valore === 'posta' && nonLette > 0 ? ` (${nonLette})` : ''}
            </button>
          ))}
      </div>

      {elenco.inCorso && <Caricamento />}
      {elenco.errore && <ErroreCaricamento messaggio={elenco.errore} onRiprova={elenco.ricarica} />}

      {elenco.dati && messaggi.length === 0 && (
        <PaginaVuota
          titolo="Nessuna comunicazione"
          descrizione={
            bandiera === 'posta'
              ? 'Non ci sono messaggi non letti.'
              : 'Non hai ancora scritto alcuna comunicazione.'
          }
        />
      )}

      <div className="elenco">
        {messaggi.map((m) => (
          <button
            key={m._id}
            type="button"
            className="scheda voce-clicabile"
            style={{ marginBottom: 'var(--sp-2)', textAlign: 'left' }}
            onClick={() => {
              setSelezionata(m);
              if (m.stato === 'inviata' && m.destinatario) {
                void api.post(`/condomini/${condominioId}/comunicazioni/${m._id}/letti`).then(() => {
                  void aggiornaNonLette();
                  elenco.ricarica();
                });
              }
            }}
          >
            <div className="scheda-corpo pila-1">
              <div className="riga riga-tra">
                <strong className="cresci">{m.oggetto}</strong>
                <EtichettaStato stato={m.stato} />
              </div>
              <div className="testo-faint">
                {etichette.tipoComunicazione(m.tipo)} ·{' '}
                {amministratore && bandiera === 'inviate'
                  ? `a ${m.destinatario ? `${m.destinatario.nome} ${m.destinatario.cognome}` : 'tutti i condòmini'}`
                  : `da ${m.mittente.nome} ${m.mittente.cognome}`}{' '}
                · {dataRelativa(m.createdAt)}
              </div>
              {m.corpo && <p className="testo-faint">{m.corpo.slice(0, 140)}{m.corpo.length > 140 ? '…' : ''}</p>}
              {m.allegati.length > 0 && (
                <span className="testo-faint">
                  {m.allegati.length === 1 ? '1 allegato' : `${m.allegati.length} allegati`}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {selezionata && (
        <DettaglioComunicazione
          comunicazione={selezionata}
          onChiudi={() => setSelezionata(null)}
          onRisposto={() => {
            setSelezionata(null);
            elenco.ricarica();
          }}
        />
      )}
    </RichiediCondominio>
  );
}

function ModuloComposizione({
  tipi,
  onInviato,
  onAnnulla,
}: {
  tipi: TipoComunicazione[];
  onInviato: () => void;
  onAnnulla: () => void;
}) {
  const { condominioId, utente } = useAuth();
  const [tipo, setTipo] = useState<TipoComunicazione>(tipi[0] ?? 'segnalazione');
  const [oggetto, setOggetto] = useState('');
  const [corpo, setCorpo] = useState('');
  const [destinatari, setDestinatari] = useState<string[]>([]);
  const [bozza, setBozza] = useState(false);
  const [allegati, setAllegati] = useState(allegatiVuoti);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const amministratore = utente?.role !== 'condomino';

  // La lista delle unità serve solo all'amministratore per scegliere i
  // destinatari: il condòmino scrive all'amministratore di default e non deve
  // poter sfogliare le unità dello stabile.
  const unita = useApi<{ data: { _id: string; codice: string }[] }>(
    (segnale) =>
      api
        .get<{ _id: string; codice: string }[]>(`/condomini/${condominioId}/unita`, { limit: 100 }, { signal: segnale })
        .then((r) => ({ data: r.data })),
    [condominioId],
    { attivo: Boolean(condominioId) && amministratore },
  );

  async function invia() {
    setErrore(null);
    setInCorso(true);
    try {
      const daInviare = {
        tipo,
        oggetto: oggetto.trim(),
        corpo,
        unita: destinatari,
        salvaComeBozza: bozza,
      };

      // Con i file la richiesta diventa `multipart`: `api.post` con `FormData`
      // sarebbe rifiutata dal server, che su questa rotta si aspetta JSON.
      if (allegati.file.length > 0) {
        const dati = new FormData();
        dati.set('tipo', daInviare.tipo);
        dati.set('oggetto', daInviare.oggetto);
        dati.set('corpo', daInviare.corpo);
        dati.set('salvaComeBozza', String(daInviare.salvaComeBozza));
        for (const u of daInviare.unita) dati.append('unita', u);
        await api.upload(`/condomini/${condominioId}/comunicazioni`, allegatiInFormData(dati, allegati));
      } else {
        await api.post(`/condomini/${condominioId}/comunicazioni`, daInviare);
      }

      notifica(bozza ? 'Bozza salvata' : 'Comunicazione inviata');
      onInviato();
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Invio non riuscito');
    } finally {
      setInCorso(false);
    }
  }

  return (
    <section className="scheda" style={{ marginBottom: 'var(--sp-4)' }}>
      <div className="scheda-intestazione">
        <h2>{amministratore ? 'Nuovo avviso' : 'Nuovo messaggio'}</h2>
      </div>
      <div className="scheda-corpo pila-3">
        <div className="campo">
          <label className="campo-etichetta" htmlFor="tipo-comm">
            Tipo
          </label>
          <select id="tipo-comm" className="area" value={tipo} onChange={(e) => setTipo(e.target.value as TipoComunicazione)}>
            {tipi.map((t) => (
              <option key={t} value={t}>
                {etichette.tipoComunicazione(t)}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label className="campo-etichetta" htmlFor="oggetto-comm">
            Oggetto
          </label>
          <input
            id="oggetto-comm"
            className="area"
            value={oggetto}
            onChange={(e) => setOggetto(e.target.value)}
            placeholder="Per cosa scrivi?"
            maxLength={300}
          />
        </div>

        <div className="campo">
          <label className="campo-etichetta" htmlFor="corpo-comm">
            Messaggio
          </label>
<textarea
            id="corpo-comm"
            className="area area-testo"
            value={corpo}
            onChange={(e) => setCorpo(e.target.value)}
            placeholder="Scrivi qui il tuo messaggio."
          />
        </div>

        <AllegatiSelettore
          valore={allegati}
          onCambia={setAllegati}
          oggettoPredefinito={oggetto}
        />


        {amministratore && (unita.dati?.data.length ?? 0) > 0 && (
          <div className="campo">
            <span className="campo-etichetta">Destinatari per unità immobiliare</span>
            <span className="campo-aiuto">Lascia vuoto per inviare a tutti i condòmini.</span>
            <div style={{ maxHeight: '10rem', overflowY: 'auto' }}>
              {unita.dati?.data.map((u) => (
                <label key={u._id} className="casella">
                  <input
                    type="checkbox"
                    checked={destinatari.includes(u._id)}
                    onChange={(e) =>
                      setDestinatari((precedenti) =>
                        e.target.checked ? [...precedenti, u._id] : precedenti.filter((x) => x !== u._id),
                      )
                    }
                  />
                  <span>Unità {u.codice}</span>
                </label>
              ))}
            </div>
          </div>
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
            onClick={invia}
            disabled={inCorso || !oggetto.trim()}
          >
            {inCorso ? 'Invio…' : bozza ? 'Salva bozza' : 'Invia'}
          </button>
          {amministratore && (
            <button type="button" className="btn btn-secondario" onClick={() => setBozza((v) => !v)}>
              {bozza ? 'Invia subito' : 'Salva come bozza'}
            </button>
          )}
          <button type="button" className="btn btn-fantasma" onClick={onAnnulla}>
            Annulla
          </button>
        </div>
      </div>
    </section>
  );
}

function DettaglioComunicazione({
  comunicazione,
  onChiudi,
  onRisposto,
}: {
  comunicazione: Comunicazione;
  onChiudi: () => void;
  onRisposto: () => void;
}) {
  const { condominioId, utente } = useAuth();
  const [risposta, setRisposta] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const thread = useApi<Comunicazione>(
    (segnale) =>
      api
        .get<Comunicazione>(`/condomini/${condominioId}/comunicazioni/${comunicazione._id}`, undefined, {
          signal: segnale,
        })
        .then((r) => r.data),
    [condominioId, comunicazione._id],
  );

  const possoRispondere = utente && String(comunicazione.mittente._id) !== utente.id;

  async function inviaRisposta() {
    setErrore(null);
    setInCorso(true);
    try {
      await api.post(`/condomini/${condominioId}/comunicazioni/${comunicazione._id}/risposte`, { corpo: risposta });
      notifica('Risposta inviata');
      onRisposto();
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Invio non riuscito');
    } finally {
      setInCorso(false);
    }
  }

  const messaggi = thread.dati?.thread ?? [comunicazione];

  return (
    <div
      className="velo"
      role="dialog"
      aria-modal="true"
      aria-label={comunicazione.oggetto}
      onClick={onChiudi}
    >
      <div
        className="scheda"
        style={{ width: '100%', maxWidth: '40rem', maxHeight: '92dvh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scheda-intestazione">
          <h2 className="cresci">{comunicazione.oggetto}</h2>
          <button type="button" className="btn btn-fantasma btn-sm" onClick={onChiudi} aria-label="Chiudi">
            ✕
          </button>
        </div>

        <div className="scheda-corpo pila-3">
          {thread.inCorso && <Caricamento />}
          {thread.errore && <ErroreCaricamento messaggio={thread.errore} onRiprova={thread.ricarica} />}

          {messaggi.map((m) => (
            <div key={m._id} className="pila-2">
              <div className="riga riga-tra">
                <span className="testo-faint">
                  <strong>
                    {m.mittente.nome} {m.mittente.cognome}
                  </strong>{' '}
                  · {dataOra(m.createdAt)}
                </span>
                <EtichettaStato stato={m.stato} />
              </div>
              <p style={{ whiteSpace: 'pre-wrap' }}>{m.corpo}</p>
              <AllegatiElenco allegati={m.allegati} />
            </div>
          ))}

          {possoRispondere && (
            <>
              <div className="campo">
                <label className="campo-etichetta" htmlFor="risposta">
                  Rispondi
                </label>
                <textarea
                  id="risposta"
                  className="area area-testo"
                  value={risposta}
                  onChange={(e) => setRisposta(e.target.value)}
                  placeholder="Scrivi la tua risposta…"
                />
              </div>
              {errore && (
                <div className="avviso avviso-pericolo" role="alert">
                  {errore}
                </div>
              )}
              <button
                type="button"
                className="btn btn-primario"
                onClick={inviaRisposta}
                disabled={inCorso || !risposta.trim()}
              >
                {inCorso ? 'Invio…' : 'Invia risposta'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
