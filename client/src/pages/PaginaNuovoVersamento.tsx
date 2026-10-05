import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/hooks/useApi';
import { api, ApiError } from '@/api/client';
import { notifica } from '@/hooks/useNotifiche';
import { Caricamento, ErroreCaricamento, PaginaVuota } from '@/components/Feedback';
import { useConferma } from '@/components/Conferma';
import { AllegatiSezione } from '@/components/Allegati';
import { etichette } from '@/components/Elementi';
import { TitoloPagina, RichiediCondominio } from '@/components/TitoloPagina';
import { euro, data as fmtData, mese, perInputData } from '@/lib/formattazione';
import type { ApiEnvelope, MetodoPagamento, Unita, Versamento } from '@/types/domain';

const METODI: MetodoPagamento[] = ['bonifico', 'contanti', 'carta', 'addebito_direct', 'altro'];

export default function PaginaNuovoVersamento() {
  const { condominioId } = useAuth();
  const oggi = new Date();
  const [unitaId, setUnitaId] = useState('');
  const [anno, setAnno] = useState(oggi.getFullYear());
  const [meseSelezionato, setMeseSelezionato] = useState(oggi.getMonth() + 1);
  const [importo, setImporto] = useState('');
  const [dataVersamento, setDataVersamento] = useState(perInputData(new Date()));
  const [metodo, setMetodo] = useState<MetodoPagamento>('bonifico');
  const [causale, setCausale] = useState('');
  const [identificativo, setIdentificativo] = useState('');
  const [note, setNote] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [inModifica, setInModifica] = useState<Versamento | null>(null);
  const { chiedi, elemento: conferma } = useConferma();

  const unita = useApi<ApiEnvelope<Unita[]>>(
    (segnale) =>
      api.get<Unita[]>(
        `/condomini/${condominioId}/unita`,
        { page: 1, limit: 100, sort: 'codice', order: 'asc', attiva: true },
        { signal: segnale },
      ),
    [condominioId],
    { attivo: Boolean(condominioId) },
  );

  // Quote del periodo selezionato: servono a proposedre l'importo dovuto.
  const quote = useApi<ApiEnvelope<{ righe: { unitaId: string; totale: number; versato: number; saldo: number }[] }>>(
    (segnale) =>
      api.get(`/condomini/${condominioId}/versamenti/quote`, { anno, mese: meseSelezionato }, { signal: segnale }),
    [condominioId, anno, meseSelezionato],
    { attivo: Boolean(condominioId) && Boolean(unitaId) },
  );

  const ultimi = useApi<ApiEnvelope<{ documenti: Versamento[] }>>(
    (segnale) =>
      api.get(`/condomini/${condominioId}/versamenti`, { page: 1, limit: 5, sort: 'dataVersamento', order: 'desc' }, { signal: segnale }),
    [condominioId],
    { attivo: Boolean(condominioId) },
  );

  if (!condominioId) return null;

  const riga = quote.dati?.data.righe.find((r) => r.unitaId === unitaId);
  const anni = [oggi.getFullYear() - 2, oggi.getFullYear() - 1, oggi.getFullYear(), oggi.getFullYear() + 1];
  const elencoUnita = (stato: { dati: ApiEnvelope<Unita[]> | null }): Unita | undefined =>
    stato.dati?.data.find((u) => u._id === unitaId);

  function sceglieQuota() {
    if (riga) {
      setImporto(String(riga.saldo > 0 ? riga.saldo : riga.totale));
      setCausale(`Quota condominiale ${anno}/${meseSelezionato} - ${elencoUnita(unita)?.codice ?? ''}`);
    }
  }

  async function salva(evento: FormEvent) {
    evento.preventDefault();
    setErrore(null);
    setInCorso(true);
    try {
      await api.post(`/condomini/${condominioId}/versamenti`, {
        unita: unitaId,
        periodo: { anno, mese: meseSelezionato },
        importo: Number(importo),
        dataVersamento,
        metodo,
        causale: causale.trim() || undefined,
        identificativoTransazione: identificativo.trim() || undefined,
        note: note.trim() || undefined,
      });
      notifica('Versamento registrato');
      setImporto('');
      setCausale('');
      setIdentificativo('');
      setNote('');
      quote.ricarica();
      ultimi.ricarica();
    } catch (e) {
      setErrore(
        e instanceof ApiError ? (e.primoErroreValidazione ?? e.message) : 'Salvataggio non riuscito',
      );
    } finally {
      setInCorso(false);
    }
  }

  const valido = unitaId && Number(importo) > 0 && dataVersamento;

  return (
    <RichiediCondominio>
      {conferma}
      <TitoloPagina
        titolo="Registra versamento"
        descrizione="Inserisci un pagamento ricevuto dal condòmino."
        azioni={
          <Link className="btn btn-secondario" to="/c/quote">
            Vedi le quote
          </Link>
        }
      />

      <form onSubmit={salva}>
        <section className="scheda" style={{ marginBottom: 'var(--sp-4)' }}>
          <div className="scheda-intestazione">
            <h2>Unità e periodo</h2>
          </div>
          <div className="scheda-corpo pila-3">
            <div className="campo">
              <label className="campo-etichetta" htmlFor="v-unita">
                Unità immobiliare
              </label>
              {unita.inCorso && <span className="testo-faint">Caricamento…</span>}
              {unita.errore && <span className="campo-errore">{unita.errore}</span>}
              <select
                id="v-unita"
                className="area"
                value={unitaId}
                onChange={(e) => setUnitaId(e.target.value)}
                required
              >
                <option value="">Seleziona…</option>
                {unita.dati?.data.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.codice} — {etichette.tipoUnita(u.tipo)} (piano {u.piano})
                  </option>
                ))}
              </select>
              {unita.dati?.data.length === 0 && (
                <span className="campo-aiuto">Non ci sono unità attive nel condominio.</span>
              )}
            </div>

            <div className="riga">
              <div className="campo cresci">
                <label className="campo-etichetta" htmlFor="v-anno">
                  Anno
                </label>
                <select id="v-anno" className="area" value={anno} onChange={(e) => setAnno(Number(e.target.value))}>
                  {anni.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
              <div className="campo cresci">
                <label className="campo-etichetta" htmlFor="v-mese">
                  Mese
                </label>
                <select
                  id="v-mese"
                  className="area"
                  value={meseSelezionato}
                  onChange={(e) => setMeseSelezionato(Number(e.target.value))}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {mese(m)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {riga && (
              <div className="avviso avviso-info">
                <div className="cresci">
                  <div>
                    Quota dovuta: <strong>{euro(riga.totale)}</strong>
                  </div>
                  <div>
                    Già versato: <strong>{euro(riga.versato)}</strong>
                  </div>
                  <div>
                    Saldo:{' '}
                    <strong className={riga.saldo > 0 ? 'testo-danger' : 'testo-successo'}>
                      {euro(riga.saldo)}
                    </strong>
                  </div>
                </div>
                <button type="button" className="btn btn-secondario btn-sm" onClick={sceglieQuota}>
                  Usa il saldo
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="scheda" style={{ marginBottom: 'var(--sp-4)' }}>
          <div className="scheda-intestazione">
            <h2>Pagamento</h2>
          </div>
          <div className="scheda-corpo pila-3">
            <div className="riga">
              <div className="campo cresci">
                <label className="campo-etichetta" htmlFor="v-importo">
                  Importo (€)
                </label>
                <input
                  id="v-importo"
                  className="area"
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  step="0.01"
                  value={importo}
                  onChange={(e) => setImporto(e.target.value)}
                  required
                />
              </div>
              <div className="campo cresci">
                <label className="campo-etichetta" htmlFor="v-data">
                  Data
                </label>
                <input
                  id="v-data"
                  className="area"
                  type="date"
                  value={dataVersamento}
                  onChange={(e) => setDataVersamento(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="campo">
              <label className="campo-etichetta" htmlFor="v-metodo">
                Metodo di pagamento
              </label>
              <select
                id="v-metodo"
                className="area"
                value={metodo}
                onChange={(e) => setMetodo(e.target.value as MetodoPagamento)}
              >
                {METODI.map((m) => (
                  <option key={m} value={m}>
                    {etichette.metodo(m)}
                  </option>
                ))}
              </select>
            </div>

            <div className="campo">
              <label className="campo-etichetta" htmlFor="v-causale">
                Causale
              </label>
              <input
                id="v-causale"
                className="area"
                value={causale}
                onChange={(e) => setCausale(e.target.value)}
                placeholder="Quota condominiale 2026/09 - A1"
              />
            </div>

            <div className="campo">
              <label className="campo-etichetta" htmlFor="v-ident">
                Identificativo transazione
              </label>
              <input
                id="v-ident"
                className="area"
                value={identificativo}
                onChange={(e) => setIdentificativo(e.target.value)}
                placeholder="Codice IBAN o identificativo bonifico"
              />
              <span className="campo-aiuto">Se indicato, non potranno esserci due versamenti con lo stesso valore.</span>
            </div>

            <div className="campo">
              <label className="campo-etichetta" htmlFor="v-note">
                Note
              </label>
              <textarea
                id="v-note"
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

            <button type="submit" className="btn btn-primario btn-pieno btn-grande margine-sopra" disabled={inCorso || !valido}>
              {inCorso ? 'Registrazione…' : 'Registra versamento'}
            </button>
          </div>
        </section>
      </form>

      <section className="scheda">
        <div className="scheda-intestazione">
          <h2>Ultimi versamenti</h2>
        </div>
        {ultimi.inCorso && <Caricamento />}
        {ultimi.errore && <ErroreCaricamento messaggio={ultimi.errore} onRiprova={ultimi.ricarica} />}
        {ultimi.dati && ultimi.dati.data.documenti.length === 0 && (
          <PaginaVuota titolo="Nessun versamento registrato" />
        )}
        <div className="elenco">
          {ultimi.dati?.data.documenti.map((v) => (
            <div key={v._id} className="voce">
              <span className="cresci pila-1">
                <strong>{euro(v.importo)}</strong>
                <span className="testo-faint">
                  {fmtData(v.dataVersamento)} · unità {v.unita?.codice} · {etichette.metodo(v.metodo)}
                </span>
              </span>
              <span className="etichetta etichetta-neutro">
                {v.periodo.mese}/{v.periodo.anno}
              </span>
              <button
                type="button"
                className="btn btn-fantasma btn-sm"
                onClick={() => setInModifica(v)}
                aria-label={`Modifica il versamento del ${fmtData(v.dataVersamento)}`}
              >
                Modifica
              </button>
              <button
                type="button"
                className="btn btn-pericolo btn-sm"
                onClick={() => elimina(v)}
                aria-label={`Elimina il versamento del ${fmtData(v.dataVersamento)}`}
              >
                Elimina
              </button>
            </div>
          ))}
        </div>
      </section>

      {inModifica && (
        <ModificaVersamento
          versamento={inModifica}
          onChiudi={() => setInModifica(null)}
          onSalvato={() => {
            setInModifica(null);
            ultimi.ricarica();
            quote.ricarica();
          }}
        />
      )}
    </RichiediCondominio>
  );

  /**
   * Elimina un versamento.
   *
   * Il saldo del periodo torna a crescere, quindi l'operazione va confermata:
   * è un pagamento reale, non una voce di una bozza.
   */
  async function elimina(v: Versamento) {
    const confermato = await chiedi({
      titolo: 'Eliminare il versamento',
      messaggio: `Stai eliminando il versamento di ${euro(v.importo)} del ${fmtData(v.dataVersamento)} per l'unità ${v.unita?.codice ?? ''}. La quota tornerà a risultare dovuta.`,
      conferma: 'Elimina',
      pericolo: true,
    });
    if (!confermato) return;

    try {
      await api.delete(`/condomini/${condominioId}/versamenti/${v._id}`);
      notifica('Versamento eliminato');
      ultimi.ricarica();
      quote.ricarica();
    } catch (e) {
      notifica(e instanceof ApiError ? e.message : 'Eliminazione non riuscita', 'errore');
    }
  }
}

/**
 * Modifica di un versamento esistente.
 *
 * Unità e periodo non compaiono: `versamentoUpdateSchema` li esclude, perché
 * spostare un pagamento su un'altra unità o su un altro periodo falsificherebbe
 * il saldo storico. Per correggerli serve prima annullare e registrare di nuovo.
 */
function ModificaVersamento({
  versamento,
  onChiudi,
  onSalvato,
}: {
  versamento: Versamento;
  onChiudi: () => void;
  onSalvato: () => void;
}) {
  const { condominioId } = useAuth();
  const [importo, setImporto] = useState(String(versamento.importo));
  const [dataVersamento, setDataVersamento] = useState(perInputData(new Date(versamento.dataVersamento)));
  const [metodo, setMetodo] = useState<MetodoPagamento>(versamento.metodo);
  const [causale, setCausale] = useState(versamento.causale ?? '');
  const [identificativo, setIdentificativo] = useState(versamento.identificativoTransazione ?? '');
  const [note, setNote] = useState(versamento.note ?? '');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  // La quietanza ha bisogno di essere ricaricata dal server dopo ogni
  // aggiunta o rimozione: l'URL è firmato e vale 24 ore, quindi un allegato tenuto
  // in stato scaderebbe con la pagina aperta.
  const [quietanza, setQuietanza] = useState(versamento.allegato ?? null);

  const valido = Number(importo) > 0 && dataVersamento;

  async function ricaricaQuietanza() {
    try {
      const risposta = await api.get<Versamento>(`/condomini/${condominioId}/versamenti/${versamento._id}`);
      setQuietanza(risposta.data.allegato ?? null);
    } catch {
      setQuietanza(null);
    }
  }

  async function salva() {
    setErrore(null);
    setInCorso(true);
    try {
      await api.patch(`/condomini/${condominioId}/versamenti/${versamento._id}`, {
        importo: Number(importo),
        dataVersamento,
        metodo,
        causale: causale.trim() || undefined,
        identificativoTransazione: identificativo.trim() || undefined,
        note: note.trim() || undefined,
      });
      notifica('Versamento aggiornato');
      onSalvato();
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
        aria-label="Modifica versamento"
        style={{ width: 'min(34rem, 94vw)', maxHeight: '92dvh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scheda-intestazione">
          <h2>Modifica versamento</h2>
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

<div className="avviso avviso-info">
            Unità {versamento.unita?.codice} e periodo {versamento.periodo.mese}/{versamento.periodo.anno}: non
            modificabili, perché determinano a quale quota il pagamento va attribuito.
          </div>

          <AllegatiSezione
            endpoint={`/condomini/${condominioId}/versamenti/${versamento._id}/allegato`}
            allegati={[]}
            allegatoSingolo={quietanza}
            onCambiatoSingolo={setQuietanza}
            suCambiati={ricaricaQuietanza}
            puoScrivere
            singolo
            titolo="Quietanza"
          />


          <div className="campo">
            <label className="campo-etichetta" htmlFor="mv-importo">
              Importo (€)
            </label>
            <input
              id="mv-importo"
              className="area"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={importo}
              onChange={(e) => setImporto(e.target.value)}
            />
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="mv-data">
              Data del versamento
            </label>
            <input
              id="mv-data"
              className="area"
              type="date"
              value={dataVersamento}
              onChange={(e) => setDataVersamento(e.target.value)}
            />
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="mv-metodo">
              Metodo
            </label>
            <select
              id="mv-metodo"
              className="area"
              value={metodo}
              onChange={(e) => setMetodo(e.target.value as MetodoPagamento)}
            >
              {METODI.map((m) => (
                <option key={m} value={m}>
                  {etichette.metodo(m)}
                </option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="mv-causale">
              Causale
            </label>
            <input
              id="mv-causale"
              className="area"
              value={causale}
              onChange={(e) => setCausale(e.target.value)}
            />
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="mv-identificativo">
              Identificativo transazione
            </label>
            <input
              id="mv-identificativo"
              className="area"
              value={identificativo}
              onChange={(e) => setIdentificativo(e.target.value)}
            />
            <span className="campo-aiuto">Se indicato, non potranno esserci due versamenti con lo stesso valore.</span>
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="mv-note">
              Note
            </label>
            <textarea
              id="mv-note"
              className="area"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
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