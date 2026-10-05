import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/hooks/useApi';
import { api, ApiError } from '@/api/client';
import { notifica } from '@/hooks/useNotifiche';
import { Caricamento, ErroreCaricamento, PaginaVuota } from '@/components/Feedback';
import { useConferma } from '@/components/Conferma';
import { AllegatiBottone } from '@/components/Allegati';
import { EtichettaStato } from '@/components/Elementi';
import { TitoloPagina, RichiediCondominio } from '@/components/TitoloPagina';
import { AreaStampa, PulsanteStampa } from '@/components/Stampa';
import { euro } from '@/lib/formattazione';
import {
  CATEGORIE_BILANCIO,
  RIPARTIZIONI_BILANCIO,
  type Bilancio,
  type CategoriaBilancio,
  type RipartizioneBilancio,
  type VoceBilancio,
} from '@/types/domain';

const ETICHETTE_CATEGORIA: Record<string, string> = {
  gestione: 'Gestione',
  pulizie: 'Pulizie',
  manutenzione: 'Manutenzione',
  ascensore: 'Ascensore',
  riscaldamento: 'Riscaldamento',
  illuminazione: 'Illuminazione',
  acqua: 'Acqua',
  energia: 'Energia e gas',
  assicurazione: 'Assicurazione',
  imposte: 'Imposte e tributi',
  fondo: 'Fondo di riserva',
  altro: 'Altro',
};

const ETICHETTE_RIPARTIZIONE: Record<string, string> = {
  diritto: 'per diritto (millesimi)',
  uso: 'per uso',
  spese: 'a spese',
  criterio: 'per criterio',
};

const VOCE_VUOTA: VoceBilancio = {
  categoria: 'gestione',
  descrizione: '',
  importo: 0,
  ripartizione: 'diritto',
  voci: [],
  allegati: [],
};

/** Differenza tra quanto previsto e quanto realizzato, per voce o per totale. */
function scostamento(previsto: number, realizzato: number): { valore: number; percentuale: number | null } {
  const valore = Math.round((realizzato - previsto) * 100) / 100;
  const percentuale = previsto > 0 ? Math.round((valore / previsto) * 1000) / 10 : null;
  return { valore, percentuale };
}

export default function PaginaBilanci() {
  const { condominioId, puo } = useAuth();
  const puoScrivere = puo('bilanci:scrivere');
  const oggi = new Date();
  const [anno, setAnno] = useState(oggi.getFullYear());
  /** Id del bilancio di cui si sta modificando una voce: una voce sola per volta. */
  const [voceInModifica, setVoceInModifica] = useState<{ bilancio: string; voce: string } | null>(null);
  const [nuovaVoce, setNuovaVoce] = useState<{ bilancio: string } | null>(null);
  const [consuntivoInCorso, setConsuntivoInCorso] = useState(false);
  const [inAzione, setInAzione] = useState(false);
  const [bilancioInModifica, setBilancioInModifica] = useState<Bilancio | null>(null);
  const { chiedi, elemento: conferma } = useConferma();

  const anni = [oggi.getFullYear() - 2, oggi.getFullYear() - 1, oggi.getFullYear(), oggi.getFullYear() + 1];

  const bilanci = useApi<Bilancio[]>(
    (segnale) =>
      api
        .get<Bilancio[]>(`/condomini/${condominioId}/bilanci`, { anno }, { signal: segnale })
        .then((r) => r.data),
    [condominioId, anno],
    { attivo: Boolean(condominioId) },
  );

  const preventivo = bilanci.dati?.find((b) => b.tipo === 'preventivo');
  const consuntivo = bilanci.dati?.find((b) => b.tipo === 'consuntivo');
  const totalePrevisto = consuntivo?.totalePrevisto ?? preventivo?.totale ?? 0;
  const scostamentoTotale = scostamento(totalePrevisto, consuntivo?.totale ?? 0);

  async function generaConsuntivo() {
    if (!preventivo) return;
    setConsuntivoInCorso(true);
    try {
      const risposta = await api.post<Bilancio>(`/condomini/${condominioId}/bilanci/${preventivo._id}/consuntivo`);
      notifica(`Consuntivo ${risposta.data.anno} pronto da compilare`);
      await bilanci.ricarica();
    } catch (e) {
      notifica(e instanceof ApiError ? e.message : 'Generazione del consuntivo non riuscita', 'errore');
    } finally {
      setConsuntivoInCorso(false);
    }
  }

  /**
 * Crea il preventivo dell'anno, vuoto: le voci si aggiungono dopo.
 *
 * Il server rifiuta la stessa coppia anno+tipo, quindi il pulsante compare solo
 * quando l'anno è davvero vuoto.
 */
async function creaPreventivo() {
  setInAzione(true);
  try {
    await api.post(`/condomini/${condominioId}/bilanci`, {
      anno,
      tipo: 'preventivo',
      voci: [],
      descrizione: `Preventivo ${anno}`,
    });
    notifica(`Preventivo ${anno} creato`);
    await bilanci.ricarica();
  } catch (e) {
    notifica(e instanceof ApiError ? e.message : 'Creazione non riuscita', 'errore');
  } finally {
    setInAzione(false);
  }
}

/** Approva o revoca l'approvazione del bilancio. */
async function approva(bilancio: Bilancio, approvato: boolean) {
  setInAzione(true);
  try {
    await api.post(`/condomini/${condominioId}/bilanci/${bilancio._id}/approva`, { approvato });
    notifica(approvato ? 'Bilancio approvato' : 'Approvazione revocata');
    await bilanci.ricarica();
  } catch (e) {
    notifica(e instanceof ApiError ? e.message : 'Operazione non riuscita', 'errore');
  } finally {
    setInAzione(false);
  }
}

/**
 * Elimina l'intero bilancio.
 *
 * Il server lo rifiuta se è approvato: quel pulsante resta nascosto in quel caso,
 * perché un rifiuto qui sarebbe un vicolo cieco e non un errore da correggere.
 */
async function eliminaBilancio(bilancio: Bilancio) {
    const nome = bilancio.tipo === 'consuntivo' ? 'consuntivo' : 'preventivo';
    const confermato = await chiedi({
      titolo: 'Eliminare il bilancio',
      messaggio: `Stai eliminando il ${nome} ${bilancio.anno} con tutte le sue ${bilancio.voci.length} voci. L'operazione non è reversibile.`,
      conferma: 'Elimina',
      pericolo: true,
    });
    if (!confermato) return;


  setInAzione(true);
  try {
    await api.delete(`/condomini/${condominioId}/bilanci/${bilancio._id}`);
    notifica('Bilancio eliminato');
    await bilanci.ricarica();
  } catch (e) {
    notifica(e instanceof ApiError ? e.message : 'Eliminazione non riuscita', 'errore');
  } finally {
    setInAzione(false);
  }
}

async function eliminaVoce(bilancioId: string, voceId: string, descrizione: string) {
    const confermato = await chiedi({
      titolo: 'Eliminare la voce',
      messaggio: `Stai eliminando la voce «${descrizione}» e l'importo collegato. L'operazione non è reversibile.`,
      conferma: 'Elimina',
      pericolo: true,
    });
    if (!confermato) return;
    try {
      await api.delete(`/condomini/${condominioId}/bilanci/${bilancioId}/voci/${voceId}`);
      notifica('Voce eliminata');
      if (voceInModifica?.voce === voceId) setVoceInModifica(null);
      await bilanci.ricarica();
    } catch (e) {
      notifica(e instanceof ApiError ? e.message : 'Eliminazione non riuscita', 'errore');
    }
  }

  return (
    <RichiediCondominio>
      {conferma}
      <TitoloPagina
        titolo="Bilanci"
        descrizione="Preventivo e consuntivo dell'anno selezionato."
        azioni={
          <div className="riga">
            {bilanci.dati !== null && bilanci.dati.length > 0 && <PulsanteStampa etichetta="Stampa / PDF" />}
            <label className="visually-hidden" htmlFor="anno-bilancio">
              Anno
            </label>
            <select
              id="anno-bilancio"
              className="area"
              value={anno}
              onChange={(e) => setAnno(Number(e.target.value))}
            >
              {anni.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {bilanci.inCorso && bilanci.dati === null && <Caricamento />}
      {bilanci.errore && <ErroreCaricamento messaggio={bilanci.errore} onRiprova={bilanci.ricarica} />}

      {bilanci.dati !== null && !bilanci.inCorso && (
        <AreaStampa>
          <h1 className="visually-hidden">Bilanci {anno}</h1>
          <div className="pila-4">
{bilanci.dati.length === 0 && (
              <PaginaVuota
                titolo={`Nessun bilancio per il ${anno}`}
                descrizione="Crea il preventivo dell'anno: è la base su cui si calcolano le quote dovute ai condòmini."
              />
            )}

            {puoScrivere && !preventivo && (
              <section className="scheda">
                <div className="scheda-corpo pila-2">
                  <p className="testo-muto">
                    Il preventivo {anno} non esiste ancora. Si crea vuoto, poi si aggiungono le voci
                    una alla volta.
                  </p>
                  <button type="button" className="btn btn-primario" onClick={creaPreventivo} disabled={inAzione}>
                    {inAzione ? 'Creazione…' : `Crea preventivo ${anno}`}
                  </button>
                </div>
              </section>
            )}

            {bilanci.dati.map((b) => (
              <SezioneBilancio
                key={b._id}
                bilancio={b}
                puoScrivere={puoScrivere}
                voceInModifica={voceInModifica}
                nuovaVoce={nuovaVoce}
                setVoceInModifica={setVoceInModifica}
                setNuovaVoce={setNuovaVoce}
                onElimina={eliminaVoce}
                onRicarica={bilanci.ricarica}
                onModifica={setBilancioInModifica}
                onApprova={approva}
                onEliminaBilancio={eliminaBilancio}
                inAzione={inAzione}
              />
            ))}

          {preventivo && !consuntivo && puoScrivere && (
            <section className="scheda">
              <div className="scheda-corpo">
                <p className="testo-muto">
                  Il consuntivo {preventivo.anno} si genera dal preventivo approvato: le voci vengono
                  copiate con l&apos;importo previsto e gli importi si correggono uno alla volta man mano
                  che le fatture arrivano.
                </p>
                {preventivo.approvato ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={generaConsuntivo}
                    disabled={consuntivoInCorso}
                  >
                    {consuntivoInCorso ? 'Generazione…' : `Genera consuntivo ${preventivo.anno}`}
                  </button>
                ) : (
                  <p className="testo-faint testo-faint-blocco">
                    Approva prima il preventivo {preventivo.anno} in assemblea: il consuntivo documenta
                    l&apos;andamento di un preventivo già ratificato.
                  </p>
                )}
              </div>
            </section>
          )}

          {consuntivo && (
            <section className="scheda">
              <div className="scheda-intestazione">
                <h2>Andamento {consuntivo.anno}</h2>
              </div>
              <div className="elenco">
                <div className="voce riga-tra">
                  <span>Previsto</span>
                  <span className="testo-num">{euro(totalePrevisto)}</span>
                </div>
                <div className="voce riga-tra">
                  <span>Realizzato</span>
                  <span className="testo-num">{euro(consuntivo.totale)}</span>
                </div>
                <div className="voce riga-tra">
                  <strong>Scostamento</strong>
                  <strong className={`testo-num ${scostamentoTotale.valore > 0 ? 'testo-warning' : 'testo-success'}`}>
                    {scostamentoTotale.valore > 0 ? '+' : ''}
                    {euro(scostamentoTotale.valore)}
                    {scostamentoTotale.percentuale !== null && ` (${scostamentoTotale.percentuale > 0 ? '+' : ''}${scostamentoTotale.percentuale}%)`}
                  </strong>
                </div>
              </div>
            </section>
          )}
          </div>
        </AreaStampa>
      )}

      {bilancioInModifica && (
        <ModificaBilancio
          bilancio={bilancioInModifica}
          onChiudi={() => setBilancioInModifica(null)}
          onSalvato={async () => {
            setBilancioInModifica(null);
            await bilanci.ricarica();
          }}
        />
      )}
    </RichiediCondominio>
  );
}

/** Una scheda per ogni documento dell'anno, con le voci modificabili una alla volta. */
function SezioneBilancio({
  bilancio,
  puoScrivere,
  voceInModifica,
  nuovaVoce,
  setVoceInModifica,
  setNuovaVoce,
  onElimina,
  onRicarica,
  onModifica,
  onApprova,
  onEliminaBilancio,
  inAzione,
}: {
  bilancio: Bilancio;
  puoScrivere: boolean;
  voceInModifica: { bilancio: string; voce: string } | null;
  nuovaVoce: { bilancio: string } | null;
  setVoceInModifica: (v: { bilancio: string; voce: string } | null) => void;
  setNuovaVoce: (v: { bilancio: string } | null) => void;
  onElimina: (bilancioId: string, voceId: string, descrizione: string) => void;
  onRicarica: () => void;
  onModifica: (bilancio: Bilancio) => void;
  onApprova: (bilancio: Bilancio, approvato: boolean) => void;
  onEliminaBilancio: (bilancio: Bilancio) => void;
  inAzione: boolean;
}) {
  const { condominioId } = useAuth();
  const consuntivo = bilancio.tipo === 'consuntivo';
  // Un bilancio approvato è ratificato dall'assemblea: dopo, non si tocca.
  const modificabile = puoScrivere && !bilancio.approvato;

  return (
    <section className="scheda">
      <div className="scheda-intestazione">
        <h2>
          {consuntivo ? 'Consuntivo' : 'Preventivo'} {bilancio.anno}
        </h2>
        <div className="riga">
          {bilancio.approvato && <EtichettaStato stato="approvato" />}
          {modificabile && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setNuovaVoce(nuovaVoce?.bilancio === bilancio._id ? null : { bilancio: bilancio._id })}
            >
              {nuovaVoce?.bilancio === bilancio._id ? 'Annulla' : '+ Voce'}
            </button>
          )}
          {puoScrivere && (
            <>
              <button
                type="button"
                className="btn btn-sm btn-fantasma"
                onClick={() => onApprova(bilancio, !bilancio.approvato)}
                disabled={inAzione}
                title={
                  bilancio.approvato
                    ? 'Revoca: il bilancio torna modificabile'
                    : 'Approva: il bilancio diventa ratificato e non più modificabile'
                }
              >
                {bilancio.approvato ? 'Revoca approvazione' : 'Approva'}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-fantasma"
                onClick={() => onModifica(bilancio)}
                disabled={inAzione || bilancio.approvato}
                aria-label={`Modifica i dati del bilancio ${bilancio.anno}`}
              >
                Modifica
              </button>
              {!bilancio.approvato && (
                <button
                  type="button"
                  className="btn btn-sm btn-pericolo"
                  onClick={() => onEliminaBilancio(bilancio)}
                  disabled={inAzione}
                >
                  Elimina
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="elenco">
        {bilancio.voci.length === 0 && (
          <p className="testo-faint testo-faint-blocco">Nessuna voce: il totale è zero.</p>
        )}

        {bilancio.voci.map((v) => {
          const inModifica = voceInModifica?.bilancio === bilancio._id && voceInModifica.voce === v._id;
          const delta = consuntivo && v.previsto !== undefined ? scostamento(v.previsto, v.importo) : null;

          if (inModifica) {
            return (
              <ModuloVoce
                key={v._id}
                iniziale={v}
                mostraPrevisto={consuntivo}
                onSalva={async (campi) => {
                  await api.patch(`/condomini/${condominioId}/bilanci/${bilancio._id}/voci/${v._id}`, campi);
                  notifica('Voce aggiornata');
                }}
                onAnnulla={() => setVoceInModifica(null)}
                onSalvato={onRicarica}
              />
            );
          }

          return (
            <div key={v._id} className="voce">
              <span className="cresci pila-1">
                <strong>{v.descrizione}</strong>
                <span className="testo-faint">
                  {ETICHETTE_CATEGORIA[v.categoria] ?? v.categoria} ·{' '}
                  {ETICHETTE_RIPARTIZIONE[v.ripartizione] ?? v.ripartizione}
                  {v.voci.length > 0 ? ` · ${v.voci.length} fatture` : ''}
                  {v.allegati.length > 0 ? ` · ${v.allegati.length} allegati` : ''}
                </span>
                {delta && (
                  <span className={delta.valore > 0 ? 'testo-warning' : 'testo-success'}>
                    {delta.valore > 0 ? '+' : ''}
                    {euro(delta.valore)} sul previsto di {euro(v.previsto ?? 0)}
                  </span>
                )}
              </span>

              <span className="riga">
                <span className="testo-num">{euro(v.importo)}</span>
                {modificabile && v._id && (
                  <>
                    {/* Icona invece che testo: la riga ha già l'importo e due
                        bottoni, e il conteggio degli allegati serve più del nome
                        del pulsante. Il dettaglio si vede aprendo la finestra. */}
                    <AllegatiBottone
                      endpoint={`/condomini/${condominioId}/bilanci/${bilancio._id}/voci/${v._id}/allegati`}
                      conteggio={v.allegati.length}
                      titolo={`Allegati a "${v.descrizione}"`}
                      descrizione={`Allegati di ${v.descrizione}`}
                      suCambiati={onRicarica}
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-fantasma"
                      onClick={() => setVoceInModifica({ bilancio: bilancio._id, voce: v._id! })}
                      aria-label={`Modifica ${v.descrizione}`}
                    >
                      Modifica
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-pericolo"
                      onClick={() => onElimina(bilancio._id, v._id!, v.descrizione)}
                      aria-label={`Elimina ${v.descrizione}`}
                    >
                      Elimina
                    </button>
                  </>
                )}
              </span>
            </div>
          );
        })}

        {nuovaVoce?.bilancio === bilancio._id && (
          <ModuloVoce
            iniziale={VOCE_VUOTA}
            mostraPrevisto={false}
            onSalva={async (campi) => {
              await api.post(`/condomini/${condominioId}/bilanci/${bilancio._id}/voci`, campi);
              notifica('Voce aggiunta');
            }}
            onAnnulla={() => setNuovaVoce(null)}
            onSalvato={onRicarica}
          />
        )}

        <div className="voce riga-tra">
          <strong>Totale annuo</strong>
          <strong className="testo-num">{euro(bilancio.totale)}</strong>
        </div>
        <div className="voce riga-tra">
          <span className="testo-faint testo-faint-blocco">Ripartizione mensile</span>
          <span className="testo-faint testo-num">{euro(bilancio.totale / 12)}</span>
        </div>
      </div>
    </section>
  );
}

/**
 * Modifica dei dati del bilancio: descrizione e note.
 *
 * Anno e tipo non sono editabili: sono la chiave del documento (l'indice
 * univoco li usa) e cambiare il tipo in un anno che ha già il consuntivo
 * lascerebbe due documenti incompatibili.
 */
function ModificaBilancio({
  bilancio,
  onChiudi,
  onSalvato,
}: {
  bilancio: Bilancio;
  onChiudi: () => void;
  onSalvato: () => void;
}) {
  const { condominioId } = useAuth();
  const [descrizione, setDescrizione] = useState(bilancio.descrizione ?? '');
  const [note, setNote] = useState(bilancio.note ?? '');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function salva() {
    setErrore(null);
    setInCorso(true);
    try {
      await api.patch(`/condomini/${condominioId}/bilanci/${bilancio._id}`, {
        descrizione: descrizione.trim(),
        note: note.trim(),
      });
      notifica('Bilancio aggiornato');
      onSalvato();
    } catch (e) {
      setErrore(e instanceof ApiError ? (e.primoErroreValidazione ?? e.message) : 'Salvataggio non riuscito');
      setInCorso(false);
    }
  }

  return (
    <div className="velo" role="presentation" onClick={onChiudi}>
      <div
        className="scheda"
        role="dialog"
        aria-modal="true"
        aria-label={`Modifica bilancio ${bilancio.anno}`}
        style={{ width: 'min(34rem, 94vw)', maxHeight: '92dvh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scheda-intestazione">
          <h2>
            Dati del bilancio {bilancio.anno} ·{' '}
            {bilancio.tipo === 'consuntivo' ? 'consuntivo' : 'preventivo'}
          </h2>
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
            <label className="campo-etichetta" htmlFor="mb-descrizione">
              Descrizione
            </label>
            <input
              id="mb-descrizione"
              className="area"
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              placeholder="Es. preventivo deliberato dall'assemblea del 12 marzo"
              maxLength={500}
            />
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="mb-note">
              Note
            </label>
            <textarea
              id="mb-note"
              className="area"
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={4000}
            />
          </div>

          <div className="riga">
            <button type="button" className="btn btn-primario cresci" onClick={salva} disabled={inCorso}>
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

/**
 * Form di una singola voce, aperto al posto della riga che sta modificando.
 *
 * Sta inline nella lista invece che in una finestra: si vede la voce accanto
 * alle altre mentre la si corregge, e non si deve ricordare quale riga del
 * form generale era in editing.
 */
function ModuloVoce({
  iniziale,
  mostraPrevisto,
  onSalva,
  onAnnulla,
  onSalvato,
}: {
  iniziale: VoceBilancio;
  mostraPrevisto: boolean;
  onSalva: (campi: Partial<VoceBilancio>) => Promise<void>;
  onAnnulla: () => void;
  onSalvato: () => void;
}) {
  const [categoria, setCategoria] = useState<CategoriaBilancio>(iniziale.categoria);
  const [descrizione, setDescrizione] = useState(iniziale.descrizione);
  const [importo, setImporto] = useState(String(iniziale.importo ?? 0));
  const [previsto, setPrevisto] = useState(String(iniziale.previsto ?? 0));
  const [ripartizione, setRipartizione] = useState<RipartizioneBilancio>(iniziale.ripartizione);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const completo = descrizione.trim().length > 0;

  async function salva() {
    setErrore(null);
    setInCorso(true);
    try {
      await onSalva({
        categoria,
        descrizione: descrizione.trim(),
        importo: Number(importo) || 0,
        ...(mostraPrevisto ? { previsto: Number(previsto) || 0 } : {}),
        ripartizione,
      });
      onAnnulla();
      onSalvato();
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Salvataggio non riuscito');
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="voce" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
      <div className="riga">
        <div className="cresci">
          <label className="campo-etichetta" htmlFor={`voce-cat-${iniziale._id ?? 'nuova'}`}>
            Categoria
          </label>
          <select
            id={`voce-cat-${iniziale._id ?? 'nuova'}`}
            className="area"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as CategoriaBilancio)}
          >
            {CATEGORIE_BILANCIO.map((c) => (
              <option key={c} value={c}>
                {ETICHETTE_CATEGORIA[c] ?? c}
              </option>
            ))}
          </select>
        </div>
        <div className="cresci">
          <label className="campo-etichetta" htmlFor={`voce-rip-${iniziale._id ?? 'nuova'}`}>
            Ripartizione
          </label>
          <select
            id={`voce-rip-${iniziale._id ?? 'nuova'}`}
            className="area"
            value={ripartizione}
            onChange={(e) => setRipartizione(e.target.value as RipartizioneBilancio)}
          >
            {RIPARTIZIONI_BILANCIO.map((r) => (
              <option key={r} value={r}>
                {ETICHETTE_RIPARTIZIONE[r] ?? r}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="campo">
        <label className="campo-etichetta" htmlFor={`voce-desc-${iniziale._id ?? 'nuova'}`}>
          Descrizione
        </label>
        <input
          id={`voce-desc-${iniziale._id ?? 'nuova'}`}
          className="area"
          value={descrizione}
          onChange={(e) => setDescrizione(e.target.value)}
          placeholder="Es. manutenzione dello scalone"
          maxLength={300}
        />
      </div>

      <div className="riga">
        {mostraPrevisto && (
          <div className="cresci">
            <label className="campo-etichetta" htmlFor={`voce-prev-${iniziale._id ?? 'nuova'}`}>
              Importo previsto
            </label>
            <input
              id={`voce-prev-${iniziale._id ?? 'nuova'}`}
              className="area"
              type="number"
              min="0"
              step="0.01"
              value={previsto}
              onChange={(e) => setPrevisto(e.target.value)}
            />
          </div>
        )}
        <div className="cresci">
          <label className="campo-etichetta" htmlFor={`voce-imp-${iniziale._id ?? 'nuova'}`}>
            {mostraPrevisto ? 'Importo realizzato' : 'Importo annuo'}
          </label>
          <input
            id={`voce-imp-${iniziale._id ?? 'nuova'}`}
            className="area"
            type="number"
            min="0"
            step="0.01"
            value={importo}
            onChange={(e) => setImporto(e.target.value)}
          />
        </div>
      </div>

      {errore && <p className="campo-errore">{errore}</p>}

      <div className="riga riga-tra">
        <button type="button" className="btn btn-fantasma" onClick={onAnnulla} disabled={inCorso}>
          Annulla
        </button>
        <button type="button" className="btn" onClick={salva} disabled={inCorso || !completo}>
          {inCorso ? 'Salvataggio…' : 'Salva voce'}
        </button>
      </div>
    </div>
  );
}
