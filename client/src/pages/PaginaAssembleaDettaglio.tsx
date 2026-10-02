import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/hooks/useApi';
import { api, ApiError } from '@/api/client';
import { notifica } from '@/hooks/useNotifiche';
import { Caricamento, ErroreCaricamento } from '@/components/Feedback';
import { EtichettaStato, etichette } from '@/components/Elementi';
import { TitoloPagina, RichiediCondominio } from '@/components/TitoloPagina';
import { AreaStampa, PulsanteStampa } from '@/components/Stampa';
import { data as fmtData, numero, percentuale } from '@/lib/formattazione';
import type { Assemblea, Votazione } from '@/types/domain';

interface DettaglioVerbale {
  assemblea: Assemblea;
  condomini: {
    id: string;
    utenteId: string;
    nome: string;
    email: string;
    regime: string;
    quota: number;
    unita: string[];
    millesimi: number;
    presente: boolean;
    delegaA: string | null;
  }[];
}

export default function PaginaAssembleaDettaglio() {
  const { id } = useParams<{ id: string }>();
  const { condominioId } = useAuth();
  const naviga = useNavigate();

  const dettaglio = useApi<DettaglioVerbale>(
    (segnale) =>
      api
        .get<DettaglioVerbale>(`/condomini/${condominioId}/assemblee/${id}/dettaglio-verbale`, undefined, {
          signal: segnale,
        })
        .then((r) => r.data),
    [condominioId, id],
    { attivo: Boolean(condominioId && id) },
  );

  if (!condominioId) return null;

  return (
    <RichiediCondominio>
      <div className="riga" style={{ marginBottom: 'var(--sp-3)' }}>
        <Link to="/c/assemblee" className="btn btn-fantasma btn-sm">
          ← Assemblee
        </Link>
      </div>

      {dettaglio.inCorso && <Caricamento />}
      {dettaglio.errore && <ErroreCaricamento messaggio={dettaglio.errore} onRiprova={dettaglio.ricarica} />}

      {dettaglio.dati && <ContenutoDettaglio dati={dettaglio.dati} onCambiato={dettaglio.ricarica} onEsci={() => naviga('/c/assemblee')} />}
    </RichiediCondominio>
  );
}

function ContenutoDettaglio({
  dati,
  onCambiato,
  onEsci,
}: {
  dati: DettaglioVerbale;
  onCambiato: () => void;
  onEsci: () => void;
}) {
  const { condominioId } = useAuth();
  const a = dati.assemblea;
  const [votazioni, setVotazioni] = useState<Votazione[]>([]);
  const [delibere, setDelibere] = useState<Record<number, string>>({});
  const [inSalvataggio, setInSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    setVotazioni(
      a.ordineDelGiorno.map((p) => {
        const esistente = a.votazioni.find((v) => v.ordine === p.ordine);
        return (
          esistente ?? {
            ordine: p.ordine,
            esito: null,
            votiFavorevoli: 0,
            votiContrari: 0,
            astenuti: 0,
            segreta: false,
          }
        );
      }),
    );
    setDelibere(
      Object.fromEntries(a.ordineDelGiorno.map((p) => [p.ordine, p.delibera ?? ''])),
    );
  }, [a]);

  const presenti = dati.condomini.filter((c) => c.presente);
  const millesimiPresenti = presenti.reduce((s, c) => s + c.millesimi, 0);
  const millesimiTotali = dati.condomini.reduce((s, c) => s + c.millesimi, 0);
  const deleghe = new Set(presenti.filter((c) => c.delegaA).map((c) => c.delegaA));

  async function salvaPresenze() {
    setErrore(null);
    setInSalvataggio(true);
    try {
      await api.put(`/condomini/${condominioId}/assemblee/${a._id}/presenze`, {
        presenze: dati.condomini.map((c) => ({
          condomino: c.id,
          presente: c.presente,
          delegaA: c.delegaA,
        })),
      });
      notifica('Presenze aggiornate');
      onCambiato();
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Salvataggio non riuscito');
    } finally {
      setInSalvataggio(false);
    }
  }

  async function salvaVotazioni() {
    setErrore(null);
    setInSalvataggio(true);
    try {
      await api.put(`/condomini/${condominioId}/assemblee/${a._id}/votazioni`, { votazioni });
      for (const [ordine, delibera] of Object.entries(delibere)) {
        if (delibera.trim()) {
          await api.put(`/condomini/${condominioId}/assemblee/${a._id}/delibere/${ordine}`, {
            ordine: Number(ordine),
            delibera: delibera.trim(),
          });
        }
      }
      notifica('Votazioni e delibere salvate');
      onCambiato();
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Salvataggio non riuscito');
    } finally {
      setInSalvataggio(false);
    }
  }

  function aggiornaVoto(ordine: number, campi: Partial<Votazione>) {
    setVotazioni((precedenti) => precedenti.map((v) => (v.ordine === ordine ? { ...v, ...campi } : v)));
  }

  const readonly = a.stato === 'conclusa';

  return (
    <>
      <TitoloPagina
        titolo={`Assemblea ${etichette.tipoAssemblea(a.tipo)} n. ${a.numero}`}
        descrizione={`${fmtData(a.data)}${a.oraInizio ? ` ore ${a.oraInizio}` : ''} · ${a.luogo}`}
        azioni={<EtichettaStato stato={a.stato} />}
      />

      <div className="statistiche" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="statistica">
          <div className="statistica-valore">
            {presenti.length}/{dati.condomini.length}
          </div>
          <div className="statistica-etichetta">Condomini presenti</div>
        </div>
        <div className="statistica">
          <div className="statistica-valore">{numero(millesimiPresenti)}</div>
          <div className="statistica-etichetta">
            Millesimi presenti ({percentuale((millesimiPresenti / (millesimiTotali || 1)) * 100)})
          </div>
        </div>
        <div className="statistica">
          <div className="statistica-valore">{deleghe.size}</div>
          <div className="statistica-etichetta">Deleghe</div>
        </div>
        <div className="statistica">
          <div className="statistica-valore">{a.ordineDelGiorno.length}</div>
          <div className="statistica-etichetta">Punti in discussione</div>
        </div>
      </div>

      {errore && (
        <div className="avviso avviso-pericolo" style={{ marginBottom: 'var(--sp-3)' }} role="alert">
          {errore}
        </div>
      )}

      <section className="scheda" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="scheda-intestazione">
          <h2>Presenze</h2>
          {!readonly && (
            <button type="button" className="btn btn-secondario btn-sm" onClick={salvaPresenze} disabled={inSalvataggio}>
              Salva
            </button>
          )}
        </div>
        <div className="elenco">
          {dati.condomini.map((c) => (
            <div key={c.id} className="voce">
              <span className="cresci pila-1">
                <strong>{c.nome}</strong>
                <span className="testo-faint">
                  {c.unita.join(', ')} · {etichette.regime(c.regime)} · {numero(c.millesimi)} millesimi
                  {c.quota < 100 ? ` · quota ${c.quota}%` : ''}
                </span>
              </span>
              <CasellaPresenza
                id={c.id}
                presente={c.presente}
                readonly={readonly}
                opzioni={dati.condomini.map((x) => ({ id: x.id, nome: x.nome }))}
                onCambia={(presente, delegaA) => {
                  void api
                    .put(`/condomini/${condominioId}/assemblee/${a._id}/presenze`, {
                      presenze: dati.condomini.map((x) => ({
                        condomino: x.id,
                        presente: x.id === c.id ? presente : x.presente,
                        delegaA: x.id === c.id ? delegaA : x.delegaA,
                      })),
                    })
                    .then(() => onCambiato())
                    .catch(() => setErrore('Aggiornamento presenze non riuscito'));
                }}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="scheda" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="scheda-intestazione">
          <h2>Ordine del giorno e votazioni</h2>
          {!readonly && (
            <button type="button" className="btn btn-secondario btn-sm" onClick={salvaVotazioni} disabled={inSalvataggio}>
              Salva
            </button>
          )}
        </div>
        <div className="elenco">
          {[...a.ordineDelGiorno]
            .sort((x, y) => x.ordine - y.ordine)
            .map((punto) => {
              const vot = votazioni.find((v) => v.ordine === punto.ordine);
              if (!vot) return null;
              const votanti = vot.votiFavorevoli + vot.votiContrari;
              const soglia = a.tipo === 'straordinaria' ? votanti * (2 / 3) : Math.floor(votanti / 2) + 1;
              const coerente = vot.esito ? (vot.votiFavorevoli > soglia) === (vot.esito === 'approvato') : true;

              return (
                <div key={punto.ordine} className="scheda-corpo pila-3" style={{ borderBottom: '1px solid var(--c-border)' }}>
                  <div>
                    <strong>
                      {punto.ordine}. {punto.titolo}
                    </strong>
                    {punto.descrizione && <p className="testo-faint">{punto.descrizione}</p>}
                    {punto.riservata && (
                      <span className="etichetta etichetta-accento">Materia riservata</span>
                    )}
                  </div>

                  {!readonly && (
                    <div className="riga">
                      <div className="campo cresci">
                        <label className="campo-etichetta" htmlFor={`f-${punto.ordine}`}>
                          Favorevoli
                        </label>
                        <input
                          id={`f-${punto.ordine}`}
                          className="area"
                          type="number"
                          inputMode="decimal"
                          min={0}
                          value={vot.votiFavorevoli}
                          onChange={(e) => aggiornaVoto(punto.ordine, { votiFavorevoli: Number(e.target.value) })}
                        />
                      </div>
                      <div className="campo cresci">
                        <label className="campo-etichetta" htmlFor={`c-${punto.ordine}`}>
                          Contrari
                        </label>
                        <input
                          id={`c-${punto.ordine}`}
                          className="area"
                          type="number"
                          inputMode="decimal"
                          min={0}
                          value={vot.votiContrari}
                          onChange={(e) => aggiornaVoto(punto.ordine, { votiContrari: Number(e.target.value) })}
                        />
                      </div>
                      <div className="campo cresci">
                        <label className="campo-etichetta" htmlFor={`a-${punto.ordine}`}>
                          Astenuti
                        </label>
                        <input
                          id={`a-${punto.ordine}`}
                          className="area"
                          type="number"
                          inputMode="decimal"
                          min={0}
                          value={vot.astenuti}
                          onChange={(e) => aggiornaVoto(punto.ordine, { astenuti: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                  )}

                  <div className="riga">
                    <div className="campo cresci">
                      <label className="campo-etichetta" htmlFor={`e-${punto.ordine}`}>
                        Esito
                      </label>
                      <select
                        id={`e-${punto.ordine}`}
                        className="area"
                        value={vot.esito ?? ''}
                        disabled={readonly}
                        onChange={(e) =>
                          aggiornaVoto(punto.ordine, {
                            esito: (e.target.value || null) as Votazione['esito'],
                          })
                        }
                      >
                        <option value="">Non ancora votato</option>
                        <option value="approvato">Approvato</option>
                        <option value="respinto">Respinto</option>
                        <option value="rinviato">Rinviato</option>
                        <option value="dibattuto">Dibattuto</option>
                      </select>
                    </div>
                    {vot.esito && <EtichettaStato stato={vot.esito} />}
                  </div>

                  {votanti > 0 && (
                    <p className="testo-faint">
                      Quorum {a.tipo === 'straordinaria' ? '2/3 dei millesimi' : 'maggioranza dei presenti'}:{' '}
                      {vot.votiFavorevoli} favorevoli su {votanti} votanti
                      {!coerente && (
                        <strong className="testo-danger">
                          {' '}
                          — l’esito dichiarato non coincide con il quorum calcolato.
                        </strong>
                      )}
                    </p>
                  )}

                  <div className="campo">
                    <label className="campo-etichetta" htmlFor={`d-${punto.ordine}`}>
                      Testo della delibera
                    </label>
                    <textarea
                      id={`d-${punto.ordine}`}
                      className="area area-testo"
                      style={{ minHeight: '5rem' }}
                      readOnly={readonly}
                      value={delibere[punto.ordine] ?? punto.delibera ?? ''}
                      onChange={(e) => setDelibere((p) => ({ ...p, [punto.ordine]: e.target.value }))}
                      placeholder="Scrivi il testo della delibera approvata…"
                    />
                    {punto.bilancio && (
                      <p className="campo-aiuto">
                        Punto collegato a un bilancio: gli importi indicati con «€ …» saranno
                        sostituiti dalle cifre definitive del documento quando il verbale viene
                        generato.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </section>

      <SezioneVerbale assemblea={a} onEsci={onEsci} />
    </>
  );
}

function CasellaPresenza({
  id,
  presente,
  readonly,
  opzioni,
  onCambia,
}: {
  id: string;
  presente: boolean;
  readonly: boolean;
  opzioni: { id: string; nome: string }[];
  onCambia: (presente: boolean, delegaA: string | null) => void;
}) {
  const [delegaA, setDelegaA] = useState<string>('');
  return (
    <div className="riga">
      <button
        type="button"
        className={`btn btn-sm ${presente ? 'btn-primario' : 'btn-secondario'}`}
        disabled={readonly}
        onClick={() => onCambia(!presente, delegaA || null)}
      >
        {presente ? 'Presente' : 'Assente'}
      </button>
      {presente && (
        <select
          className="area"
          style={{ width: 'auto', minHeight: '2.25rem', padding: '0.2rem 0.4rem' }}
          value={delegaA}
          disabled={readonly}
          onChange={(e) => {
            setDelegaA(e.target.value);
            onCambia(true, e.target.value || null);
          }}
          aria-label={`Delega per ${id}`}
        >
          <option value="">In presenza</option>
          {opzioni
            .filter((o) => o.id !== id)
            .map((o) => (
              <option key={o.id} value={o.id}>
                Delega a {o.nome}
              </option>
            ))}
        </select>
      )}
    </div>
  );
}

/** Voce dell'elenco verbali: la lista non contiene il testo. */
interface VerbaleRiepilogo {
  _id: string;
  numero: number;
  assemblea: string | { _id: string };
}

/** Il backend può popolare `assemblea` come id o come oggetto: normalizziamo. */
function idAssembleaDi(v: { assemblea: string | { _id: string } }): string {
  return typeof v.assemblea === 'string' ? v.assemblea : v.assemblea._id;
}

interface VerbalePieno {
  _id: string;
  numero: number;
  testo: string;
  approvato: boolean;
  modificatoManualmente: boolean;
}

function SezioneVerbale({ assemblea, onEsci }: { assemblea: Assemblea; onEsci: () => void }) {
  const { condominioId } = useAuth();
  const [anteprima, setAnteprima] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const verbale = useApi<VerbalePieno | null>(
    async (segnale) => {
      const elenco = await api.get<VerbaleRiepilogo[]>(
        `/condomini/${condominioId}/verbali`,
        { page: 1, limit: 50 },
        { signal: segnale },
      );
      const trovato = elenco.data.find((v) => idAssembleaDi(v) === assemblea._id);
      if (!trovato) return null;
      const dettaglio = await api.get<VerbalePieno>(
        `/condomini/${condominioId}/verbali/${trovato._id}`,
        undefined,
        { signal: segnale },
      );
      return dettaglio.data;
    },
    [condominioId, assemblea._id],
    { attivo: Boolean(condominioId) },
  );

  async function genera() {
    setErrore(null);
    setInCorso(true);
    try {
      await api.post(`/condomini/${condominioId}/assemblee/${assemblea._id}/verbale`);
      notifica('Verbale generato');
      verbale.ricarica();
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Generazione non riuscita');
    } finally {
      setInCorso(false);
    }
  }

  async function anteprimaTesto() {
    setErrore(null);
    setInCorso(true);
    try {
      const risposta = await api.get<{ testo: string }>(
        `/condomini/${condominioId}/assemblee/${assemblea._id}/verbale/anteprima`,
      );
      setAnteprima(risposta.data.testo);
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Anteprima non disponibile');
    } finally {
      setInCorso(false);
    }
  }

  const v = verbale.dati;

  return (
    <section className="scheda">
      <div className="scheda-intestazione">
        <h2>Verbale</h2>
        {v && <EtichettaStato stato={v.approvato ? 'approvato' : 'bozza'} testo={v.approvato ? 'Approvato' : 'Bozza'} />}
      </div>
      <div className="scheda-corpo pila-3">
        {errore && (
          <div className="avviso avviso-pericolo" role="alert">
            {errore}
          </div>
        )}

        {verbale.inCorso && <Caricamento />}

        {!verbale.inCorso && !v && (
          <>
            <p className="testo-muto">
              Il verbale viene redatto automaticamente a partire da presenze, votazioni e delibere. Prima di salvarlo
              puoi controllarne l’anteprima.
            </p>
            <div className="riga">
              <button type="button" className="btn btn-secondario cresci" onClick={anteprimaTesto} disabled={inCorso}>
                Anteprima
              </button>
              <button type="button" className="btn btn-primario cresci" onClick={genera} disabled={inCorso}>
                {inCorso ? 'Generazione…' : 'Genera verbale'}
              </button>
            </div>
          </>
        )}

        {v && (
          <>
            <div className="riga">
              <span className="etichetta etichetta-info">Verbale n. {v.numero}</span>
              {v.modificatoManualmente && (
                <span className="etichetta etichetta-avviso">Testo modificato a mano</span>
              )}
            </div>
            <pre className="verbale-testo">{v.testo}</pre>
            <div className="riga">
              <button
                type="button"
                className="btn btn-secondario"
                onClick={() => {
                  void navigator.clipboard?.writeText(v.testo);
                  notifica('Testo copiato negli appunti');
                }}
              >
                Copia testo
              </button>
              <PulsanteStampa etichetta="Stampa / PDF" />
              <button type="button" className="btn btn-fantasma" onClick={onEsci}>
                Chiudi
              </button>
            </div>
          </>
        )}

        {anteprima && (
          <AreaStampa>
            <h3>Anteprima del verbale</h3>
            <pre className="verbale-testo">{anteprima}</pre>
          </AreaStampa>
        )}

        {anteprima && (
          <div className="riga">
            <button
              type="button"
              className="btn btn-primario cresci"
              onClick={genera}
              disabled={inCorso || Boolean(v)}
            >
              Salva come verbale ufficiale
            </button>
            <PulsanteStampa etichetta="Stampa / PDF" />
            <button type="button" className="btn btn-fantasma" onClick={() => setAnteprima(null)}>
              Chiudi anteprima
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
