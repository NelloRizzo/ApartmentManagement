import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/hooks/useApi';
import { api, ApiError } from '@/api/client';
import { notifica } from '@/hooks/useNotifiche';
import { Caricamento, ErroreCaricamento, PaginaVuota } from '@/components/Feedback';
import { etichette } from '@/components/Elementi';
import { TitoloPagina, RichiediCondominio } from '@/components/TitoloPagina';
import { millesimi, numero } from '@/lib/formattazione';
import type { ApiEnvelope, PageMeta, TipoUnita, UnitaConQuote } from '@/types/domain';

const TIPI: TipoUnita[] = ['appartamento', 'ufficio', 'negozio', 'garage', 'cantina', 'soffitta', 'altro'];

interface Modello {
  codice: string;
  piano: number;
  tipo: TipoUnita;
  metratura?: number;
  vani?: number;
  descrizione?: string;
  attiva: boolean;
}

const VUOTO: Modello = { codice: '', piano: 0, tipo: 'appartamento', attiva: true };

export default function PaginaUnita() {
  const { condominioId } = useAuth();
  const [ricerca, setRicerca] = useState('');
  const [inModifica, setInModifica] = useState<UnitaConQuote | 'nuova' | null>(null);

  const elenco = useApi<ApiEnvelope<UnitaConQuote[]>>(
    (segnale) =>
      api.get<UnitaConQuote[]>(
        `/condomini/${condominioId}/unita`,
        { page: 1, limit: 100, sort: 'codice', order: 'asc', ...(ricerca ? { search: ricerca } : {}) },
        { signal: segnale },
      ),
    [condominioId, ricerca],
    { attivo: Boolean(condominioId) },
  );

  if (!condominioId) return null;

  const unita = elenco.dati?.data ?? [];
  const meta: PageMeta | undefined = elenco.dati?.meta;

  return (
    <RichiediCondominio>
      <TitoloPagina
        titolo="Unità immobiliari"
        descrizione="Gli immobili del condominio. Le quote millesimali si impostano nella tabella dedicata."
        azioni={
          <button type="button" className="btn btn-primario" onClick={() => setInModifica('nuova')}>
            + Nuova unità
          </button>
        }
      />

      <div className="campo" style={{ marginBottom: 'var(--sp-3)' }}>
        <label className="campo-etichetta" htmlFor="cerca-unita">
          Cerca
        </label>
        <input
          id="cerca-unita"
          className="area"
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
          placeholder="Codice o descrizione"
        />
      </div>

      {elenco.inCorso && <Caricamento />}
      {elenco.errore && <ErroreCaricamento messaggio={elenco.errore} onRiprova={elenco.ricarica} />}

      {elenco.dati && unita.length === 0 && (
        <PaginaVuota
          titolo={ricerca ? 'Nessun risultato' : 'Nessuna unità immobiliare'}
          descrizione={
            ricerca ? 'Nessuna unità corrisponde alla ricerca.' : 'Crea la prima unità per iniziare a impostare le quote.'
          }
        />
      )}

      <div className="elenco">
        {unita.map((u) => (
          <button
            key={u._id}
            type="button"
            className="scheda voce-clicabile"
            style={{ marginBottom: 'var(--sp-2)', textAlign: 'left' }}
            onClick={() => setInModifica(u)}
          >
            <div className="scheda-corpo pila-2">
              <div className="riga riga-tra">
                <strong>{u.codice}</strong>
                {!u.attiva && <span className="etichetta etichetta-neutro">Non attiva</span>}
                <span className="etichetta etichetta-info">
                  {millesimi(u.millesimi?.diritto)} millesimi
                </span>
              </div>
              <div className="testo-faint">
                Piano {u.piano} · {etichette.tipoUnita(u.tipo)}
                {u.metratura ? ` · ${numero(u.metratura)} m²` : ''}
                {u.vani !== undefined ? ` · ${u.vani} vani` : ''}
              </div>
              {u.descrizione && <div className="testo-faint">{u.descrizione}</div>}
              {(u.titolari?.length ?? 0) > 0 && (
                <div className="riga">
                  {u.titolari!.map((t, i) => (
                    <span key={i} className="etichetta etichetta-neutro">
                      {t.nome}
                      {t.quota < 100 ? ` ${t.quota}%` : ''}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {meta && (
        <p className="testo-faint testo-centrato" style={{ marginTop: 'var(--sp-3)' }}>
          {meta.total} unità immobiliari
        </p>
      )}

      {inModifica && (
        <ModuloUnita
          unita={inModifica === 'nuova' ? null : inModifica}
          onChiuso={() => setInModifica(null)}
          onSalvato={() => {
            setInModifica(null);
            elenco.ricarica();
          }}
        />
      )}
    </RichiediCondominio>
  );
}

function ModuloUnita({
  unita,
  onChiuso,
  onSalvato,
}: {
  unita: UnitaConQuote | null;
  onChiuso: () => void;
  onSalvato: () => void;
}) {
  const { condominioId } = useAuth();
  const [modello, setModello] = useState<Modello>(unita ? { ...unita } : { ...VUOTO });
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const aggiorna = <K extends keyof Modello>(campo: K, valore: Modello[K]) =>
    setModello((m) => ({ ...m, [campo]: valore }));

  async function salva() {
    setErrore(null);
    setInCorso(true);
    try {
      const corpo = {
        codice: modello.codice.trim(),
        piano: modello.piano,
        tipo: modello.tipo,
        metratura: modello.metratura,
        vani: modello.vani,
        descrizione: modello.descrizione?.trim() || undefined,
        attiva: modello.attiva,
      };
      if (unita) {
        await api.patch(`/condomini/${condominioId}/unita/${unita._id}`, corpo);
        notifica('Unità aggiornata');
      } else {
        await api.post(`/condomini/${condominioId}/unita`, corpo);
        notifica('Unità creata');
      }
      onSalvato();
    } catch (e) {
      setErrore(e instanceof ApiError ? (e.primoErroreValidazione ?? e.message) : 'Salvataggio non riuscito');
    } finally {
      setInCorso(false);
    }
  }

  async function elimina() {
    if (!unita) return;
    setInCorso(true);
    setErrore(null);
    try {
      await api.delete(`/condomini/${condominioId}/unita/${unita._id}`);
      notifica('Unità eliminata');
      onSalvato();
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Eliminazione non riuscita');
      setInCorso(false);
    }
  }

  return (
    <div className="velo" role="presentation" onClick={onChiuso}>
      <div
        className="scheda"
        role="dialog"
        aria-modal="true"
        aria-label={unita ? `Modifica unità ${unita.codice}` : 'Nuova unità'}
        style={{ width: 'min(32rem, 92vw)', maxHeight: '92dvh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scheda-intestazione">
          <h2>{unita ? `Unità ${unita.codice}` : 'Nuova unità immobiliare'}</h2>
          <button type="button" className="btn btn-fantasma btn-sm" onClick={onChiuso} aria-label="Chiudi">
            ✕
          </button>
        </div>

        <div className="scheda-corpo pila-4">
          <div className="campo">
            <label className="campo-etichetta" htmlFor="u-codice">
              Codice
            </label>
            <input
              id="u-codice"
              className="area"
              value={modello.codice}
              onChange={(e) => aggiorna('codice', e.target.value)}
              placeholder="A1, B2, G1…"
            />
          </div>

          <div className="riga">
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="u-piano">
                Piano
              </label>
              <input
                id="u-piano"
                className="area"
                type="number"
                inputMode="numeric"
                value={modello.piano}
                onChange={(e) => aggiorna('piano', Number(e.target.value))}
              />
            </div>
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="u-tipo">
                Tipo
              </label>
              <select
                id="u-tipo"
                className="area"
                value={modello.tipo}
                onChange={(e) => aggiorna('tipo', e.target.value as TipoUnita)}
              >
                {TIPI.map((t) => (
                  <option key={t} value={t}>
                    {etichette.tipoUnita(t)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="riga">
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="u-mq">
                Metratura (m²)
              </label>
              <input
                id="u-mq"
                className="area"
                type="number"
                inputMode="decimal"
                min={0}
                value={modello.metratura ?? ''}
                onChange={(e) => aggiorna('metratura', e.target.value === '' ? undefined : Number(e.target.value))}
              />
            </div>
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="u-vani">
                Vani
              </label>
              <input
                id="u-vani"
                className="area"
                type="number"
                inputMode="numeric"
                min={0}
                value={modello.vani ?? ''}
                onChange={(e) => aggiorna('vani', e.target.value === '' ? undefined : Number(e.target.value))}
              />
            </div>
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="u-desc">
              Descrizione
            </label>
            <input
              id="u-desc"
              className="area"
              value={modello.descrizione ?? ''}
              onChange={(e) => aggiorna('descrizione', e.target.value)}
              placeholder="Appartamento con balcone e cantina"
            />
          </div>

          <label className="casella">
            <input
              type="checkbox"
              checked={modello.attiva}
              onChange={(e) => aggiorna('attiva', e.target.checked)}
            />
            <span>Unità attiva (comprende le quote millesimali)</span>
          </label>

          {unita && (unita.titolari?.length ?? 0) > 0 && (
            <div className="avviso avviso-info">
              Le quote millesimali di questa unità sono assegnate a:{' '}
              {unita.titolari!.map((t) => t.nome).join(', ')}. Per cambiarle usa la pagina Quote
              millesimali.
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
              onClick={salva}
              disabled={inCorso || !modello.codice.trim()}
            >
              {inCorso ? 'Salvataggio…' : 'Salva'}
            </button>
            <button type="button" className="btn btn-fantasma" onClick={onChiuso}>
              Annulla
            </button>
            {unita && (
              <button type="button" className="btn btn-pericolo" onClick={elimina} disabled={inCorso}>
                Elimina
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}