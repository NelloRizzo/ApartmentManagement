import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/hooks/useApi';
import { api, ApiError } from '@/api/client';
import { notifica } from '@/hooks/useNotifiche';
import { Caricamento, ErroreCaricamento } from '@/components/Feedback';
import { TitoloPagina, RichiediCondominio } from '@/components/TitoloPagina';
import { numero, data as fmtData, perInputData } from '@/lib/formattazione';
import type { RevisioneConVariazioni, Ripartizione, TabellaMillesimale, VariazioneQuota } from '@/types/domain';

const TOTALE_ATTESO = 1000;

interface RigaModificabile {
  unitaId: string;
  codice: string;
  piano: number;
  quote: Partial<Record<Ripartizione, number>>;
}

export default function PaginaTabellaMillesimi() {
  const { condominioId } = useAuth();
  const tabella = useApi<TabellaMillesimale>(
    (segnale) =>
      api
        .get<TabellaMillesimale>(`/condomini/${condominioId}/tabella-millesimi`, undefined, { signal: segnale })
        .then((r) => r.data),
    [condominioId],
    { attivo: Boolean(condominioId) },
  );

  if (!condominioId) return null;

  return (
    <RichiediCondominio>
      <TitoloPagina
        titolo="Quote millesimali"
        descrizione="La somma delle quote di ciascuna ripartizione deve essere pari a 1000 millesimi."
      />
      {tabella.inCorso && <Caricamento />}
      {tabella.errore && <ErroreCaricamento messaggio={tabella.errore} onRiprova={tabella.ricarica} />}
      {tabella.dati && <EditorTabella tabella={tabella.dati} onSalvato={tabella.ricarica} />}
      {tabella.dati && (
        <StoricoRevisioni condominioId={condominioId} revisione={tabella.dati.revisione} />
      )}
    </RichiediCondominio>
  );
}

function EditorTabella({ tabella, onSalvato }: { tabella: TabellaMillesimale; onSalvato: () => void }) {
  const { condominioId } = useAuth();
  const attive = useMemo<Ripartizione[]>(
    () => (tabella.ripartizioniAttive.length ? tabella.ripartizioniAttive : ['diritto']),
    [tabella.ripartizioniAttive],
  );

  const [righe, setRighe] = useState<RigaModificabile[]>([]);
  const [delibera, setDelibera] = useState(tabella.delibera ?? '');
  const [dataDelibera, setDataDelibera] = useState(perInputData(tabella.dataDelibera));
  const [inSalvataggio, setInSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    setRighe(
      tabella.righe.map((r) => ({
        unitaId: r.unitaId,
        codice: r.codice,
        piano: r.piano,
        quote: { ...r.quote },
      })),
    );
    setDelibera(tabella.delibera ?? '');
    setDataDelibera(perInputData(tabella.dataDelibera));
  }, [tabella]);

  // Somme per ripartizione, ricalcolate a ogni modifica.
  const somme = useMemo(() => {
    const acc: Partial<Record<Ripartizione, number>> = {};
    for (const rip of attive) {
      acc[rip] = righe.reduce((s, r) => s + (Number(r.quote[rip]) || 0), 0);
    }
    return acc;
  }, [righe, attive]);

  const problemi = attive.filter((rip) => {
    const t = somme[rip] ?? 0;
    return t > 0 && Math.abs(t - TOTALE_ATTESO) > 0.0001;
  });

  const scartoDi = useCallback(
    (rip: Ripartizione) => Math.round(((somme[rip] ?? 0) - TOTALE_ATTESO) * 100) / 100,
    [somme],
  );

  function aggiornaQuota(unitaId: string, rip: Ripartizione, valore: string) {
    setRighe((precedenti) =>
      precedenti.map((r) =>
        r.unitaId === unitaId
          ? { ...r, quote: { ...r.quote, [rip]: valore === '' ? undefined : Number(valore) } }
          : r,
      ),
    );
  }

  async function salva() {
    setErrore(null);
    setInSalvataggio(true);
    try {
      await api.post(`/condomini/${condominioId}/tabella-millesimi`, {
        delibera: delibera || undefined,
        dataDelibera: dataDelibera || undefined,
        // Vengono inviate solo le ripartizioni effettivamente in uso: il modulo
        // di edit le carica tutte a zero e reinviarle creerebbe ripartizioni
        // azzerate che l'amministratore non ha mai configurato.
        righe: righe.map((r) => ({
          unitaId: r.unitaId,
          quote: Object.fromEntries(
            attive
              .filter((rip) => r.quote[rip] !== undefined && r.quote[rip] !== null)
              .map((rip) => [rip, r.quote[rip]]),
          ),
        })),
      });
      notifica('Nuova revisione della tabella millesimali salvata');
      onSalvato();
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Salvataggio non riuscito');
    } finally {
      setInSalvataggio(false);
    }
  }

  /** Ridistribuisce lo scarto sulla ripartizione indicata, in modo proporzionale. */
  function bilancia(rip: Ripartizione) {
    const scarto = scartoDi(rip);
    if (scarto === 0) return;
    const totale = somme[rip] ?? 0;
    if (totale <= 0) return;

    setRighe((precedenti) => {
      let residuo = -scarto;
      return precedenti.map((r, i) => {
        if (residuo === 0) return r;
        const valore = Number(r.quote[rip]) || 0;
        const quota = valore / totale;
        // L'ultima riga assorbe quanto resta, così la somma torna esatta.
        const correzione = i === precedenti.length - 1 ? residuo : Math.round(scarto * quota * 100) / 100;
        residuo = Math.round((residuo - correzione) * 100) / 100;
        return { ...r, quote: { ...r.quote, [rip]: Math.max(0, Math.round((valore + correzione) * 100) / 100) } };
      });
    });
  }

  return (
    <>
      <div className="riga riga-tra" style={{ marginBottom: 'var(--sp-3)' }}>
        <span className="etichetta etichetta-info">Revisione {tabella.revisione}</span>
        {problemi.length === 0 ? (
          <span className="etichetta etichetta-successo">Tabella valida</span>
        ) : (
          <span className="etichetta etichetta-pericolo">
            {problemi.length} ripartizioni{problemi.length === 1 ? '' : ''} non valide
          </span>
        )}
      </div>

      <div className="contenitore-tabella" style={{ marginBottom: 'var(--sp-4)' }}>
        <table className="tabella">
          <thead>
            <tr>
              <th>Unità</th>
              <th className="num">Piano</th>
              {attive.map((rip) => (
                <th key={rip} className="num">
                  {rip}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => (
              <tr key={r.unitaId}>
                <td>
                  <strong>{r.codice}</strong>
                </td>
                <td className="num">{r.piano}</td>
                {attive.map((rip) => (
                  <td key={rip} className="num">
                    {/*
                      Il simbolo dei millesimi va dopo il campo e non dentro: dentro
                      l'utente potrebbe digitarlo, e il campo è un `number` che
                      rifiuterebbe la lettera senza spiegare perché. `aria-hidden`
                      perché l'`aria-label` del campo dice già di che quota si tratta
                      e il simbolo ripetuto su ogni riga non aggiungerebbe nulla a
                      chi lo ascolta.
                    */}
                    <span className="riga" style={{ justifyContent: 'flex-end' }}>
                      <input
                        className="area"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={1000}
                        step="0.001"
                        value={r.quote[rip] ?? ''}
                        onChange={(e) => aggiornaQuota(r.unitaId, rip, e.target.value)}
                        style={{ width: '5.5rem', textAlign: 'right', minHeight: '2.25rem', padding: '0.2rem 0.4rem' }}
                        aria-label={`${r.codice} quota ${rip}`}
                      />
                      <span aria-hidden="true" className="testo-faint">
                        ‰
                      </span>
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>
                <strong>Totale</strong>
              </td>
              {attive.map((rip) => {
                const ok = Math.abs((somme[rip] ?? 0) - TOTALE_ATTESO) < 0.0001;
                return (
                  <td key={rip} className="num">
                    <strong className={ok ? 'testo-successo' : 'testo-danger'}>
                      {numero(somme[rip] ?? 0)}
                    </strong>
                    {!ok && (
                      <div className="testo-faint">
                        {scartoDi(rip) > 0 ? '+' : ''}
                        {scartoDi(rip)}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      {problemi.length > 0 && (
        <div className="avviso avviso-avviso pila-3" style={{ marginBottom: 'var(--sp-4)' }}>
          <strong>Le somme devono raggiungere 1000 millesimi.</strong>
          {problemi.map((rip) => (
            <div key={rip} className="riga riga-tra">
              <span>
                {rip}: scarto di {scartoDi(rip) > 0 ? '+' : ''}
                {scartoDi(rip)} millesimi
              </span>
              <button type="button" className="btn btn-secondario btn-sm" onClick={() => bilancia(rip)}>
                Bilancia
              </button>
            </div>
          ))}
        </div>
      )}

      <section className="scheda" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="scheda-intestazione">
          <h2>Delibera di approvazione</h2>
        </div>
        <div className="scheda-corpo pila-3">
          <div className="campo">
            <label className="campo-etichetta" htmlFor="delibera">
              Riferimento alla delibera
            </label>
            <input
              id="delibera"
              className="area"
              value={delibera}
              onChange={(e) => setDelibera(e.target.value)}
              placeholder="Delibera assemblea del 15/03/2024 n. 12/2024"
            />
          </div>
          <div className="campo">
            <label className="campo-etichetta" htmlFor="data-delibera">
              Data della delibera
            </label>
            <input
              id="data-delibera"
              className="area"
              type="date"
              value={dataDelibera}
              onChange={(e) => setDataDelibera(e.target.value)}
            />
          </div>
{tabella.dataDelibera && (
          <p className="testo-faint">
            Delibera attuale del {fmtData(tabella.dataDelibera)}.{' '}
            {/*
              Il testo diceva che la revisione precedente resta "consultabile nello
              storico", e non lo è: non c'è nessuno storico nell'interfaccia. La
              revisione precedente viene però conservata davvero, perché
              `nuovaRevisione` chiude la precedente con `validTo` e inserisce la
              nuova con `revisione + 1`, quindi dire "conservata" è vero e
              "consultabile" non lo era. Va mostrata solo quando esiste una schermata
              che la mostra:vedi il punto 4 di `TODO.md`.
            */}
            Salvando, la revisione precedente resta conservata.
          </p>
        )}
        </div>
      </section>

      {errore && (
        <div className="avviso avviso-pericolo" style={{ marginBottom: 'var(--sp-3)' }} role="alert">
          {errore}
        </div>
      )}

      <button
        type="button"
        className="btn btn-primario btn-pieno btn-grande"
        onClick={salva}
        disabled={inSalvataggio || problemi.length > 0}
      >
        {inSalvataggio
          ? 'Salvataggio…'
          : problemi.length > 0
            ? 'Correggi le somme per salvare'
            : `Salva come revisione ${tabella.revisione + 1}`}
      </button>
    </>
  );
}

/**
 * Storico delle revisioni, chiuso per impostazione predefinita: le revisioni
 * passate servono di rado, e aperte spingerebbero fuori schermo la tabella in
 * vigore. Mostra le sole variazioni rispetto alla revisione precedente, non la
 * tabella intera, perché la domanda è "cosa è cambiato", non "com'era".
 */
function StoricoRevisioni({ condominioId, revisione }: { condominioId: string; revisione: number }) {
  const storico = useApi<RevisioneConVariazioni[]>(
    (segnale) =>
      api
        .get<RevisioneConVariazioni[]>(
          `/condomini/${condominioId}/tabella-millesimi/revisioni/variazioni`,
          undefined,
          { signal: segnale },
        )
        .then((r) => r.data),
    [condominioId, revisione],
  );

  return (
    <details className="scheda" style={{ marginTop: 'var(--sp-4)' }}>
      <summary
        style={{
          cursor: 'pointer',
          padding: 'var(--sp-3) var(--sp-4)',
          background: 'var(--c-surface-alt)',
          borderBottom: '1px solid var(--c-border)',
        }}
      >
        <strong>Storico delle revisioni</strong>
        {storico.dati && (
          <span className="etichetta etichetta-neutro" style={{ marginLeft: 'var(--sp-2)' }}>
            {storico.dati.length}
          </span>
        )}
      </summary>
      <div className="scheda-corpo pila-3">
        {storico.inCorso && <Caricamento />}
        {storico.errore && <ErroreCaricamento messaggio={storico.errore} onRiprova={storico.ricarica} />}
        {storico.dati && storico.dati.length === 0 && (
          <p className="testo-muto">Nessuna revisione registrata.</p>
        )}
        {storico.dati?.map((rev) => <BloccoRevisione key={rev.revisione} rev={rev} />)}
      </div>
    </details>
  );
}

function BloccoRevisione({ rev }: { rev: RevisioneConVariazioni }) {
  // Le revisioni iniziano da 1 e sono contigue, quindi la 1 è sempre quella che
  // ha istituito la tabella e non ha una precedente con cui confrontarsi.
  const istitutiva = rev.revisione === 1;
  const nessunCambiamento =
    rev.variazioni.length === 0 && rev.entrate.length === 0 && rev.uscite.length === 0;

  return (
    <div className="pila-2" style={{ borderTop: '1px solid var(--c-border)', paddingTop: 'var(--sp-3)' }}>
      <div className="riga riga-tra">
        <strong>Revisione {rev.revisione}</strong>
        <span className="testo-faint">
          dal {fmtData(rev.validFrom)}
          {rev.validTo ? ` al ${fmtData(rev.validTo)}` : ' — in vigore'}
        </span>
      </div>
      {(rev.delibera || rev.dataDelibera) && (
        <p className="testo-faint">
          {rev.delibera}
          {rev.dataDelibera ? ` (${fmtData(rev.dataDelibera)})` : ''}
        </p>
      )}

      {istitutiva && <p className="testo-muto">Istituzione della tabella millesimale.</p>}
      {!istitutiva && nessunCambiamento && (
        <p className="testo-muto">Nessuna variazione rispetto alla revisione precedente.</p>
      )}

      {rev.variazioni.map((v) => (
        <div key={v.unitaId} className="pila-1">
          <strong>{v.codice}</strong>
          {v.quote.map((q) => (
            <div key={q.ripartizione} className="riga riga-tra">
              <span className="testo-muto">{q.ripartizione}</span>
              <span className="testo-num">{transizione(q)}</span>
            </div>
          ))}
        </div>
      ))}

      {rev.entrate.length > 0 && (
        <p className="testo-muto">
          {istitutiva ? 'Unità' : 'Unità entrate'}: {rev.entrate.map((u) => u.codice).join(', ')}
        </p>
      )}
      {rev.uscite.length > 0 && (
        <p className="testo-muto">Unità uscite: {rev.uscite.map((u) => u.codice).join(', ')}</p>
      )}
    </div>
  );
}

/** "assente → 120,5‰" oppure "200‰ → rimossa". */
function transizione(q: VariazioneQuota): string {
  const da = q.da === null ? 'assente' : `${numero(q.da)}‰`;
  const a = q.a === null ? 'rimossa' : `${numero(q.a)}‰`;
  return `${da} → ${a}`;
}
