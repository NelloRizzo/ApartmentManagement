import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/hooks/useApi';
import { api, ApiError } from '@/api/client';
import { notifica } from '@/hooks/useNotifiche';
import { Caricamento, ErroreCaricamento, PaginaVuota } from '@/components/Feedback';
import { useConferma } from '@/components/Conferma';
import { TitoloPagina } from '@/components/TitoloPagina';
import { millesimi, data as fmtData } from '@/lib/formattazione';
import type { ApiEnvelope, Condominio } from '@/types/domain';

/** Il totale millesimale della ripartizione in uso è per convenzione 1000. */
const MILLESIMI_CONVENZIONE = 1000;

interface Modello {
  nome: string;
  via: string;
  civico: string;
  citta: string;
  cap: string;
  provincia: string;
  totaleMillesimi: number;
  deliberaRipartizione: string;
  dataDeliberaRipartizione: string;
  note: string;
}

const VUOTO: Modello = {
    nome: '',
    via: '',
  civico: '',
  citta: '',
  cap: '',
  provincia: '',
  totaleMillesimi: MILLESIMI_CONVENZIONE,
  deliberaRipartizione: '',
  dataDeliberaRipartizione: '',
  note: '',
};

/**
 * I condomini gestiti dall'utente.
 *
 * È la pagina da cui si parte: tutto il resto (unità, quote, assemblee) vive
 * dentro un condominio, quindi senza uno non c'è nulla da amministrare. Per
 * questo il pulsante per crearne uno è la prima cosa che offre.
 */
export default function PaginaCondomini() {
  const { selezionaCondominio, puo, ricarica } = useAuth();
  const naviga = useNavigate();
  const [ricerca, setRicerca] = useState('');
  const [aperto, setAperto] = useState<Condominio | 'nuovo' | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const puoScrivere = puo('amministrazione:scrivere');
  const { chiedi, elemento: conferma } = useConferma();

  const elenco = useApi<ApiEnvelope<Condominio[]>>(
    (segnale) =>
      api.get<Condominio[]>(
        '/condomini',
        { page: 1, limit: 100, sort: 'nome', ...(ricerca ? { search: ricerca } : {}) },
        { signal: segnale },
      ),
    [ricerca],
  );

  const condomini = elenco.dati?.data ?? [];

  /**
   * Seleziona il condominio e porta alla sua unità immobiliari.
   *
   * La selezione va registrata prima di navigare: le pagine chiedono
   * `condominioId` al contesto e, senza, si renderebbero subito.
   */
  function gestisci(id: string) {
    selezionaCondominio(id);
    naviga('/c/unita');
  }

  /**
   * Elimina un condominio vuoto.
   *
   * Il backend rifiuta la cancellazione se ci sono unità, iscritti, assemblee o
   * altro: l'errore che torna nomina cosa blocca, quindi si mostra così com'è
   * invece di un messaggio generico.
   */
  async function elimina(c: Condominio) {
    setErrore(null);
    const confermato = await chiedi({
      titolo: 'Eliminare il condominio',
      messaggio: `Stai eliminando ${c.nome} (${c.codice}) con tutte le sue unità, assemblee e bilanci. L'operazione non è reversibile.`,
      conferma: 'Elimina',
      pericolo: true,
    });
    if (!confermato) return;

    try {
      await api.delete(`/condomini/${c._id}`);
      notifica('Condominio eliminato');
      // Se era il selezionato, il selettore in testata punterebbe a uno stabile
      // che non esiste più: lo ricarico lascia scegliere il primo rimasto.
      await ricarica();
      elenco.ricarica();
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Eliminazione non riuscita');
    }
  }

  return (
    <>
      {conferma}
      <TitoloPagina
        titolo="Condomini"
        descrizione="Gli stabili che gestisci. Unità immobiliari, quote e assemblee appartengono a un condominio."
        azioni={<NuovoCondominio suInvio={() => setAperto('nuovo')} />}
      />

      <div className="campo" style={{ marginBottom: 'var(--sp-3)' }}>
        <label className="campo-etichetta" htmlFor="cerca-condominio">
          Cerca
        </label>
        <input
          id="cerca-condominio"
          className="area"
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
          placeholder="Nome, codice, via o città"
        />
      </div>

      {elenco.inCorso && <Caricamento />}
      {elenco.errore && <ErroreCaricamento messaggio={elenco.errore} onRiprova={elenco.ricarica} />}

      {errore && (
        <div className="avviso avviso-pericolo" role="alert" style={{ marginBottom: 'var(--sp-3)' }}>
          {errore}
        </div>
      )}

      {elenco.dati && condomini.length === 0 && (
        <PaginaVuota
          titolo={ricerca ? 'Nessun risultato' : 'Nessun condominio'}
          descrizione={
            ricerca
              ? 'Nessun condominio corrisponde alla ricerca.'
              : 'Crea il tuo primo condominio: è il contenitore di unità immobiliari, quote, assemblee e bilanci.'
          }
          azione={!ricerca ? <NuovoCondominio suInvio={() => setAperto('nuovo')} /> : undefined}
        />
      )}

      <div className="elenco">
        {condomini.map((c) => (
          <div key={c._id} className="scheda" style={{ marginBottom: 'var(--sp-2)' }}>
            <div className="scheda-corpo pila-2">
              <div className="riga riga-tra">
                <strong>{c.nome}</strong>
                <span className="etichetta etichetta-info">{c.codice}</span>
                <span className="etichetta etichetta-neutro">
                  {millesimi(c.totaleMillesimi)} millesimi
                </span>
              </div>
              <div className="testo-faint testo-faint-blocco">
                <a href={urlMappa(c.indirizzo)} target="_blank" rel="noopener noreferrer">
                  {indirizzoDi(c)}
                  <span className="visually-hidden"> (si apre in una nuova scheda)</span>
                  <span aria-hidden="true"> ↗</span>
                </a>
              </div>
              {c.deliberaRipartizione && (
                <div className="testo-faint">
                  Delibera {c.deliberaRipartizione}
                  {c.dataDeliberaRipartizione ? ` del ${fmtData(c.dataDeliberaRipartizione)}` : ''}
                </div>
              )}
              <div className="riga">
                <button type="button" className="btn btn-secondario btn-sm" onClick={() => gestisci(c._id)}>
                  Gestisci
                </button>
                {puoScrivere && (
                  <>
                    <button type="button" className="btn btn-fantasma btn-sm" onClick={() => setAperto(c)}>
                      Modifica
                    </button>
                    <button type="button" className="btn btn-pericolo btn-sm" onClick={() => elimina(c)}>
                      Elimina
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {aperto && (
        <ModuloCondominio
          condominio={aperto === 'nuovo' ? undefined : aperto}
          onChiuso={() => setAperto(null)}
          onSalvato={() => {
            setAperto(null);
            elenco.ricarica();
          }}
        />
      )}
    </>
  );
}

/**
 * Pulsante di creazione.
 *
 * Sparisce per chi non può scrivere: un assistente delegato non ha il permesso
 * `amministrazione:scrivere` e il backend risponderebbe 403.
 */
function NuovoCondominio({ suInvio }: { suInvio: () => void }) {
  const { puo } = useAuth();
  if (!puo('amministrazione:scrivere')) return null;
  return (
    <button type="button" className="btn btn-primario" onClick={suInvio}>
      + Nuovo condominio
    </button>
  );
}

function indirizzoDi(c: Condominio): string {
  const i = c.indirizzo;
  return [i.via, i.civico, [i.cap, i.citta].filter(Boolean).join(' '), i.provincia]
    .map((x) => x ?? '')
    .filter(Boolean)
    .join(', ');
}

/**
 * Link alla ricerca di Google Maps sull'indirizzo del condominio.
 *
 * Non si salvano latitudine e longitudine: l'indirizzo è già obbligatorio e
 * obbligatorio anche in pratica, quindi le coordinate sarebbero un secondo
 * dato da mantenere allineato a un primo che basta. La ricerca per indirizzo
 * risolve anche gli indirizzi che Google non conosce, cosa che un pin salvato a
 * mano farebbe peggio.
 *
 * Il parametro `api=1` è il formato previsto da Google per i link avviati da un
 * sito; `encodeURIComponent` perché via e città contengono spazi e accenti.
 */
function urlMappa(indirizzo: Condominio['indirizzo']): string {
  const ricerca = [indirizzo.via, indirizzo.civico, indirizzo.cap, indirizzo.citta, indirizzo.provincia]
    .filter(Boolean)
    .join(' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ricerca)}`;
}

/** Dall'elenco al form: l'indirizzo è annidato, il form ha campi piatti. */
function daCondominio(c: Condominio): Modello {
  return {
    nome: c.nome,
    via: c.indirizzo.via,
    civico: c.indirizzo.civico ?? '',
    citta: c.indirizzo.citta ?? '',
    cap: c.indirizzo.cap ?? '',
    provincia: c.indirizzo.provincia ?? '',
    totaleMillesimi: c.totaleMillesimi,
    deliberaRipartizione: c.deliberaRipartizione ?? '',
    dataDeliberaRipartizione: c.dataDeliberaRipartizione ? c.dataDeliberaRipartizione.slice(0, 10) : '',
    note: c.note ?? '',
  };
}

function ModuloCondominio({
  condominio,
  onChiuso,
  onSalvato,
}: {
  condominio?: Condominio;
  onChiuso: () => void;
  onSalvato: () => void;
}) {
  const { ricarica } = useAuth();
  const [modello, setModello] = useState<Modello>(condominio ? daCondominio(condominio) : { ...VUOTO });
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const aggiorna = <K extends keyof Modello>(campo: K, valore: Modello[K]) =>
    setModello((m) => ({ ...m, [campo]: valore }));

  const completo = modello.nome.trim().length >= 2 && modello.via.trim() !== '';

  async function salva() {
    setErrore(null);
    setInCorso(true);
    try {
      const corpo = {
        nome: modello.nome.trim(),
        indirizzo: {
          via: modello.via.trim(),
          civico: modello.civico.trim() || undefined,
          citta: modello.citta.trim() || undefined,
          cap: modello.cap.trim() || undefined,
          provincia: modello.provincia.trim() || undefined,
        },
        totaleMillesimi: modello.totaleMillesimi,
        deliberaRipartizione: modello.deliberaRipartizione.trim() || undefined,
        dataDeliberaRipartizione: modello.dataDeliberaRipartizione || undefined,
        note: modello.note.trim() || undefined,
      };

      if (condominio) {
        await api.patch(`/condomini/${condominio._id}`, corpo);
        notifica('Condominio aggiornato');
      } else {
        await api.post('/condomini', corpo);
        notifica('Condominio creato');
      }
      // Il condominio deve comparire nel selettore in testata: `ricarica`
      // rilegge il profilo, che è la sola fonte da cui la UI conosce le posizioni.
      await ricarica();
      onSalvato();
    } catch (e) {
      setErrore(
        e instanceof ApiError ? (e.primoErroreValidazione ?? e.message) : 'Salvataggio non riuscito',
      );
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="velo" role="presentation" onClick={onChiuso}>
      <div
        className="scheda"
        role="dialog"
        aria-modal="true"
        aria-label={condominio ? `Modifica ${condominio.nome}` : 'Nuovo condominio'}
        style={{ width: 'min(36rem, 94vw)', maxHeight: '92dvh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scheda-intestazione">
          <h2>{condominio ? `Modifica ${condominio.codice}` : 'Nuovo condominio'}</h2>
          <button type="button" className="btn btn-fantasma btn-sm" onClick={onChiuso} aria-label="Chiudi">
            ✕
          </button>
        </div>

        <div className="scheda-corpo pila-4">
          <div className="riga">
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="cd-nome">
                Nome
              </label>
              <input
                id="cd-nome"
                className="area"
                value={modello.nome}
                onChange={(e) => aggiorna('nome', e.target.value)}
                placeholder="Condominio Villa Verdi"
              />
            </div>
{condominio && (
            <div className="campo" style={{ maxWidth: '11rem' }}>
              {/*
                Il codice non è un campo di compilazione: lo genera il server e non
                si può cambiare. Mostrarlo in un input disabilitato direbbe
                "modificabile" e mentirebbe.
              */}
              <span className="campo-etichetta">Codice</span>
              <p className="testo-faint testo-faint-blocco">
                {condominio.codice}
                <br />
                generato automaticamente
              </p>
            </div>
          )}
        </div>

          <div className="riga">
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="cd-via">
                Via
              </label>
              <input
                id="cd-via"
                className="area"
                value={modello.via}
                onChange={(e) => aggiorna('via', e.target.value)}
                placeholder="Via Roma"
              />
            </div>
            <div className="campo" style={{ maxWidth: '7rem' }}>
              <label className="campo-etichetta" htmlFor="cd-civico">
                Civico
              </label>
              <input
                id="cd-civico"
                className="area"
                value={modello.civico}
                onChange={(e) => aggiorna('civico', e.target.value)}
              />
            </div>
          </div>

          <div className="riga">
            <div className="campo" style={{ maxWidth: '7rem' }}>
              <label className="campo-etichetta" htmlFor="cd-cap">
                CAP
              </label>
              <input
                id="cd-cap"
                className="area"
                inputMode="numeric"
                value={modello.cap}
                onChange={(e) => aggiorna('cap', e.target.value)}
              />
            </div>
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="cd-citta">
                Città
              </label>
              <input
                id="cd-citta"
                className="area"
                value={modello.citta}
                onChange={(e) => aggiorna('citta', e.target.value)}
              />
            </div>
            <div className="campo" style={{ maxWidth: '9rem' }}>
              <label className="campo-etichetta" htmlFor="cd-provincia">
                Provincia
              </label>
              <input
                id="cd-provincia"
                className="area"
                value={modello.provincia}
                onChange={(e) => aggiorna('provincia', e.target.value)}
              />
            </div>
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="cd-millesimi">
              Totale millesimi del condominio
            </label>
            <input
              id="cd-millesimi"
              className="area"
              type="number"
              inputMode="numeric"
              min={1}
              value={modello.totaleMillesimi}
              onChange={(e) => aggiorna('totaleMillesimi', Number(e.target.value))}
            />
            <span className="campo-aiuto">
              La somma dei millesimi delle unità deve coincidere con questo totale. Per convenzione è
              1000.
            </span>
          </div>

          <div className="riga">
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="cd-delibera">
                Delibera di ripartizione
              </label>
              <input
                id="cd-delibera"
                className="area"
                value={modello.deliberaRipartizione}
                onChange={(e) => aggiorna('deliberaRipartizione', e.target.value)}
                placeholder="Delibera 12/2026"
              />
            </div>
            <div className="campo" style={{ maxWidth: '11rem' }}>
              <label className="campo-etichetta" htmlFor="cd-data-delibera">
                Data delibera
              </label>
              <input
                id="cd-data-delibera"
                className="area"
                type="date"
                value={modello.dataDeliberaRipartizione}
                onChange={(e) => aggiorna('dataDeliberaRipartizione', e.target.value)}
              />
            </div>
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="cd-note">
              Note
            </label>
            <textarea
              id="cd-note"
              className="area"
              style={{ minHeight: '4rem' }}
              value={modello.note}
              onChange={(e) => aggiorna('note', e.target.value)}
            />
          </div>

          {errore && (
            <div className="avviso avviso-pericolo" role="alert">
              {errore}
            </div>
          )}

          <div className="riga">
            <button type="button" className="btn btn-primario cresci" onClick={salva} disabled={inCorso || !completo}>
              {inCorso ? 'Salvataggio…' : condominio ? 'Salva' : 'Crea condominio'}
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
