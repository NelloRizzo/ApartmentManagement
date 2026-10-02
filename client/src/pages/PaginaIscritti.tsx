import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/hooks/useApi';
import { api, ApiError } from '@/api/client';
import { notifica } from '@/hooks/useNotifiche';
import { Caricamento, ErroreCaricamento, PaginaVuota } from '@/components/Feedback';
import { EtichettaStato, etichette } from '@/components/Elementi';
import { TitoloPagina, RichiediCondominio } from '@/components/TitoloPagina';
import { data as fmtData, millesimi } from '@/lib/formattazione';
import type { ApiEnvelope, Condomino, PageMeta, Regime } from '@/types/domain';

const REGIMI: Regime[] = ['proprietario', 'inquilino', 'comodatario', 'nuda_proprieta'];

export default function PaginaIscritti() {
  const { condominioId } = useAuth();
  const [ricerca, setRicerca] = useState('');
  const [inModifica, setInModifica] = useState<Condomino | 'nuovo' | null>(null);

  const elenco = useApi<ApiEnvelope<Condomino[]>>(
    (segnale) =>
      api.get<Condomino[]>(
        `/condomini/${condominioId}/condomini`,
        { page: 1, limit: 100, sort: 'utente.cognome', order: 'asc', ...(ricerca ? { search: ricerca } : {}) },
        { signal: segnale },
      ),
    [condominioId, ricerca],
    { attivo: Boolean(condominioId) },
  );

  if (!condominioId) return null;

  const iscritti = elenco.dati?.data ?? [];
  const meta: PageMeta | undefined = elenco.dati?.meta;
  const totaleMillesimi = iscritti
    .filter((c) => c.primario)
    .reduce((s, c) => s + (c.millesimi ?? 0), 0);

  return (
    <RichiediCondominio>
      <TitoloPagina
        titolo="Condòmini iscritti"
        descrizione="Le posizioni degli utenti e le unità di cui sono titolari o fruitori."
        azioni={
          <button type="button" className="btn btn-primario" onClick={() => setInModifica('nuovo')}>
            + Nuovo iscritto
          </button>
        }
      />

      <div className="riga" style={{ marginBottom: 'var(--sp-3)' }}>
        <div className="campo cresci">
          <label className="campo-etichetta" htmlFor="cerca-iscritto">
            Cerca
          </label>
          <input
            id="cerca-iscritto"
            className="area"
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
            placeholder="Nome, cognome o email"
          />
        </div>
      </div>

      {elenco.inCorso && <Caricamento />}
      {elenco.errore && <ErroreCaricamento messaggio={elenco.errore} onRiprova={elenco.ricarica} />}

      {elenco.dati && iscritti.length === 0 && (
        <PaginaVuota
          titolo={ricerca ? 'Nessun risultato' : 'Nessun condòmino iscritto'}
          descrizione={
            ricerca ? 'Nessun iscritto corrisponde alla ricerca.' : 'Registra il primo condòmino del condominio.'
          }
        />
      )}

      {totaleMillesimi > 0 && (
        <div className="avviso avviso-info" style={{ marginBottom: 'var(--sp-3)' }}>
          I titolari principali rappresentano {millesimi(totaleMillesimi)} millesimi di dirito.
        </div>
      )}

      <div className="elenco">
        {iscritti.map((c) => (
          <button
            key={c._id}
            type="button"
            className="scheda voce-clicabile"
            style={{ marginBottom: 'var(--sp-2)', textAlign: 'left' }}
            onClick={() => setInModifica(c)}
          >
            <div className="scheda-corpo pila-2">
              <div className="riga riga-tra">
                <strong>
                  {c.utente.nome} {c.utente.cognome}
                </strong>
                {!c.attivo ? (
                  <EtichettaStato stato="annullata" testo="Disattivato" />
                ) : (
                  <span className="etichetta etichetta-info">{millesimi(c.millesimi)} millesimi</span>
                )}
              </div>
              <div className="testo-faint">
                {etichette.regime(c.regime)}
                {c.quota < 100 ? ` · quota ${c.quota}%` : ''} ·{' '}
                {c.unita.map((u) => u.codice).join(', ') || 'nessuna unità'}
              </div>
              <div className="testo-faint">
                {c.utente.email}
                {c.utente.telefono ? ` · ${c.utente.telefono}` : ''}
              </div>
              {c.dataFine && <div className="testo-faint">Termine il {fmtData(c.dataFine)}</div>}
            </div>
          </button>
        ))}
      </div>

      {meta && (
        <p className="testo-faint testo-centrato" style={{ marginTop: 'var(--sp-3)' }}>
          {meta.total} iscritti
        </p>
      )}

      {inModifica && (
        <ModuloIscritto
          iscritto={inModifica === 'nuovo' ? null : inModifica}
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

function ModuloIscritto({
  iscritto,
  onChiuso,
  onSalvato,
}: {
  iscritto: Condomino | null;
  onChiuso: () => void;
  onSalvato: () => void;
}) {
  const { condominioId } = useAuth();
  const [regime, setRegime] = useState<Regime>(iscritto?.regime ?? 'proprietario');
  const [quota, setQuota] = useState(iscritto?.quota ?? 100);
  const [unita, setUnita] = useState<string[]>(iscritto?.unita.map((u) => u._id) ?? []);
  const [attivo, setAttivo] = useState(iscritto?.attivo ?? true);
  // Solo in creazione: dati anagrafici del nuovo utente.
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const unitaDisponibili = useApi<ApiEnvelope<{ _id: string; codice: string; piano: number }[]>>(
    (segnale) =>
      api.get(`/condomini/${condominioId}/unita`, { page: 1, limit: 100, sort: 'codice', order: 'asc' }, { signal: segnale }),
    [condominioId],
    { attivo: Boolean(condominioId) },
  );

  function commutaUnita(id: string) {
    setUnita((precedenti) =>
      precedenti.includes(id) ? precedenti.filter((x) => x !== id) : [...precedenti, id],
    );
  }

  async function salva() {
    setErrore(null);
    setInCorso(true);
    try {
      if (iscritto) {
        await api.patch(`/condomini/${condominioId}/condomini/${iscritto._id}`, {
          regime,
          quota,
          unita,
          attivo,
        });
        notifica('Posizione aggiornata');
      } else {
        await api.post(`/condomini/${condominioId}/condomini`, {
          regime,
          quota,
          unita,
          nome: nome.trim(),
          cognome: cognome.trim(),
          email: email.trim(),
          telefono: telefono.trim() || undefined,
        });
        notifica('Condòmino registrato');
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

  async function rimuovi() {
    if (!iscritto) return;
    setInCorso(true);
    setErrore(null);
    try {
      await api.delete(`/condomini/${condominioId}/condomini/${iscritto._id}`);
      notifica('Posizione rimossa');
      onSalvato();
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Rimozione non riuscita');
      setInCorso(false);
    }
  }

  const pronto = unita.length > 0 && (iscritto || (nome.trim() && cognome.trim() && email.trim()));

  return (
    <div className="velo" role="presentation" onClick={onChiuso}>
      <div
        className="scheda"
        role="dialog"
        aria-modal="true"
        aria-label={iscritto ? 'Modifica posizione' : 'Nuovo condòmino'}
        style={{ width: 'min(34rem, 92vw)', maxHeight: '92dvh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scheda-intestazione">
          <h2>
            {iscritto ? `${iscritto.utente.nome} ${iscritto.utente.cognome}` : 'Nuovo condòmino iscritto'}
          </h2>
          <button type="button" className="btn btn-fantasma btn-sm" onClick={onChiuso} aria-label="Chiudi">
            ✕
          </button>
        </div>

        <div className="scheda-corpo pila-4">
          {!iscritto && (
            <>
              <div className="avviso avviso-info">
                Se l’email corrisponde già a un utente registrato, verrà collegato a quella posizione;
                altrimenti verrà creato un nuovo account con password provvisoria.
              </div>
              <div className="riga">
                <div className="campo cresci">
                  <label className="campo-etichetta" htmlFor="i-nome">
                    Nome
                  </label>
                  <input id="i-nome" className="area" value={nome} onChange={(e) => setNome(e.target.value)} />
                </div>
                <div className="campo cresci">
                  <label className="campo-etichetta" htmlFor="i-cognome">
                    Cognome
                  </label>
                  <input
                    id="i-cognome"
                    className="area"
                    value={cognome}
                    onChange={(e) => setCognome(e.target.value)}
                  />
                </div>
              </div>
              <div className="campo">
                <label className="campo-etichetta" htmlFor="i-email">
                  Email
                </label>
                <input
                  id="i-email"
                  className="area"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="campo">
                <label className="campo-etichetta" htmlFor="i-tel">
                  Telefono
                </label>
                <input
                  id="i-tel"
                  className="area"
                  type="tel"
                  inputMode="tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="riga">
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="i-regime">
                Regime
              </label>
              <select
                id="i-regime"
                className="area"
                value={regime}
                onChange={(e) => setRegime(e.target.value as Regime)}
              >
                {REGIMI.map((r) => (
                  <option key={r} value={r}>
                    {etichette.regime(r)}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label className="campo-etichetta" htmlFor="i-quota">
                Quota %
              </label>
              <input
                id="i-quota"
                className="area"
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                value={quota}
                onChange={(e) => setQuota(Number(e.target.value))}
              />
            </div>
          </div>

          <p className="testo-faint">
            La nuda proprietà vale metà dei millesimi di diritto. La quota di proprietà serve in caso di
            comproprietà: al 100% la posizione vale l’intera quota dell’unità.
          </p>

          <div className="campo">
            <span className="campo-etichetta">Unità immobiliari</span>
            {unitaDisponibili.inCorso && <span className="testo-faint">Caricamento…</span>}
            <div style={{ maxHeight: '12rem', overflowY: 'auto' }}>
              {unitaDisponibili.dati?.data.map((u) => (
                <label key={u._id} className="casella">
                  <input
                    type="checkbox"
                    checked={unita.includes(u._id)}
                    onChange={() => commutaUnita(u._id)}
                  />
                  <span>
                    {u.codice} <span className="testo-faint">piano {u.piano}</span>
                  </span>
                </label>
              ))}
            </div>
            {unita.length === 0 && !unitaDisponibili.inCorso && (
              <span className="campo-errore">Seleziona almeno un’unità immobiliare</span>
            )}
          </div>

          {iscritto && (
            <label className="casella">
              <input type="checkbox" checked={attivo} onChange={(e) => setAttivo(e.target.checked)} />
              <span>Posizione attiva</span>
            </label>
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
              disabled={inCorso || !pronto}
            >
              {inCorso ? 'Salvataggio…' : 'Salva'}
            </button>
            <button type="button" className="btn btn-fantasma" onClick={onChiuso}>
              Annulla
            </button>
            {iscritto && (
              <button type="button" className="btn btn-pericolo" onClick={rimuovi} disabled={inCorso}>
                Rimuovi
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}