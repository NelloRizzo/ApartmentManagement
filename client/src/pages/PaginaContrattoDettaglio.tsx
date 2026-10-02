import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/hooks/useApi';
import { api, ApiError } from '@/api/client';
import { notifica } from '@/hooks/useNotifiche';
import { Caricamento, ErroreCaricamento } from '@/components/Feedback';
import { EtichettaStato } from '@/components/Elementi';
import { euro, data as fmtData, dataOra, MESI_BREVI } from '@/lib/formattazione';
import type { Contratto, RataContratto } from '@/types/domain';

export default function PaginaContrattoDettaglio() {
  const { id } = useParams<{ id: string }>();
  const { isSuperadmin } = useAuth();
  const [azione, setAzione] = useState<'proroga' | 'sospendi' | 'riattiva' | null>(null);
  const [rataPagata, setRataPagata] = useState<RataContratto | null>(null);

  const dettaglio = useApi<Contratto>(
    (segnale) =>
      api.get<Contratto>(`/contratti/${id}`, undefined, { signal: segnale }).then((r) => r.data),
    [id],
    { attivo: Boolean(id) },
  );

  if (!id) return null;

  const c = dettaglio.dati;
  const utilizzo = c && c.unitaMassime > 0 ? Math.round((c.unitaInUso / c.unitaMassime) * 100) : 0;

  return (
    <>
      <div className="riga" style={{ marginBottom: 'var(--sp-3)' }}>
        <Link to="/p/contratti" className="btn btn-fantasma btn-sm">
          ← Contratti
        </Link>
      </div>

      {dettaglio.inCorso && <Caricamento />}
      {dettaglio.errore && <ErroreCaricamento messaggio={dettaglio.errore} onRiprova={dettaglio.ricarica} />}

      {c && (
        <>
          <div className="titolo-pagina">
            <div className="pila-1">
              <h1>{c.codice}</h1>
              <p className="testo-faint">{c.amministratore}</p>
            </div>
            <div className="riga">
              <EtichettaStato stato={c.stato} />
              {c.scaduto && c.stato === 'attivo' && (
                <span className="etichetta etichetta-pericolo">Scaduto</span>
              )}
            </div>
          </div>

          {c.stato === 'sospeso' && (
            <div className="avviso avviso-pericolo" style={{ marginBottom: 'var(--sp-3)' }} role="alert">
              <div>
                <strong>Contratto sospeso</strong>
                {c.sospesoIl ? ` dal ${fmtData(c.sospesoIl)}` : ''}. L’amministratore e i suoi assistenti
                possono consultare i dati ma non modificarne nulla, finché non viene riattivato.
                {c.sospesoMotivo && <div>Motivo: {c.sospesoMotivo}</div>}
              </div>
            </div>
          )}

          <div className="statistiche" style={{ marginBottom: 'var(--sp-4)' }}>
            <div className="statistica">
              <div className="statistica-valore">
                {c.unitaInUso}/{c.unitaMassime}
              </div>
              <div className="statistica-etichetta">Unità immobiliari in carico</div>
            </div>
            <div className="statistica">
              <div className="statistica-valore">{euro(c.costo)}</div>
              <div className="statistica-etichetta">Costo per {c.periodicita}</div>
            </div>
            <div className="statistica">
              <div className="statistica-valore" style={{ color: (c.saldo ?? 0) > 0 ? 'var(--c-danger)' : 'var(--c-success)' }}>
                {euro(c.saldo ?? 0)}
              </div>
              <div className="statistica-etichetta">Saldo da incassare</div>
            </div>
            <div className="statistica">
              <div className="statistica-valore">
                {c.giorniAllaScadenza !== null && c.giorniAllaScadenza >= 0
                  ? `${c.giorniAllaScadenza}`
                  : '—'}
              </div>
              <div className="statistica-etichetta">Giorni alla scadenza</div>
            </div>
          </div>

          <section className="scheda" style={{ marginBottom: 'var(--sp-4)' }}>
            <div className="scheda-intestazione">
              <h2>Condizioni</h2>
            </div>
            <div className="scheda-corpo pila-2">
              <Riga etichetta="Durata" valore={`${c.durataMesi} mesi (${c.proroghe} proroghe)`} />
              <Riga etichetta="Periodo" valore={`${fmtData(c.dataInizio)} → ${fmtData(c.dataScadenza)}`} />
              <Riga etichetta="Capacità" valore={`${utilizzo}% utilizzata`} />
              <Riga etichetta="Rinnovo automatico" valore={c.rinnovoAutomatico ? 'Sì' : 'No'} />
              {c.condomini && c.condomini.length > 0 && (
                <Riga
                  etichetta="Condominii amministrati"
                  valore={c.condomini.map((x) => x.codice).join(', ')}
                />
              )}
              {c.note && <Riga etichetta="Note" valore={c.note} />}
            </div>
          </section>

          {isSuperadmin && (
            <div className="riga" style={{ marginBottom: 'var(--sp-4)' }}>
              {c.stato !== 'cessato' && (
                <button type="button" className="btn btn-secondario" onClick={() => setAzione('proroga')}>
                  Proroga
                </button>
              )}
              {c.stato === 'attivo' && (
                <button type="button" className="btn btn-secondario" onClick={() => setAzione('sospendi')}>
                  Sospendi
                </button>
              )}
              {azione === 'sospendi' && (
                <button type="button" className="btn btn-primario" onClick={() => setAzione('riattiva')}>
                  Riattiva
                </button>
              )}
            </div>
          )}

          <section className="scheda" style={{ marginBottom: 'var(--sp-4)' }}>
            <div className="scheda-intestazione">
              <h2>Rate</h2>
              <span className="etichetta etichetta-neutro">
                {euro(c.incassato ?? 0)} su {euro(c.dovuto ?? 0)}
              </span>
            </div>
            <div className="elenco">
              {(c.rate ?? []).map((r) => (
                <div key={r.id} className="voce">
                  <span className="cresci pila-1">
                    <strong>
                      Rata {r.progressivo} · {MESI_BREVI[new Date(r.scadenza).getMonth()]}
                    </strong>
                    <span className="testo-faint">
                      scade {fmtData(r.scadenza)}
                      {r.dataPagamento ? ` · pagata il ${fmtData(r.dataPagamento)}` : ''}
                      {r.quietanza ? ` · ${r.quietanza}` : ''}
                    </span>
                  </span>
                  <span className="riga">
                    <strong className="testo-num">{euro(r.importo)}</strong>
                    <EtichettaStato
                      stato={r.stato === 'pagato' ? 'pagato' : r.stato === 'annullato' ? 'annullata' : r.scaduta ? 'non_pagato' : 'da_pagare'}
                    />
                    {isSuperadmin && r.stato === 'da_pagare' && (
                      <button
                        type="button"
                        className="btn btn-secondario btn-sm"
                        onClick={() => setRataPagata(r)}
                      >
                        Registra
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {c.storico && c.storico.length > 0 && (
            <section className="scheda" style={{ marginBottom: 'var(--sp-4)' }}>
              <div className="scheda-intestazione">
                <h2>Andamento</h2>
              </div>
              <div className="elenco">
                {[...c.storico].reverse().map((s, i) => (
                  <div key={i} className="voce">
                    <span className="cresci pila-1">
                      <strong style={{ textTransform: 'capitalize' }}>{s.azione}</strong>
                      {s.nota && <span className="testo-faint">{s.nota}</span>}
                    </span>
                    <span className="testo-faint">{dataOra(s.data)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {c.messaggi && c.messaggi.length > 0 && (
            <section className="scheda">
              <div className="scheda-intestazione">
                <h2>Messaggi</h2>
              </div>
              <div className="elenco">
                {[...c.messaggi].reverse().map((m) => (
                  <div key={m.id} className="scheda-corpo pila-1">
                    <div className="riga riga-tra">
                      <strong>{m.oggetto}</strong>
                      <span className="etichetta etichetta-neutro">{m.tipo}</span>
                    </div>
                    <p className="testo-faint">{m.corpo}</p>
                    <span className="testo-faint">{dataOra(m.creatoIl)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {azione && (
            <ModuloAzione
              azione={azione}
              contratto={c}
              onChiuso={() => setAzione(null)}
              onFatto={() => {
                setAzione(null);
                dettaglio.ricarica();
              }}
            />
          )}

          {rataPagata && (
            <ModuloPagamento
              contrattoId={c.id}
              rata={rataPagata}
              onChiuso={() => setRataPagata(null)}
              onRegistrato={() => {
                setRataPagata(null);
                dettaglio.ricarica();
              }}
            />
          )}
        </>
      )}
    </>
  );
}

function Riga({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div className="riga riga-tra">
      <span className="testo-muto">{etichetta}</span>
      <strong style={{ textAlign: 'right' }}>{valore}</strong>
    </div>
  );
}

function ModuloAzione({
  azione,
  contratto,
  onChiuso,
  onFatto,
}: {
  azione: 'proroga' | 'sospendi' | 'riattiva';
  contratto: Contratto;
  onChiuso: () => void;
  onFatto: () => void;
}) {
  const [mesi, setMesi] = useState(contratto.mesiProroga);
  const [nuovaCapacita, setNuovaCapacita] = useState(contratto.unitaMassime);
  const [motivo, setMotivo] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const titoli = {
    proroga: 'Proroga del contratto',
    sospendi: 'Sospendere il contratto',
    riattiva: 'Riattivare il contratto',
  };

  async function conferma() {
    setErrore(null);
    setInCorso(true);
    try {
      if (azione === 'proroga') {
        await api.post(`/contratti/${contratto.id}/proroga`, {
          mesi,
          nuovaCapacita: nuovaCapacita !== contratto.unitaMassime ? nuovaCapacita : undefined,
          nota: motivo.trim() || undefined,
        });
        notifica('Contratto prorogato');
      } else {
        await api.post(`/contratti/${contratto.id}/stato`, {
          azione,
          motivo: motivo.trim() || undefined,
        });
        notifica(azione === 'sospendi' ? 'Contratto sospeso' : 'Contratto riattivato');
      }
      onFatto();
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Operazione non riuscita');
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
        aria-label={titoli[azione]}
        style={{ width: 'min(30rem, 94vw)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scheda-intestazione">
          <h2>{titoli[azione]}</h2>
          <button type="button" className="btn btn-fantasma btn-sm" onClick={onChiuso} aria-label="Chiudi">
            ✕
          </button>
        </div>
        <div className="scheda-corpo pila-3">
          {azione === 'proroga' && (
            <>
              <div className="avviso avviso-info">
                Verranno generate le rate per il periodo aggiunto. Le scadenze restano allineate alla data di
                inizio del contratto.
              </div>
              <div className="campo">
                <label className="campo-etichetta" htmlFor="p-mesi">
                  Mesi di proroga
                </label>
                <input
                  id="p-mesi"
                  className="area"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={240}
                  value={mesi}
                  onChange={(e) => setMesi(Number(e.target.value))}
                />
              </div>
              <div className="campo">
                <label className="campo-etichetta" htmlFor="p-cap">
                  Nuova capacità in unità immobiliari
                </label>
                <input
                  id="p-cap"
                  className="area"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={nuovaCapacita}
                  onChange={(e) => setNuovaCapacita(Number(e.target.value))}
                />
                <span className="campo-aiuto">
                  Attualmente in carico {contratto.unitaInUso} unità: una capacità inferiore non le bloccherà,
                  ma non potrà aggiungerne di nuove.
                </span>
              </div>
            </>
          )}

          {azione === 'sospendi' && (
            <div className="avviso avviso-pericolo">
              L’amministratore e i suoi assistenti potranno ancora consultare i dati, ma ogni operazione di
              modifica resterà bloccata.
            </div>
          )}

          {azione === 'riattiva' && (
            <div className="avviso avviso-successo">
              Il contratto torna attivo e le operazioni degli amministratori vengono sbloccate.
            </div>
          )}

          <div className="campo">
            <label className="campo-etichetta" htmlFor="p-motivo">
              {azione === 'proroga' ? 'Nota' : 'Motivo'}
            </label>
            <textarea
              id="p-motivo"
              className="area"
              style={{ minHeight: '4rem' }}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={azione === 'sospendi' ? 'Es. mancato pagamento della rata' : ''}
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
              onClick={conferma}
              disabled={inCorso}
            >
              {inCorso ? 'Operazione…' : 'Conferma'}
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

function ModuloPagamento({
  contrattoId,
  rata,
  onChiuso,
  onRegistrato,
}: {
  contrattoId: string;
  rata: RataContratto;
  onChiuso: () => void;
  onRegistrato: () => void;
}) {
  const [dataPagamento, setDataPagamento] = useState(new Date().toISOString().slice(0, 10));
  const [identificativo, setIdentificativo] = useState('');
  const [quietanza, setQuietanza] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function registra() {
    setErrore(null);
    setInCorso(true);
    try {
      await api.post(`/contratti/${contrattoId}/rate/${rata.id}/pagamento`, {
        dataPagamento,
        metodo: 'bonifico',
        identificativoTransazione: identificativo.trim() || undefined,
        quietanza: quietanza.trim() || undefined,
      });
      notifica('Pagamento registrato');
      onRegistrato();
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Registrazione non riuscita');
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
        aria-label="Registra pagamento"
        style={{ width: 'min(28rem, 94vw)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scheda-intestazione">
          <h2>Rata {rata.progressivo} · {euro(rata.importo)}</h2>
          <button type="button" className="btn btn-fantasma btn-sm" onClick={onChiuso} aria-label="Chiudi">
            ✕
          </button>
        </div>
        <div className="scheda-corpo pila-3">
          <div className="campo">
            <label className="campo-etichetta" htmlFor="r-data">
              Data di pagamento
            </label>
            <input
              id="r-data"
              className="area"
              type="date"
              value={dataPagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
            />
          </div>
          <div className="campo">
            <label className="campo-etichetta" htmlFor="r-ident">
              Identificativo transazione
            </label>
            <input
              id="r-ident"
              className="area"
              value={identificativo}
              onChange={(e) => setIdentificativo(e.target.value)}
              placeholder="Codice bonifico"
            />
          </div>
          <div className="campo">
            <label className="campo-etichetta" htmlFor="r-quiet">
              Numero quietanza
            </label>
            <input
              id="r-quiet"
              className="area"
              value={quietanza}
              onChange={(e) => setQuietanza(e.target.value)}
            />
          </div>

          {errore && (
            <div className="avviso avviso-pericolo" role="alert">
              {errore}
            </div>
          )}

          <div className="riga">
            <button type="button" className="btn btn-primario cresci" onClick={registra} disabled={inCorso}>
              {inCorso ? 'Registrazione…' : 'Registra pagamento'}
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