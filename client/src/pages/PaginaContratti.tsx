import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/hooks/useApi';
import { api, ApiError } from '@/api/client';
import { notifica } from '@/hooks/useNotifiche';
import { Caricamento, ErroreCaricamento, PaginaVuota } from '@/components/Feedback';
import { EtichettaStato } from '@/components/Elementi';
import { TitoloPagina } from '@/components/TitoloPagina';
import { euro, data as fmtData } from '@/lib/formattazione';
import type { Contratto, Periodicita } from '@/types/domain';

const PERIODICITA: { valore: Periodicita; etichetta: string }[] = [
  { valore: 'mensile', etichetta: 'Mensile' },
  { valore: 'trimestrale', etichetta: 'Trimestrale' },
  { valore: 'semestrale', etichetta: 'Semestrale' },
  { valore: 'annuale', etichetta: 'Annuale' },
];

export default function PaginaContratti() {
  const { isSuperadmin } = useAuth();
  const [inCreazione, setInCreazione] = useState(false);

  const elenco = useApi<{ data: Contratto[]; meta: { total: number } }>(
    async (segnale) => {
      const risposta = await api.get<Contratto[]>(
        '/contratti',
        { page: 1, limit: 100, sort: 'dataScadenza' },
        { signal: segnale },
      );
      return { data: risposta.data, meta: { total: risposta.meta?.total ?? risposta.data.length } };
    },
    [],
  );

  const contratti = elenco.dati?.data ?? [];

  return (
    <>
      <TitoloPagina
        titolo="Contratti"
        descrizione="Contratti di fornitura del servizio e stato degli amministratori."
        azioni={
          isSuperadmin ? (
            <button type="button" className="btn btn-primario" onClick={() => setInCreazione(true)}>
              + Nuovo contratto
            </button>
          ) : undefined
        }
      />

      {elenco.inCorso && <Caricamento />}
      {elenco.errore && <ErroreCaricamento messaggio={elenco.errore} onRiprova={elenco.ricarica} />}

      {elenco.dati && contratti.length === 0 && (
        <PaginaVuota
          titolo="Nessun contratto"
          descrizione="Stipula un contratto per abilitare un amministratore di condominio a gestire unità immobiliari."
        />
      )}

      <div className="elenco">
        {contratti.map((c) => (
          <Link
            key={c.id}
            to={`/p/contratti/${c.id}`}
            className="scheda"
            style={{ marginBottom: 'var(--sp-2)', color: 'inherit' }}
          >
            <div className="scheda-corpo pila-2">
              <div className="riga riga-tra">
                <strong>{c.codice}</strong>
                <div className="riga">
                  <EtichettaStato stato={c.stato} />
                  {c.scaduto && c.stato === 'attivo' && (
                    <span className="etichetta etichetta-pericolo">Scaduto</span>
                  )}
                </div>
              </div>
              <div className="testo-faint">{c.amministratore}</div>
              <div className="riga">
                <span className="etichetta etichetta-info">
                  {c.unitaInUso}/{c.unitaMassime} unità
                </span>
                <span className="etichetta etichetta-neutro">
                  {euro(c.costo)} / {c.periodicita}
                </span>
                <span className="etichetta etichetta-neutro">scade {fmtData(c.dataScadenza)}</span>
                {c.proroghe > 0 && (
                  <span className="etichetta etichetta-accento">{c.proroghe} proroghe</span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {inCreazione && (
        <ModuloContratto
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

function ModuloContratto({ onChiuso, onCreato }: { onChiuso: () => void; onCreato: () => void }) {
  const [amministratore, setAmministratore] = useState('');
  const [unitaMassime, setUnitaMassime] = useState(20);
  const [costo, setCosto] = useState(1200);
  const [periodicita, setPeriodicita] = useState<Periodicita>('annuale');
  const [durataMesi, setDurataMesi] = useState(12);
  const [dataInizio, setDataInizio] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const candidati = useApi<{ data: { id: string; nome: string; email: string }[] }>(
    async (segnale) => {
      const risposta = await api.get<{ _id: string; nome: string; cognome: string; email: string; role: string }[]>(
        '/staff/amministratori',
        { page: 1, limit: 100, sort: 'cognome' },
        { signal: segnale },
      );
      return {
        data: risposta.data
          .filter((u) => u.role === 'admin')
          .map((u) => ({ id: u._id, nome: `${u.nome} ${u.cognome}`, email: u.email })),
      };
    },
    [],
  );

  async function salva() {
    setErrore(null);
    setInCorso(true);
    try {
      await api.post('/contratti', {
        amministratore,
        unitaMassime,
        costo,
        periodicita,
        durataMesi,
        dataInizio,
        note: note.trim() || undefined,
      });
      notifica('Contratto stipulato');
      onCreato();
    } catch (e) {
      setErrore(e instanceof ApiError ? (e.primoErroreValidazione ?? e.message) : 'Salvataggio non riuscito');
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
        aria-label="Nuovo contratto"
        style={{ width: 'min(34rem, 94vw)', maxHeight: '92dvh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scheda-intestazione">
          <h2>Nuovo contratto</h2>
          <button type="button" className="btn btn-fantasma btn-sm" onClick={onChiuso} aria-label="Chiudi">
            ✕
          </button>
        </div>

        <div className="scheda-corpo pila-4">
          <div className="campo">
            <label className="campo-etichetta" htmlFor="c-admin">
              Amministratore di condominio
            </label>
            {candidati.inCorso && <span className="testo-faint">Caricamento…</span>}
            <select
              id="c-admin"
              className="area"
              value={amministratore}
              onChange={(e) => setAmministratore(e.target.value)}
            >
              <option value="">Seleziona…</option>
              {candidati.dati?.data.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome} ({u.email})
                </option>
              ))}
            </select>
            <span className="campo-aiuto">
              Ogni amministratore può avere un solo contratto non concluso.
            </span>
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="c-unita">
              Unità immobiliari comprese (n)
            </label>
            <input
              id="c-unita"
              className="area"
              type="number"
              inputMode="numeric"
              min={1}
              value={unitaMassime}
              onChange={(e) => setUnitaMassime(Number(e.target.value))}
            />
            <span className="campo-aiuto">
              Capacità complessiva su tutti i condominii dell’amministratore.
            </span>
          </div>

          <div className="riga">
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="c-costo">
                Costo per periodo (€)
              </label>
              <input
                id="c-costo"
                className="area"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={costo}
                onChange={(e) => setCosto(Number(e.target.value))}
              />
            </div>
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="c-per">
                Periodicità
              </label>
              <select
                id="c-per"
                className="area"
                value={periodicita}
                onChange={(e) => setPeriodicita(e.target.value as Periodicita)}
              >
                {PERIODICITA.map((p) => (
                  <option key={p.valore} value={p.valore}>
                    {p.etichetta}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="riga">
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="c-durata">
                Durata (mesi)
              </label>
              <input
                id="c-durata"
                className="area"
                type="number"
                inputMode="numeric"
                min={1}
                value={durataMesi}
                onChange={(e) => setDurataMesi(Number(e.target.value))}
              />
            </div>
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="c-inizio">
                Data di inizio
              </label>
              <input
                id="c-inizio"
                className="area"
                type="date"
                value={dataInizio}
                onChange={(e) => setDataInizio(e.target.value)}
              />
            </div>
          </div>

          <div className="avviso avviso-info">
            Verranno generate <strong>{Math.floor(durataMesi / { mensile: 1, trimestrale: 3, semestrale: 6, annuale: 12 }[periodicita])}</strong>{' '}
            rate da {euro(costo)} ciascuna, per un totale di {euro(costo * Math.floor(durataMesi / { mensile: 1, trimestrale: 3, semestrale: 6, annuale: 12 }[periodicita]))}.
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="c-note">
              Note del contratto
            </label>
            <textarea
              id="c-note"
              className="area"
              style={{ minHeight: '4rem' }}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
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
              disabled={inCorso || !amministratore}
            >
              {inCorso ? 'Stipula…' : 'Stipula contratto'}
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