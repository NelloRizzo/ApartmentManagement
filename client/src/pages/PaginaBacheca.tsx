import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '@/api/client';
import { useApi } from '@/hooks/useApi';
import { notifica } from '@/hooks/useNotifiche';
import { useAuth } from '@/contexts/AuthContext';
import { useConferma } from '@/components/Conferma';
import { Caricamento, ErroreCaricamento, PaginaVuota } from '@/components/Feedback';
import { TitoloPagina } from '@/components/TitoloPagina';
import { data, dataLunga, perInputData } from '@/lib/formattazione';
import type { ApiEnvelope, AssistenteAttivita, Attivita, ColoreAttivita } from '@/types/domain';
import { COLORI_ATTIVITA, ETICHETTE_COLORE, TOKEN_COLORE } from '@/types/domain';

type FiltroStato = 'aperta' | 'fatta' | 'tutte';

const FILTRI: { chiave: FiltroStato; etichetta: string }[] = [
  { chiave: 'aperta', etichetta: 'Da fare' },
  { chiave: 'fatta', etichetta: 'Completate' },
  { chiave: 'tutte', etichetta: 'Tutte' },
];

/** Scadenza superata e non ancora completata. */
function scaduta(a: Attivita): boolean {
  if (a.fatto || !a.dataFine) return false;
  return new Date(a.dataFine).getTime() < Date.now();
}

/**
 * Inclinazione di una card, in gradi.
 *
 * Il effetto è quello di un post-it attaccato a una superficie: pochi gradi, non
 * di più, o la griglia sembra rotta.
 *
 * Viene **derivata dall'id** e non tirata a caso a ogni render: un `Math.random`
 * qui farebbe saltare tutte le card a ogni ricarica o a ogni `ricarica()`, e il
 * risultato sarebbe più fastidioso dell'effetto. Dall'id è anche senza migrazione e
 * uguale su ogni dispositivo.
 */
function inclinazione(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 1000;
  // Da -2.2° a +2.2°: abbastanza da non leggersi come una riga, poco da sembrare
  // un errore.
  return (h / 1000) * 4.4 - 2.2;
}

function CardAttivita({ attivita, onApri }: { attivita: Attivita; onApri: () => void }) {
  const classi = ['bacheca-card'];
  if (attivita.fatto) classi.push('bacheca-card-fatta');
  else if (scaduta(attivita)) classi.push('bacheca-card-scaduta');
  // Il colore è un accento sul bordo: il fondo resta leggibile su tutti e sei, e
  // la scelta non può rendere illeggibile il titolo.
  if (attivita.colore) classi.push('bacheca-card-colore');

  // La rotazione non entra in `--colore-attivita`: l'accento sta nel CSS, l'angolo
  // dipende dall'id e quindi è un valore calcolato, qui accanto al colore.
  const stile: React.CSSProperties = { transform: `rotate(${inclinazione(attivita._id)}deg)` };
  if (attivita.colore) {
    (stile as React.CSSProperties & { '--colore-attivita': string })['--colore-attivita'] =
      TOKEN_COLORE[attivita.colore];
  }

  return (
    <button type="button" className={classi.join(' ')} style={stile} onClick={onApri}>
      <span className="bacheca-titolo">{attivita.titolo}</span>
      {attivita.descrizione && <span className="testo-faint">{attivita.descrizione}</span>}

      <span className="bacheca-meta">
        {attivita.milestone && <span className="etichetta etichetta-accento">Milestone</span>}
        {attivita.fatto && <span className="etichetta etichetta-successo">Fatta</span>}
        {attivita.dataFine && (
          <span className={scaduta(attivita) ? 'etichetta etichetta-pericolo' : undefined}>
            {scaduta(attivita) ? 'Scaduta il ' : 'Entro il '}
            {data(attivita.dataFine)}
          </span>
        )}
      </span>

      <span className="bacheca-meta">
        {attivita.assegnatari.length === 0 ? (
          <span className="testo-faint">Non assegnata</span>
        ) : (
          attivita.assegnatari.map((a) => (
            <span key={a.id} className="etichetta">
              {a.nome} {a.cognome.charAt(0)}.
            </span>
          ))
        )}
      </span>
    </button>
  );
}

export default function PaginaBacheca() {
  const { utente } = useAuth();
  const [stato, setStato] = useState<FiltroStato>('aperta');
  const [soloAssegnate, setSoloAssegnate] = useState(false);
  const [aperta, setAperta] = useState<Attivita | null>(null);
  const [inCreazione, setInCreazione] = useState(false);
  const { chiedi, elemento: conferma } = useConferma();

  // Il server risponde 403 al superadmin, quindi non ha senso chiedergli la
  // bacheca e ricevere un errore.
  const sonoAmministratore = utente?.role === 'admin';

  const elenco = useApi<ApiEnvelope<Attivita[]>>(
    (segnale) =>
      api.get<Attivita[]>(
        '/staff/attivita',
        { page: 1, limit: 100, stato, ...(soloAssegnate ? { soloAssegnate: true } : {}) },
        { signal: segnale },
      ),
    [stato, soloAssegnate],
    { attivo: aperta === null && !inCreazione },
  );

  /** Ricarica la scheda aperta: dopo una segnatura cambia la card. */
  async function ricaricaAperta(id: string) {
    try {
      const risposta = await api.get<Attivita>(`/staff/attivita/${id}`);
      setAperta(risposta.data);
    } catch {
      // Se non è più leggibile non ha senso tenerla aperta: torna alla bacheca.
      setAperta(null);
    }
  }

  async function elimina(a: Attivita) {
    const confermato = await chiedi({
      titolo: "Eliminare l'attività",
      messaggio: `Stai eliminando "${a.titolo}". Le voci del thread non vengono cancellate insieme: vanno eliminate a parte.`,
      conferma: 'Elimina',
      pericolo: true,
    });
    if (!confermato) return;

    try {
      await api.delete(`/staff/attivita/${a._id}`);
      notifica('Attività eliminata');
      setAperta(null);
      elenco.ricarica();
    } catch (e) {
      notifica(e instanceof ApiError ? e.message : 'Eliminazione non riuscita', 'errore');
    }
  }

  let contenuto: ReactNode;
  if (!sonoAmministratore) {
    contenuto = (
      <PaginaVuota
        titolo="Bacheca non disponibile"
        descrizione="La bacheca delle attività è riservata agli amministratori."
      />
    );
  } else if (inCreazione) {
    contenuto = (
      <ModuloAttivita
        onChiuso={() => setInCreazione(false)}
        onSalvato={() => {
          setInCreazione(false);
          elenco.ricarica();
        }}
      />
    );
  } else if (aperta) {
    contenuto = (
      <DettaglioAttivita
        attivita={aperta}
        indietro={() => setAperta(null)}
        elimina={elimina}
        padreCambiato={() => {
          elenco.ricarica();
          ricaricaAperta(aperta._id);
        }}
      />
    );
  } else {
    contenuto = (
      <>
        <TitoloPagina
          titolo="Bacheca"
          descrizione="I compiti che dividi con il tuo team. Li vede solo chi li ha ricevuti."
          azioni={
            <button type="button" className="btn btn-primario" onClick={() => setInCreazione(true)}>
              Nuova attività
            </button>
          }
        />

        <div className="riga pila-2" style={{ marginBottom: 'var(--sp-4)' }}>
          <div className="riga">
            {FILTRI.map((f) => (
              <button
                key={f.chiave}
                type="button"
                className={`btn btn-sm ${stato === f.chiave ? 'btn-secondario' : 'btn-fantasma'}`}
                onClick={() => setStato(f.chiave)}
              >
                {f.etichetta}
              </button>
            ))}
          </div>
          <label className="riga" style={{ gap: 'var(--sp-2)' }}>
            <input type="checkbox" checked={soloAssegnate} onChange={(e) => setSoloAssegnate(e.target.checked)} />
            <span className="testo-faint">Solo quelle affidate a me</span>
          </label>
        </div>

        {elenco.inCorso && <Caricamento />}
        {elenco.errore && <ErroreCaricamento messaggio={elenco.errore} onRiprova={elenco.ricarica} />}

        {elenco.dati !== null && !elenco.inCorso && (
          <>
            {elenco.dati.data.length === 0 ? (
              <PaginaVuota
                titolo="Nessuna attività"
                descrizione={
                  stato === 'aperta'
                    ? 'Non ci sono compiti da fare. Creane uno o cambia filtro.'
                    : 'Nessuna attività in questo filtro.'
                }
              />
            ) : (
              <div className="bacheca">
                {elenco.dati.data.map((a) => (
                  <CardAttivita key={a._id} attivita={a} onApri={() => setAperta(a)} />
                ))}
              </div>
            )}
            {elenco.dati.meta && (
              <p className="testo-faint testo-centrato" style={{ marginTop: 'var(--sp-3)' }}>
                {elenco.dati.meta.total} attività
              </p>
            )}
          </>
        )}
      </>
    );
  }

  return (
    <>
      {conferma}
      {contenuto}
    </>
  );
}

/**
 * Thread di un'attività.
 *
 * Sostituisce la bacheca invece di aprire una pagina nuova, e il ritorno è un
 * semplice cambiamento di stato.
 */
function DettaglioAttivita({
  attivita,
  indietro,
  elimina,
  padreCambiato,
}: {
  attivita: Attivita;
  indietro: () => void;
  elimina: (a: Attivita) => void;
  padreCambiato: () => void;
}) {
  const [inModifica, setInModifica] = useState(false);
  const [inNuovaVoce, setInNuovaVoce] = useState(false);

  const thread = useApi<ApiEnvelope<Attivita[]>>(
    (segnale) => api.get<Attivita[]>(`/staff/attivita/${attivita._id}/thread`, undefined, { signal: segnale }),
    [attivita._id],
  );

  /**
   * Segna come fatta o riapre.
   *
   * Ricarica sia la voce sia il padre: le voci sono filtrate per chi guarda, e la
   * card del padre cambia aspetto quando è completata.
   */
  async function segna(a: Attivita, fatto: boolean) {
    try {
      await api.post(`/staff/attivita/${a._id}/fatto`, { fatto });
      notifica(fatto ? 'Attività segnata come fatta' : 'Attività riaperta');
      thread.ricarica();
      if (a._id === attivita._id) padreCambiato();
    } catch (e) {
      notifica(e instanceof ApiError ? e.message : 'Salvataggio non riuscito', 'errore');
    }
  }

  if (inModifica) {
    return (
      <ModuloAttivita
        attivita={attivita}
        onChiuso={() => setInModifica(false)}
        onSalvato={() => {
          setInModifica(false);
          padreCambiato();
        }}
      />
    );
  }

  if (inNuovaVoce) {
    return (
      <ModuloAttivita
        padre={attivita._id}
        onChiuso={() => setInNuovaVoce(false)}
        onSalvato={() => {
          setInNuovaVoce(false);
          thread.ricarica();
          padreCambiato();
        }}
      />
    );
  }

  return (
    <>
      <TitoloPagina
        titolo={attivita.titolo}
        descrizione={attivita.descrizione || 'Nessuna descrizione'}
        azioni={
          <div className="riga">
            <button type="button" className="btn btn-fantasma btn-sm" onClick={indietro}>
              ← Bacheca
            </button>
            {attivita.sonoProprietario && (
              <>
                <button type="button" className="btn btn-secondario btn-sm" onClick={() => setInModifica(true)}>
                  Modifica
                </button>
                <button type="button" className="btn btn-pericolo btn-sm" onClick={() => elimina(attivita)}>
                  Elimina
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="scheda" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="scheda-corpo pila-3">
          <div className="riga pila-2">
            <span className="etichetta etichetta-info">{attivita.milestone ? 'Milestone' : 'Attività'}</span>
            {attivita.dataInizio && <span className="testo-faint">Dal {data(attivita.dataInizio)}</span>}
            {attivita.dataFine && (
              <span className={scaduta(attivita) ? 'etichetta etichetta-pericolo' : 'testo-faint'}>
                {scaduta(attivita) ? 'Scaduta il' : 'Entro il'} {dataLunga(attivita.dataFine)}
              </span>
            )}
          </div>

          <div className="testo-faint">
            {attivita.assegnatari.length === 0
              ? 'Non assegnata: la vedi solo tu.'
              : `Assegnata a ${attivita.assegnatari.map((a) => a.nomeCompleto).join(', ')}`}
            {attivita.proprietario && ` · di ${attivita.proprietario.nomeCompleto}`}
          </div>

          {attivita.fatto && attivita.fattoDa && (
            <div className="avviso avviso-successo">
              Completata da {attivita.fattoDa.nome} {attivita.fattoDa.cognome}
              {attivita.fattoIl && ` il ${dataLunga(attivita.fattoIl)}`}.
            </div>
          )}

          <div className="riga">
            <button
              type="button"
              className={`btn ${attivita.fatto ? 'btn-secondario' : 'btn-primario'}`}
              disabled={!attivita.assegnatoAMe && !attivita.sonoProprietario}
              onClick={() => segna(attivita, !attivita.fatto)}
            >
              {attivita.fatto ? 'Riapri' : 'Segna come fatta'}
            </button>
            {!attivita.assegnatoAMe && !attivita.sonoProprietario && (
              <span className="testo-faint">Solo chi ha ricevuto l&apos;attività può segnarla come fatta.</span>
            )}
          </div>
        </div>
      </div>

      <div className="riga riga-tra" style={{ marginBottom: 'var(--sp-3)' }}>
        <h2>Voci del thread</h2>
        {attivita.sonoProprietario && (
          <button type="button" className="btn btn-secondario btn-sm" onClick={() => setInNuovaVoce(true)}>
            Aggiungi voce
          </button>
        )}
      </div>

      {thread.inCorso && <Caricamento />}
      {thread.errore && <ErroreCaricamento messaggio={thread.errore} onRiprova={thread.ricarica} />}

{thread.dati !== null && !thread.inCorso && (
          <>
            {thread.dati.data.length === 0 ? (
              <PaginaVuota
                titolo="Nessuna voce"
                descrizione="Le voci spezzano il lavoro in parti. Ogni voce è un compito a sé, con i suoi assegnatari."
              />
            ) : (
              <div className="bacheca">
                {thread.dati.data.map((v) => (
                  <CardAttivita key={v._id} attivita={v} onApri={() => segna(v, !v.fatto)} />
                ))}
              </div>
            )}
            {thread.dati.data.length > 0 && (
              <p className="testo-faint testo-centrato" style={{ marginTop: 'var(--sp-3)' }}>
                Ogni voce si completa dalla sua card.
              </p>
            )}
          </>
        )}
    </>
  );
}

/**
 * Creazione, modifica e voce di thread.
 *
 * Un solo modulo per i tre casi: sono gli stessi campi con una parte diversa, e
 * tre form separati divergerebbero.
 */
function ModuloAttivita({
  attivita,
  padre,
  onChiuso,
  onSalvato,
}: {
  attivita?: Attivita;
  padre?: string;
  onChiuso: () => void;
  onSalvato: () => void;
}) {
  const [titolo, setTitolo] = useState(attivita?.titolo ?? '');
  const [descrizione, setDescrizione] = useState(attivita?.descrizione ?? '');
  const [assegnatari, setAssegnatari] = useState<string[]>(attivita?.assegnatari.map((a) => a.id) ?? []);
  const [dataInizio, setDataInizio] = useState(perInputData(attivita?.dataInizio));
  const [dataFine, setDataFine] = useState(perInputData(attivita?.dataFine));
  const [milestone, setMilestone] = useState(attivita?.milestone ?? false);
  const [colore, setColore] = useState<ColoreAttivita | null>(attivita?.colore ?? null);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const team = useApi<ApiEnvelope<AssistenteAttivita[]>>(
    (segnale) => api.get<AssistenteAttivita[]>('/staff/attivita/team', undefined, { signal: segnale }),
    [],
  );

  const titoloFinestra = attivita ? 'Modifica attività' : padre ? 'Nuova voce del thread' : 'Nuova attività';

  function commuta(id: string) {
    setAssegnatari((precedenti) =>
      precedenti.includes(id) ? precedenti.filter((x) => x !== id) : [...precedenti, id],
    );
  }

  async function salva() {
    setErrore(null);
    setInCorso(true);
    const corpo = {
      titolo: titolo.trim(),
      descrizione: descrizione.trim(),
      assegnatari,
      colore,
      dataInizio: dataInizio || undefined,
      dataFine: dataFine || undefined,
    };
    try {
      if (attivita) {
        await api.patch(`/staff/attivita/${attivita._id}`, corpo);
        notifica('Attività aggiornata');
      } else {
        await api.post('/staff/attivita', { ...corpo, ...(padre ? { parent: padre } : {}), milestone });        notifica(padre ? 'Voce aggiunta al thread' : 'Attività creata');
      }
      onSalvato();
    } catch (e) {
      setErrore(
        e instanceof ApiError ? (e.primoErroreValidazione ?? e.message) : 'Salvataggio non riuscito',
      );
      setInCorso(false);
    }
  }

  return (
    <div className="velo" role="presentation" onClick={onChiuso}>
      <div
        className="scheda"
        role="dialog"
        aria-modal="true"
        aria-label={titoloFinestra}
        style={{ width: 'min(38rem, 94vw)', maxHeight: '92dvh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scheda-intestazione">
          <h2>{titoloFinestra}</h2>
          <button type="button" className="btn btn-fantasma btn-sm" onClick={onChiuso} aria-label="Chiudi">
            ✕
          </button>
        </div>

        <div className="scheda-corpo pila-4">
          <div className="campo">
            <label className="campo-etichetta" htmlFor="a-titolo">
              Titolo
            </label>
            <input
              id="a-titolo"
              className="area"
              value={titolo}
              onChange={(e) => setTitolo(e.target.value)}
              autoFocus
            />
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="a-descrizione">
              Descrizione
            </label>
            <textarea
              id="a-descrizione"
              className="area"
              rows={3}
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
            />
          </div>

          <div className="campo">
            <span className="campo-etichetta">Assegnatari</span>
            {team.errore && <div className="avviso avviso-pericolo">{team.errore}</div>}
            {team.inCorso && <span className="testo-faint">Caricamento del team…</span>}
            {team.dati !== null && team.dati.data.length === 0 && (
              <span className="testo-faint">
                Non ci sono assistenti. Creane uno dalla pagina{' '}
                <Link to="/c/team">Team e deleghe</Link>.
              </span>
            )}
            {team.dati !== null && team.dati.data.length > 0 && (
              <div className="pila-2">
                {team.dati.data.map((a) => (
                  <label key={a.id} className="riga" style={{ gap: 'var(--sp-2)' }}>
                    <input type="checkbox" checked={assegnatari.includes(a.id)} onChange={() => commuta(a.id)} />
                    <span>
                      {a.nomeCompleto}
                      <span className="testo-faint"> · {a.email}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            <span className="testo-faint">Non assegnandola a nessuno, la vedi solo tu.</span>
          </div>

          <div className="riga">
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="a-inizio">
                Data di inizio
              </label>
              <input
                id="a-inizio"
                className="area"
                type="date"
                value={dataInizio}
                onChange={(e) => setDataInizio(e.target.value)}
              />
            </div>
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="a-fine">
                Scadenza
              </label>
              <input
                id="a-fine"
                className="area"
                type="date"
                value={dataFine}
                onChange={(e) => setDataFine(e.target.value)}
              />
            </div>
          </div>

          {!attivita && !padre && (
            <label className="riga" style={{ gap: 'var(--sp-2)' }}>
              <input type="checkbox" checked={milestone} onChange={(e) => setMilestone(e.target.checked)} />
              <span>È una milestone</span>
            </label>
          )}

          <div className="campo">
            <span className="campo-etichetta">Colore</span>
            <div className="riga" style={{ gap: 'var(--sp-2)' }}>
              <button
                type="button"
                className={`campione${colore === null ? ' campione-scelto' : ''}`}
                onClick={() => setColore(null)}
                aria-label="Nessun colore"
                aria-pressed={colore === null}
              />
              {COLORI_ATTIVITA.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`campione${colore === c ? ' campione-scelto' : ''}`}
                  style={{ '--colore-campione': TOKEN_COLORE[c] } as React.CSSProperties}
                  onClick={() => setColore(c)}
                  aria-label={ETICHETTE_COLORE[c]}
                  aria-pressed={colore === c}
                  title={ETICHETTE_COLORE[c]}
                />
              ))}
            </div>
            <span className="testo-faint">
              Il colore è un accento sulla card: il fondo resta leggibile su tutti e sei.
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
              disabled={inCorso || !titolo.trim()}
            >
              {inCorso ? 'Salvataggio…' : 'Salva'}
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
