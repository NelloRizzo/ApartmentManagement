import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/hooks/useApi';
import { api, ApiError } from '@/api/client';
import { notifica } from '@/hooks/useNotifiche';
import { Caricamento, ErroreCaricamento } from '@/components/Feedback';
import { useConferma } from '@/components/Conferma';
import { AllegatiBottone } from '@/components/Allegati';
import { EtichettaStato, etichette } from '@/components/Elementi';
import { TitoloPagina, RichiediCondominio } from '@/components/TitoloPagina';
import { AreaStampa, PulsanteStampa } from '@/components/Stampa';
import { data as fmtData, numero, percentuale } from '@/lib/formattazione';
import type { Assemblea, StatoAssemblea, TipoAssemblea, Votazione } from '@/types/domain';

interface DettaglioVerbale {
  assemblea: Assemblea;
  /**
   * L'amministratore dello stabile, che non compare mai fra i condòmini: serve
   * al selettore del segretario, che altrimenti non lo potrebbe indicare.
   * Il condòmino riceve la convocazione senza questo campo.
   */
  amministratore?: { id: string; nome: string; cognome: string } | null;
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
  const { condominioId, utente, aggiornaDaVedere } = useAuth();
  const naviga = useNavigate();
  const sonoCondomino = utente?.role === 'condomino';

  const dettaglio = useApi<DettaglioVerbale>(
    (segnale) =>
      // Il condòmino non ha accesso a `dettaglio-verbale` (è una scrittura):
      // riceve l'assemblea dalla rotta di lettura, con presenze, votazioni ed
      // elenco condòmini già tolti dal server.
      (sonoCondomino
        ? api
            .get<Assemblea>(`/condomini/${condominioId}/assemblee/${id}`, undefined, { signal: segnale })
            .then((r) => ({ assemblea: r.data, condomini: [] }))
        : api
            .get<DettaglioVerbale>(`/condomini/${condominioId}/assemblee/${id}/dettaglio-verbale`, undefined, {
              signal: segnale,
            })
            .then((r) => r.data)),
    [condominioId, id, sonoCondomino],
    { attivo: Boolean(condominioId && id) },
  );

  /*
   * Aprire la convocazione è ciò che spegne il badge della sezione Assemblee.
   * La segnatura tiene l'id dell'assemblea vista: senza, il passaggio da una
   * convocazione all'altra riassegnerebbe la stessa promessa e il contatore
   * delle altre resterebbe indietro.
   */
  const [visto, setVisto] = useState<string | null>(null);
  useEffect(() => {
    if (!sonoCondomino || !condominioId || !id || !dettaglio.dati || visto === id) return;
    setVisto(id);
    void api
      .post(`/condomini/${condominioId}/assemblee/${id}/odg-visto`)
      .then(() => aggiornaDaVedere())
      .catch(() => {
        // Il badge non è critico: l'ordine del giorno è aperto lo stesso.
      });
  }, [sonoCondomino, condominioId, id, dettaglio.dati, visto, aggiornaDaVedere]);

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
  const { condominioId, puo, utente } = useAuth();
  const a = dati.assemblea;
  const [votazioni, setVotazioni] = useState<Votazione[]>([]);
  const [delibere, setDelibere] = useState<Record<number, string>>({});
  const [inSalvataggio, setInSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [inModifica, setInModifica] = useState(false);
  const [statoScelto, setStatoScelto] = useState('');
  const [inStato, setInStato] = useState(false);
  /**
   * Scelta non ancora confermata dal server: `null` significa "vale ciò che ha
   * risposto l'API", così un salvataggio fallito fa tornare il selettore al
   * valore vero invece di lasciarlo su una designazione che non esiste.
   */
  const [segretarioScelto, setSegretarioScelto] = useState<string | null>(null);
  const [inSegretario, setInSegretario] = useState(false);
  const puoScrivere = puo('assemblee:scrivere');
  /**
   * Il server ha risposto togliendo presenze, votazioni ed elenco condòmini:
   * la pagina non deve nemmeno proporre i controlli che quei dati servirebbero
   * a compilare.
   */
  const solaLettura = Boolean(a.solaLettura);
  const transizioni = a.transizioniConsentite ?? [];
  const { chiedi, elemento: conferma } = useConferma();

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
    // Ogni risposta nuova è la verità sul segretario: azzerando la scelta
    // locale qui, e non appena il PATCH risponde, il selettore non torna un
    // attimo al valore vecchio mentre il caricamento è ancora in corso.
    setSegretarioScelto(null);
  }, [a]);

  const presenti = dati.condomini.filter((c) => c.presente);
  const millesimiPresenti = presenti.reduce((s, c) => s + c.millesimi, 0);
  const millesimiTotali = dati.condomini.reduce((s, c) => s + c.millesimi, 0);
  const deleghe = new Set(presenti.filter((c) => c.delegaA).map((c) => c.delegaA));

  /**
   * Cambia stato dell'assemblea.
   *
   * Le transizioni valide arrivano dal server: la UI non replica la regola, così
   * un cambio di stato non lascia pulsanti che il backend rifiuterebbe.
   */
  async function cambiaStato() {
    if (!statoScelto) return;
    setErrore(null);
    setInStato(true);
    try {
      await api.post(`/condomini/${condominioId}/assemblee/${a._id}/stato`, { stato: statoScelto });
      notifica(`Assemblea ${statoScelto === 'conclusa' ? 'conclusa' : statoScelto.replace('_', ' ')}`);
      setStatoScelto('');
      onCambiato();
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Cambio stato non riuscito');
    } finally {
      setInStato(false);
    }
  }

  async function ricalcolaMillesimi() {
    setErrore(null);
    setInSalvataggio(true);
    try {
      await api.post(`/condomini/${condominioId}/assemblee/${a._id}/millesimi/ricalcola`);
      notifica('Millesimi ricalcolati');
      onCambiato();
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Ricalcolo non riuscito');
    } finally {
      setInSalvataggio(false);
    }
  }

  /**
   * Elimina l'assemblea.
   *
   * Il server rifiuta se esiste già un verbale o se è conclusa: quei due casi
   * sono messaggi di merito, quindi si lasciano arrivare come sono invece di
   * anticiparli qui.
   */
  async function eliminaAssemblea() {
    const confermato = await chiedi({
      titolo: 'Eliminare l\'assemblea',
      messaggio: `Stai eliminando l'assemblea ${etichette.tipoAssemblea(a.tipo)} n. ${a.numero} del ${fmtData(a.data)}. L'operazione non è reversibile.`,
      conferma: 'Elimina',
      pericolo: true,
    });
    if (!confermato) return;

    setInSalvataggio(true);
    try {
      await api.delete(`/condomini/${condominioId}/assemblee/${a._id}`);
      notifica('Assemblea eliminata');
      onEsci();
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Eliminazione non riuscita');
      setInSalvataggio(false);
    }
  }

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

  /**
   * L'assemblea è conclusa, oppure è arrivata in sola lettura (è il condòmino
   * che riceve il materiale della convocazione): in entrambi i casi qui non si
   * scrive, e `readonly` spegne ogni controllo insieme.
   */
  const readonly = a.stato === 'conclusa' || solaLettura;

  const segretarioAttuale = a.segretario?._id ?? '';
  const segretarioValore = segretarioScelto ?? segretarioAttuale;

  /**
   * Chi può essere designato segretario.
   *
   * L'amministratore presiede ma non compare mai fra i condòmini, quindi senza
   * il suo campo dal dettaglio chi sta gestendo l'assemblea non potrebbe
   * indicare se stesso; l'utente corrente copre il caso dell'assistente. Il
   * `Map` tiene il primo nome che trova per id, così un amministratore che è
   * anche condòmino non compare due volte.
   */
  const candidatiSegretario = (() => {
    const elenco = new Map<string, string>();
    const aggiungi = (id?: string, nome?: string) => {
      if (id && nome && !elenco.has(id)) elenco.set(id, nome);
    };
    if (dati.amministratore) {
      aggiungi(dati.amministratore.id, `${dati.amministratore.nome} ${dati.amministratore.cognome}`);
    }
    aggiungi(utente?.id, utente?.nomeCompleto);
    for (const c of dati.condomini) aggiungi(c.utenteId, c.nome);
    // Un segretario già designato che oggi non compare più nello stabile
    // resterebbe fuori dalle opzioni e il selettore mostrerebbe un valore che
    // non esiste: resta nell'elenco con il nome che ha in anagrafica.
    if (segretarioAttuale && !elenco.has(segretarioAttuale) && a.segretario) {
      aggiungi(segretarioAttuale, `${a.segretario.nome} ${a.segretario.cognome}`);
    }
    return [...elenco.entries()];
  })();

  /**
   * Il segretario si indica mentre l'assemblea si sta svolgendo: è in quel
   * momento che si decide chi redige il verbale, e il server accetta il campo
   * finché l'assemblea non è conclusa. È un solo valore, quindi si salva alla
   * scelta come una presenza, non con un salvataggio collettivo.
   */
  async function salvaSegretario(valore: string) {
    setErrore(null);
    setSegretarioScelto(valore);
    setInSegretario(true);
    try {
      await api.patch(`/condomini/${condominioId}/assemblee/${a._id}`, { segretario: valore || null });
      // La scelta resta finché non arriva il caricamento nuovo, che la azzera:
      // azzerarla adesso il selettore tornerebbe al valore vecchio per un attimo.
      notifica(valore ? 'Segretario indicato' : 'Segretario tolto');
      onCambiato();
    } catch (e) {
      // Tornando a `null` il selettore riprende il valore del server: lasciarlo
      // sulla scelta rifiutata mostrerebbe un segretario che non è stato salvato.
      setSegretarioScelto(null);
      setErrore(
        e instanceof ApiError ? (e.primoErroreValidazione ?? e.message) : 'Salvataggio del segretario non riuscito',
      );
    } finally {
      setInSegretario(false);
    }
  }

  return (
    <>
      {conferma}
      <TitoloPagina
        titolo={`Assemblea ${etichette.tipoAssemblea(a.tipo)} n. ${a.numero}`}
        descrizione={`${fmtData(a.data)}${a.oraInizio ? ` ore ${a.oraInizio}` : ''} · ${a.luogo}${
          a.segretario ? ` · Segretario: ${a.segretario.nome} ${a.segretario.cognome}` : ''
        }`}
        azioni={<EtichettaStato stato={a.stato} />}
      />

      {/*
        Il foglio delle presenze non è un dato del condòmino: senza elenco non
        c'è un rapporto presenti/totali da mostrare, e presentarglielo come
        0/0 sembrerebbe un errore di caricamento.
      */}
      {!solaLettura && (
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
      )}

      {errore && (
        <div className="avviso avviso-pericolo" style={{ marginBottom: 'var(--sp-3)' }} role="alert">
          {errore}
        </div>
      )}

      {puoScrivere && (
        <section className="scheda" style={{ marginBottom: 'var(--sp-4)' }}>
          <div className="scheda-intestazione">
            <h2>Gestione assemblea</h2>
            <EtichettaStato stato={a.stato} />
          </div>
          <div className="scheda-corpo pila-3">
            {readonly ? (
              <div className="avviso avviso-info">
                L&apos;assemblea è conclusa: non è più modificabile. Il verbale è l&apos;atto che ne dà conto.
              </div>
            ) : (
              <>
                {transizioni.length > 0 ? (
                  <div className="riga">
                    <div className="campo cresci">
                      <label className="campo-etichetta" htmlFor="stato-assemblea">
                        Cambia stato
                      </label>
                      <select
                        id="stato-assemblea"
                        className="area"
                        value={statoScelto}
                        onChange={(e) => setStatoScelto(e.target.value as StatoAssemblea)}
                      >
                        <option value="">Scegli lo stato</option>
                        {transizioni.map((s) => (
                          <option key={s} value={s}>
                            {etichette.stato(s)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primario"
                      onClick={cambiaStato}
                      disabled={inStato || !statoScelto}
                    >
                      {inStato ? 'Cambio…' : 'Applica'}
                    </button>
                  </div>
                ) : (
                  <div className="avviso avviso-avviso">
                    Da questo stato non ci sono altre transizioni consentite.
                  </div>
                )}

                {/*
                  Il segretario non si conosce prima dell'assemblea: si decide in
                  sede, e da lì in poi è il nome che compare nel verbale. Per
                  questo lo si indica qui e non nella convocazione.
                */}
                <div className="riga">
                  <div className="campo cresci">
                    <label className="campo-etichetta" htmlFor="segretario-assemblea">
                      Segretario
                    </label>
                    <select
                      id="segretario-assemblea"
                      className="area"
                      value={segretarioValore}
                      disabled={inSegretario}
                      onChange={(e) => void salvaSegretario(e.target.value)}
                    >
                      <option value="">Nessuno indicato</option>
                      {candidatiSegretario.map(([id, nome]) => (
                        <option key={id} value={id}>
                          {nome}
                        </option>
                      ))}
                    </select>
                    <p className="campo-aiuto">
                      Il nome finisce nel verbale, in apertura e nella firma: se nessuno è indicato il
                      testo parla del condomino designato dall&apos;assemblea.
                    </p>
                  </div>
                </div>

                <div className="riga">
                  <button
                    type="button"
                    className="btn btn-secondario"
                    onClick={ricalcolaMillesimi}
                    disabled={inSalvataggio}
                  >
                    Ricalcola millesimi
                  </button>
                  <button type="button" className="btn btn-secondario" onClick={() => setInModifica(true)}>
                    Modifica assemblea
                  </button>
                  <button
                    type="button"
                    className="btn btn-pericolo"
                    onClick={eliminaAssemblea}
                    disabled={inSalvataggio}
                  >
                    Elimina
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {inModifica && (
        <ModificaAssemblea
          assemblea={a}
          onChiudi={() => setInModifica(false)}
          onSalvata={() => {
            setInModifica(false);
            onCambiato();
          }}
        />
      )}

      {/* Il foglio presenze non esiste per il condòmino: vederlo vuoto con la
          casella di chi è presente sarebbe invitarlo a modificare dati che non
          gli appartengono. */}
      {!solaLettura && (
        <section className="scheda" style={{ marginBottom: 'var(--sp-4)' }}>
          <div className="scheda-intestazione">
            <h2>Presenze</h2>
            {!readonly && puoScrivere && (
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
                  readonly={readonly || !puoScrivere}
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
      )}

      <section className="scheda" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="scheda-intestazione">
          <h2>Ordine del giorno e votazioni</h2>
          {!readonly && puoScrivere && (
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
                    {/* Gli allegati sono del punto, non dell'assemblea: relazione,
                        preventivo e progetto si riferiscono a quella deliberazione. */}
                    {punto.allegati.length > 0 && (
                      <div className="elenco">
                        {punto.allegati.map((al) => (
                          <div key={al.id} className="voce">
                            <span className="cresci pila-1">
                              <strong>{al.oggetto}</strong>
                              <span className="testo-faint">
                                {al.nome}
                                {al.fonte && ` · da ${al.fonte}`}
                                {al.riferimento && ` · ${al.riferimento}`}
                              </span>
                            </span>
                            <a className="btn btn-fantasma btn-sm" href={al.url} target="_blank" rel="noreferrer">
                              Apri
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {puoScrivere && !readonly && (
                    <div className="riga riga-tra">
                      {/*
                        Etichetta di campo e non testo grigio: il materiale della
                        deliberazione si carica prima di votare, quindi sta dove
                        si legge prima, non in coda alla votazione.
                      */}
                      <span className="campo-etichetta">Materiale del punto</span>
                      <AllegatiBottone
                        endpoint={`/condomini/${condominioId}/assemblee/${a._id}/ordine/${punto.ordine}/allegati`}
                        conteggio={punto.allegati.length}
                        titolo={`Allegati al punto ${punto.ordine}`}
                        descrizione={`Allegati del punto ${punto.ordine}, ${punto.titolo}`}
                        suCambiati={onCambiato}
                      />
                    </div>
                  )}

                  {!readonly && puoScrivere && (
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
                        disabled={readonly || !puoScrivere}
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
                      readOnly={readonly || !puoScrivere}
                      value={delibere[punto.ordine] ?? punto.delibera ?? ''}
                      onChange={(e) => setDelibere((p) => ({ ...p, [punto.ordine]: e.target.value }))}
                      placeholder="Scrivi il testo della delibera approvata…"
                    />
                    {punto.bilancio && (
                      <p className="campo-aiuto">
                        Punto collegato a un bilancio: i segnaposto «€ …» verranno
                        sostituiti dalle cifre approvate quando si genera il verbale.
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

/**
 * Modifica dei dati di convocazione dell'assemblea.
 *
 * Solo i campi che il server consente di cambiare dopo la creazione: lo stato
 * si cambia con la sua rotta, che ne controlla le transizioni, e l'ordine del
 * giorno si gestisce nella sezione dedicata.
 */
function ModificaAssemblea({
  assemblea,
  onChiudi,
  onSalvata,
}: {
  assemblea: Assemblea;
  onChiudi: () => void;
  onSalvata: () => void;
}) {
  const { condominioId } = useAuth();
  const [tipo, setTipo] = useState<TipoAssemblea>(assemblea.tipo);
  const [data, setData] = useState(assemblea.data.slice(0, 10));
  const [oraInizio, setOraInizio] = useState(assemblea.oraInizio ?? '');
  const [luogo, setLuogo] = useState(assemblea.luogo);
  const [seconda, setSeconda] = useState(assemblea.secondaConvocazione);
  const [quattordici, setQuattordici] = useState(assemblea.quattordiciGgiorni);
  const [note, setNote] = useState(assemblea.note ?? '');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const valido = data !== '' && luogo.trim() !== '';

  async function salva() {
    setErrore(null);
    setInCorso(true);
    try {
      await api.patch(`/condomini/${condominioId}/assemblee/${assemblea._id}`, {
        tipo,
        data,
        oraInizio: oraInizio.trim() || undefined,
        luogo: luogo.trim(),
        secondaConvocazione: seconda,
        quattordiciGgiorni: quattordici,
        note: note.trim() || undefined,
      });
      notifica('Assemblea aggiornata');
      onSalvata();
    } catch (e) {
      setErrore(
        e instanceof ApiError ? (e.primoErroreValidazione ?? e.message) : 'Salvataggio non riuscito',
      );
      setInCorso(false);
    }
  }

  return (
    <div className="velo" role="presentation" onClick={onChiudi}>
      <div
        className="scheda"
        role="dialog"
        aria-modal="true"
        aria-label={`Modifica assemblea n. ${assemblea.numero}`}
        style={{ width: 'min(36rem, 94vw)', maxHeight: '92dvh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scheda-intestazione">
          <h2>Modifica assemblea</h2>
          <button type="button" className="btn btn-fantasma btn-sm" onClick={onChiudi} aria-label="Chiudi">
            ✕
          </button>
        </div>

        <div className="scheda-corpo pila-3">
          {errore && (
            <div className="avviso avviso-pericolo" role="alert">
              {errore}
            </div>
          )}

          <div className="campo">
            <label className="campo-etichetta" htmlFor="ma-tipo">
              Tipo
            </label>
            <select id="ma-tipo" className="area" value={tipo} onChange={(e) => setTipo(e.target.value as TipoAssemblea)}>
              <option value="ordinaria">Ordinaria</option>
              <option value="straordinaria">Straordinaria</option>
            </select>
          </div>

          <div className="riga">
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="ma-data">
                Data
              </label>
              <input
                id="ma-data"
                className="area"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
            <div className="campo">
              <label className="campo-etichetta" htmlFor="ma-ora">
                Ora
              </label>
              <input
                id="ma-ora"
                className="area"
                type="time"
                value={oraInizio}
                onChange={(e) => setOraInizio(e.target.value)}
              />
            </div>
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="ma-luogo">
              Luogo
            </label>
            <input id="ma-luogo" className="area" value={luogo} onChange={(e) => setLuogo(e.target.value)} />
          </div>

          <div className="riga">
            <label className="etichetta">
              <input
                type="checkbox"
                checked={seconda}
                onChange={(e) => setSeconda(e.target.checked)}
              />{' '}
              Seconda convocazione
            </label>
            <label className="etichetta">
              <input
                type="checkbox"
                checked={quattordici}
                onChange={(e) => setQuattordici(e.target.checked)}
              />{' '}
              Quattordici giorni
            </label>
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="ma-note">
              Note
            </label>
            <textarea id="ma-note" className="area" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="riga">
            <button type="button" className="btn btn-primario cresci" onClick={salva} disabled={inCorso || !valido}>
              {inCorso ? 'Salvataggio…' : 'Salva'}
            </button>
            <button type="button" className="btn btn-fantasma" onClick={onChiudi}>
              Annulla
            </button>
          </div>
        </div>
      </div>
    </div>
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
  const { condominioId, puo } = useAuth();
  // Generare o rigenerare il verbale è una scrittura: a chi legge (il
  // condòmino) la sezione mostra soltanto il testo, quando c'è.
  const puoScrivere = puo('assemblee:scrivere');
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
            {puoScrivere ? (
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
            ) : (
              <p className="testo-muto">Il verbale di questa assemblea non è ancora stato redatto.</p>
            )}
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
