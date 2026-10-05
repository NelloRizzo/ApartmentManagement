import { useRef, useState } from 'react';
import { api, ApiError } from '@/api/client';
import { notifica } from '@/hooks/useNotifiche';
import { numero } from '@/lib/formattazione';
import type { Allegato } from '@/types/domain';

/**
 * Limiti replicati dal server (`middleware/upload.ts`).
 *
 * Vengono controllati qui perché un rifiuto per superamento arriva come errore
 * generico dopo che il file è già salito in rete: dirlo subito è la differenza
 * fra "non è stato possibile caricare" e "non è successo niente".
 */
export const LIMITE_ALLEGATI = 5;
export const LIMITE_BYTE = 10 * 1024 * 1024;

/** Tipi accettati dal server: la lista qui deve stare al passo di quella. */
const TIPI_ACCEPT = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
].join(',');

/** I metadati che viaggiano con i file, più i file scelti. */
export interface AllegatiInBozza {
  file: File[];
  oggetto: string;
  descrizione: string;
  fonte: string;
  riferimento: string;
}

export function allegatiVuoti(): AllegatiInBozza {
  return { file: [], oggetto: '', descrizione: '', fonte: '', riferimento: '' };
}

/**
 * Aggiunge i file e i loro metadati a un `FormData`.
 *
 * I campi hanno il prefisso `allegati` perché il corpo del documento può già
 * avere un `oggetto` proprio: senza il prefisso, il file prenderebbe per oggetto
 * il titolo della comunicazione o del verbale.
 *
 * Va usato solo se ci sono file: `api.post` con `FormData` anche vuoto cambia la
 * richiesta da JSON a multipart, e il server risponderebbe che il corpo è
 * multipart su una rotta che si aspetta JSON.
 */
export function allegatiInFormData(dati: FormData, bozza: AllegatiInBozza): FormData {
  if (bozza.file.length === 0) return dati;
  for (const f of bozza.file) dati.append('allegati', f);
  if (bozza.oggetto.trim()) dati.set('allegatiOggetto', bozza.oggetto.trim());
  if (bozza.descrizione.trim()) dati.set('allegatiDescrizione', bozza.descrizione.trim());
  if (bozza.fonte.trim()) dati.set('allegatiFonte', bozza.fonte.trim());
  if (bozza.riferimento.trim()) dati.set('allegatiRiferimento', bozza.riferimento.trim());
  return dati;
}

/** Elenco degli allegati già salvati, con scarica ed eliminazione. */
export function AllegatiElenco({
  allegati,
  onRimuovi,
  puoRimuovere = false,
}: {
  allegati: Allegato[];
  onRimuovi?: (id: string) => void;
  puoRimuovere?: boolean;
}) {
  if (!allegati || allegati.length === 0) return null;

  return (
    <div className="campo">
      <span className="campo-etichetta">Allegati</span>
      <div className="elenco">
        {allegati.map((a) => (
          <div key={a.id} className="voce">
            <span className="cresci pila-1">
              <strong>{a.oggetto}</strong>
              <span className="testo-faint">
                {a.nome} · {numero(Math.round(a.size / 1024))} kB
                {a.fonte && ` · da ${a.fonte}`}
                {a.riferimento && ` · ${a.riferimento}`}
              </span>
              {a.descrizione && <span className="testo-faint">{a.descrizione}</span>}
            </span>
            <span className="riga">
              <a className="btn btn-fantasma btn-sm" href={a.url} target="_blank" rel="noreferrer">
                Apri
              </a>
              {puoRimuovere && onRimuovi && (
                <button type="button" className="btn btn-fantasma btn-sm" onClick={() => onRimuovi(a.id)}>
                  Togli
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Scelta dei file da caricare, con i loro metadati.
 *
 * Va dentro un form che verrà inviato come `multipart`: da solo non fa nulla,
 * perché i file non partono finché il documento non viene salvato.
 */
export function AllegatiSelettore({
  valore,
  onCambia,
  oggettoPredefinito,
}: {
  valore: AllegatiInBozza;
  onCambia: (v: AllegatiInBozza) => void;
  /** Oggetto del documento padre: precompila il campo, che è quasi sempre giusto. */
  oggettoPredefinito?: string;
}) {
  const [errore, setErrore] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function aggiorna(parziale: Partial<AllegatiInBozza>) {
    onCambia({ ...valore, ...parziale });
  }

  function scegli(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    setErrore(null);

    const scelti = Array.from(lista);
    const troppi = scelti.length > LIMITE_ALLEGATI;
    const giganti = scelti.filter((f) => f.size > LIMITE_BYTE);
    const tipoSbagliato = scelti.filter((f) => !TIPI_ACCEPT.split(',').includes(f.type));

    if (troppi || giganti.length > 0 || tipoSbagliato.length > 0) {
      const problemi: string[] = [];
      if (troppi) problemi.push(`massimo ${LIMITE_ALLEGATI} file per volta`);
      if (giganti.length > 0) {
        problemi.push(`${giganti.length === 1 ? 'un file supera' : `${giganti.length} file superano`} i 10 MB`);
      }
      if (tipoSbagliato.length > 0) {
        problemi.push('tipo non ammesso: solo PDF, immagini, testo, Word ed Excel');
      }
      setErrore(`Non caricato. ${problemi.join('; ')}.`);
      if (input.current) input.current.value = '';
      return;
    }

    aggiorna({
      file: scelti,
      // Il primo file scelto dà l'oggetto, se non è già stato scritto a mano.
      oggetto: valore.oggetto || (oggettoPredefinito ?? '').trim(),
    });
  }

  const totale = valore.file.reduce((somma, f) => somma + f.size, 0);

  return (
    <div className="campo">
      <span className="campo-etichetta">Allegati</span>

      <input
        ref={input}
        className="area"
        type="file"
        multiple
        accept={TIPI_ACCEPT}
        onChange={(e) => scegli(e.target.files)}
        aria-label="Scegli i file da allegare"
      />
      <span className="campo-aiuto">
        Fino a {LIMITE_ALLEGATI} file, 10 MB ciascuno. PDF, immagini, testo, Word, Excel.
      </span>

      {errore && (
        <div className="avviso avviso-pericolo" role="alert">
          {errore}
        </div>
      )}

      {valore.file.length > 0 && (
        <>
          <div className="elenco">
            {valore.file.map((f, i) => (
              <div key={`${f.name}-${i}`} className="voce">
                <span className="cresci">
                  {f.name}
                  <span className="testo-faint">{numero(Math.round(f.size / 1024))} kB</span>
                </span>
                <button
                  type="button"
                  className="btn btn-fantasma btn-sm"
                  onClick={() => aggiorna({ file: valore.file.filter((_, j) => j !== i) })}
                >
                  Togli
                </button>
              </div>
            ))}
          </div>
          <span className="testo-faint">{numero(Math.round(totale / 1024))} kB in totale</span>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="al-oggetto">
              Oggetto
            </label>
            <input
              id="al-oggetto"
              className="area"
              value={valore.oggetto}
              onChange={(e) => aggiorna({ oggetto: e.target.value })}
              placeholder="A cosa serve il documento"
            />
            <span className="campo-aiuto">
              È quello che distingue i file nella lista: il nome del file non dice niente a chi legge.
            </span>
          </div>

          <div className="riga">
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="al-fonte">
                Fonte
              </label>
              <input
                id="al-fonte"
                className="area"
                value={valore.fonte}
                onChange={(e) => aggiorna({ fonte: e.target.value })}
                placeholder="fattura, contratto, comune…"
              />
            </div>
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="al-riferimento">
                Riferimento
              </label>
              <input
                id="al-riferimento"
                className="area"
                value={valore.riferimento}
                onChange={(e) => aggiorna({ riferimento: e.target.value })}
                placeholder="protocollo, numero di fattura…"
              />
            </div>
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="al-descrizione">
              Descrizione
            </label>
            <textarea
              id="al-descrizione"
              className="area"
              rows={2}
              value={valore.descrizione}
              onChange={(e) => aggiorna({ descrizione: e.target.value })}
            />
          </div>
        </>
      )}
    </div>
  );
}

/** Metadati e file scelti, più il bottone che apre la finestra. */
function FinestraAllegati({
  titolo,
  chiuso,
  onCarica,
  inCorso,
}: {
  titolo: string;
  chiuso: () => void;
  /** Riceve i file scelti e i loro metadati al momento del "Allega". */
  onCarica: (bozza: AllegatiInBozza) => void;
  inCorso: boolean;
}) {
  const [bozza, setBozza] = useState(allegatiVuoti);

  return (
    <div className="velo" role="presentation" onClick={chiuso}>
      <div
        className="scheda"
        role="dialog"
        aria-modal="true"
        aria-label={titolo}
        style={{ width: 'min(34rem, 94vw)', maxHeight: '92dvh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scheda-intestazione">
          <h2>{titolo}</h2>
          <button type="button" className="btn btn-fantasma btn-sm" onClick={chiuso} aria-label="Chiudi">
            ✕
          </button>
        </div>
        <div className="scheda-corpo pila-4">
          <AllegatiSelettore valore={bozza} onCambia={setBozza} />
          <div className="riga">
            <button
              type="button"
              className="btn btn-primario cresci"
              onClick={() => onCarica(bozza)}
              disabled={inCorso || bozza.file.length === 0}
            >
              {inCorso ? 'Caricamento…' : 'Allega'}
            </button>
            <button type="button" className="btn btn-fantasma" onClick={chiuso}>
              Annulla
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Bottone-icona che apre il caricamento in una finestra.
 *
 * Va usato dentro una riga di elenco o di tabella, dove non c'è spazio per
 * l'elenco dei file: mostra solo quante ne ci sono e lascia che la finestra
 * mostri i dettagli. Il numero accanto all'icona serve perché da sola non dice
 * nulla, e un file senza nome è indistinguibile da nessun file.
 */
export function AllegatiBottone({
  endpoint,
  conteggio,
  titolo,
  descrizione,
  suCambiati,
}: {
  endpoint: string;
  conteggio: number;
  /** Etichetta della finestra: "Allegati alla voce 3". */
  titolo: string;
  /** Serve all'aria-label del bottone, che non ha testo. */
  descrizione: string;
  suCambiati: () => void;
}) {
  const [aperto, setAperto] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function carica(bozza: AllegatiInBozza) {
    setErrore(null);
    setInCorso(true);
    try {
      await api.upload(endpoint, allegatiInFormData(new FormData(), bozza));
      suCambiati();
      setAperto(false);
      notifica('File allegato');
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Caricamento non riuscito');
    } finally {
      setInCorso(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-sm btn-fantasma"
        onClick={() => setAperto(true)}
        aria-label={`${descrizione}: ${conteggio === 0 ? 'nessun allegato' : `${conteggio} allegati`}`}
        title={conteggio === 0 ? 'Allega un file' : `${conteggio} allegati`}
      >
        <span aria-hidden="true">{conteggio > 0 ? `📎 ${conteggio}` : '📎'}</span>
      </button>

      {aperto && (
        <FinestraAllegati titolo={titolo} chiuso={() => setAperto(false)} onCarica={carica} inCorso={inCorso} />
      )}
      {errore && notifica(errore, 'errore')}
    </>
  );
}

/**
 * Allegati di un documento **già salvato**, con aggiunta e rimozione.
 *
 * Diversamente dal form di creazione, qui non c'è un modulo da inviare: il
 * documento esiste già e l'allegato è un'azione a sé, che parte da sola verso
 * `{endpoint}` e poi fa ricaricare il contenitore con `suCambiati`.
 *
 * `singolo` è per i domini che accettano un file solo, come la quietanza di un
 * versamento: in quel caso non si parla di elenco e la rotta di rimozione non
 * porta l'id dell'allegato.
 */
/**
 * Allegati di un documento **già salvato**, con aggiunta e rimozione.
 *
 * Diversamente dal form di creazione, qui non c'è un modulo da inviare: il
 * documento esiste già e l'allegato è un'azione a sé, che parte da sola verso
 * `{endpoint}` e poi fa ricaricare il contenitore con `suCambiati`.
 *
 * `singolo` è per i domini che accettano un file solo, come la quietanza di un
 * versamento: in quel caso non si parla di elenco e la rotta di rimozione non
 * porta l'id dell'allegato.
 */
export function AllegatiSezione({
  endpoint,
  allegati,
  suCambiati,
  puoScrivere,
  singolo = false,
  titolo = 'Allegati',
  allegatoSingolo = null,
  onCambiatoSingolo,
}: {
  endpoint: string;
  allegati: Allegato[];
  suCambiati: () => void;
  puoScrivere: boolean;
  singolo?: boolean;
  titolo?: string;
  allegatoSingolo?: Allegato | null;
  onCambiatoSingolo?: (a: Allegato | null) => void;
}) {
  const [aperto, setAperto] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const elenco = singolo ? (allegatoSingolo ? [allegatoSingolo] : []) : allegati;
  // Niente file e niente permesso di scrivere: non c'è nulla da mostrare e non
  // c'è nulla da poter fare.
  if (!puoScrivere && elenco.length === 0) return null;

  async function carica(bozza: AllegatiInBozza) {
    setErrore(null);
    setInCorso(true);
    try {
      if (singolo) {
        const risposta = await api.upload<{ allegato: Allegato | null }>(endpoint, allegatiInFormData(new FormData(), bozza));
        onCambiatoSingolo?.(risposta.data.allegato ?? null);
      } else {
        await api.upload(endpoint, allegatiInFormData(new FormData(), bozza));
        suCambiati();
      }
      setAperto(false);
      notifica('File allegato');
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Caricamento non riuscito');
    } finally {
      setInCorso(false);
    }
  }

  async function rimuovi(id: string) {
    try {
      await api.delete(singolo ? endpoint : `${endpoint}/${id}`);
      if (singolo) onCambiatoSingolo?.(null);
      else suCambiati();
      notifica('File tolto');
    } catch (e) {
      notifica(e instanceof ApiError ? e.message : 'Rimozione non riuscita', 'errore');
    }
  }

  return (
    <div className="campo">
      <div className="riga riga-tra">
        <span className="campo-etichetta">{titolo}</span>
        {puoScrivere && !aperto && (
          <button type="button" className="btn btn-fantasma btn-sm" onClick={() => setAperto(true)}>
            {elenco.length === 0 ? 'Allega file' : 'Allega altro'}
          </button>
        )}
      </div>

      {elenco.length === 0 ? (
        <span className="testo-faint">Nessun file allegato.</span>
      ) : (
        <div className="elenco">
          {elenco.map((a) => (
            <div key={a.id} className="voce">
              <span className="cresci pila-1">
                <strong>{a.oggetto}</strong>
                <span className="testo-faint">
                  {a.nome} · {numero(Math.round(a.size / 1024))} kB
                  {a.fonte && ` · da ${a.fonte}`}
                  {a.riferimento && ` · ${a.riferimento}`}
                </span>
              </span>
              <span className="riga">
                <a className="btn btn-fantasma btn-sm" href={a.url} target="_blank" rel="noreferrer">
                  Apri
                </a>
                {puoScrivere && (
                  <button type="button" className="btn btn-fantasma btn-sm" onClick={() => rimuovi(a.id)}>
                    Togli
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {errore && !aperto && (
        <div className="avviso avviso-pericolo" role="alert">
          {errore}
        </div>
      )}

      {aperto && (
        <FinestraAllegati titolo={`Allega a ${titolo.toLowerCase()}`} chiuso={() => setAperto(false)} onCarica={carica} inCorso={inCorso} />
      )}
    </div>
  );
}