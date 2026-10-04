import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/hooks/useApi';
import { api, ApiError } from '@/api/client';
import { notifica } from '@/hooks/useNotifiche';
import { Caricamento, ErroreCaricamento, PaginaVuota } from '@/components/Feedback';
import { TitoloPagina } from '@/components/TitoloPagina';
import { millesimi, data as fmtData } from '@/lib/formattazione';
import type { ApiEnvelope, Condominio } from '@/types/domain';

/** Il totale millesimale della ripartizione in uso è per convenzione 1000. */
const MILLESIMI_CONVENZIONE = 1000;

interface Modello {
  nome: string;
  codice: string;
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
  codice: '',
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
  const { selezionaCondominio } = useAuth();
  const naviga = useNavigate();
  const [ricerca, setRicerca] = useState('');
  const [inCreazione, setInCreazione] = useState(false);

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

  return (
    <>
      <TitoloPagina
        titolo="Condomini"
        descrizione="Gli stabili che gestisci. Unità immobiliari, quote e assemblee appartengono a un condominio."
        azioni={<NuovoCondominio suInvio={() => setInCreazione(true)} />}
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

      {elenco.dati && condomini.length === 0 && (
        <PaginaVuota
          titolo={ricerca ? 'Nessun risultato' : 'Nessun condominio'}
          descrizione={
            ricerca
              ? 'Nessun condominio corrisponde alla ricerca.'
              : 'Crea il tuo primo condominio: è il contenitore di unità immobiliari, quote, assemblee e bilanci.'
          }
          azione={!ricerca ? <NuovoCondominio suInvio={() => setInCreazione(true)} /> : undefined}
        />
      )}

      <div className="elenco">
        {condomini.map((c) => (
          <button
            key={c._id}
            type="button"
            className="scheda voce-clicabile"
            style={{ marginBottom: 'var(--sp-2)', textAlign: 'left' }}
            onClick={() => gestisci(c._id)}
          >
            <div className="scheda-corpo pila-2">
              <div className="riga riga-tra">
                <strong>{c.nome}</strong>
                <span className="etichetta etichetta-info">{c.codice}</span>
                <span className="etichetta etichetta-neutro">
                  {millesimi(c.totaleMillesimi)} millesimi
                </span>
              </div>
              <div className="testo-faint">{indirizzoDi(c)}</div>
              {c.deliberaRipartizione && (
                <div className="testo-faint">
                  Delibera {c.deliberaRipartizione}
                  {c.dataDeliberaRipartizione ? ` del ${fmtData(c.dataDeliberaRipartizione)}` : ''}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {inCreazione && (
        <ModuloCondominio
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

function ModuloCondominio({ onChiuso, onCreato }: { onChiuso: () => void; onCreato: () => void }) {
  const { ricarica } = useAuth();
  const [modello, setModello] = useState<Modello>({ ...VUOTO });
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const aggiorna = <K extends keyof Modello>(campo: K, valore: Modello[K]) =>
    setModello((m) => ({ ...m, [campo]: valore }));

  const completo = modello.nome.trim().length >= 2 && modello.codice.trim().length >= 2 && modello.via.trim() !== '';

  async function salva() {
    setErrore(null);
    setInCorso(true);
    try {
      await api.post('/condomini', {
        nome: modello.nome.trim(),
        // Il server mette il codice in maiuscolo, ma lo normalizzo anche qui per
        // non mostrare nell'elenco un valore diverso da quello salvato.
        codice: modello.codice.trim().toUpperCase(),
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
      });
      notifica('Condominio creato');
      // Il condominio nuovo deve comparire nel selettore in testata: `ricarica`
      // rilegge il profilo, che è la sola fonte da cui la UI conosce le posizioni.
      await ricarica();
      onCreato();
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
        aria-label="Nuovo condominio"
        style={{ width: 'min(36rem, 94vw)', maxHeight: '92dvh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scheda-intestazione">
          <h2>Nuovo condominio</h2>
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
            <div className="campo" style={{ maxWidth: '9rem' }}>
              <label className="campo-etichetta" htmlFor="cd-codice">
                Codice
              </label>
              <input
                id="cd-codice"
                className="area"
                value={modello.codice}
                onChange={(e) => aggiorna('codice', e.target.value)}
                placeholder="CIV"
              />
            </div>
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
              {inCorso ? 'Creazione…' : 'Crea condominio'}
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
