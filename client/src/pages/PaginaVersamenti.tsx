import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/hooks/useApi';
import { api } from '@/api/client';
import { Caricamento, ErroreCaricamento, PaginaVuota } from '@/components/Feedback';
import { TitoloPagina, RichiediCondominio } from '@/components/TitoloPagina';
import { euro, data as fmtData, mese, numero } from '@/lib/formattazione';
import type { ApiEnvelope, RiepilogoQuote, Versamento } from '@/types/domain';

/** Vista del condòmino: quanto deve, cosa ha versato, storico. */
export default function PaginaVersamenti() {
  const { condominioId } = useAuth();
  const ora = new Date();
  const [anno, setAnno] = useState(ora.getFullYear());
  const [meseSelezionato, setMeseSelezionato] = useState(ora.getMonth() + 1);

  const quote = useApi<RiepilogoQuote>(
    (segnale) =>
      api
        .get<RiepilogoQuote>(
          `/condomini/${condominioId}/versamenti/quote`,
          { anno, mese: meseSelezionato },
          { signal: segnale },
        )
        .then((r) => r.data),
    [condominioId, anno, meseSelezionato],
    { attivo: Boolean(condominioId) },
  );

  const storico = useApi<ApiEnvelope<{ documenti: Versamento[]; totaleImporti: number }>>(
    (segnale) =>
      api.get(`/condomini/${condominioId}/versamenti`, { page: 1, limit: 30, anno }, { signal: segnale }),
    [condominioId, anno],
    { attivo: Boolean(condominioId) },
  );

  if (!condominioId) return null;

  const q = quote.dati;
  const anni = [ora.getFullYear() - 2, ora.getFullYear() - 1, ora.getFullYear(), ora.getFullYear() + 1];

  return (
    <RichiediCondominio>
      <TitoloPagina titolo="Le mie quote" descrizione="Importi dovuti e versamenti effettuati." />

      <div className="riga" style={{ marginBottom: 'var(--sp-3)' }}>
        <div className="campo cresci">
          <label className="campo-etichetta" htmlFor="anno-v">
            Anno
          </label>
          <select id="anno-v" className="area" value={anno} onChange={(e) => setAnno(Number(e.target.value))}>
            {anni.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="campo cresci">
          <label className="campo-etichetta" htmlFor="mese-v">
            Mese
          </label>
          <select
            id="mese-v"
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

      {quote.inCorso && <Caricamento />}
      {quote.errore && <ErroreCaricamento messaggio={quote.errore} onRiprova={quote.ricarica} />}

      {q && (
        <section className="scheda" style={{ marginBottom: 'var(--sp-4)' }}>
          <div className="scheda-intestazione">
            <h2>Quota di {mese(meseSelezionato).toLowerCase()}</h2>
            <span className="etichetta etichetta-info">{q.soloMie ? 'Solo le mie unità' : 'Tutte le unità'}</span>
          </div>
          <div className="scheda-corpo pila-3">
            <div className="riga riga-tra">
              <span className="testo-muto">Totale dovuto</span>
              <strong className="testo-num" style={{ fontSize: 'var(--fs-lg)' }}>
                {euro(q.totaleDovuto)}
              </strong>
            </div>
            <div className="riga riga-tra">
              <span className="testo-muto">Già versato</span>
              <span className="testo-num testo-successo">{euro(q.totaleVersato)}</span>
            </div>
            <div className="riga riga-tra">
              <span className="testo-muto">Da versare</span>
              <strong className={`testo-num ${q.saldo > 0 ? 'testo-danger' : 'testo-successo'}`}>
                {euro(q.saldo)}
              </strong>
            </div>

            {q.righe.map((r) => (
              <details key={r.unitaId} className="riga-tra" style={{ display: 'block' }}>
                <summary style={{ cursor: 'pointer', fontSize: 'var(--fs-sm)' }}>
                  {r.codice} · {numero(r.millesimi)} millesimi · {euro(r.totale)}
                </summary>
                <ul className="elenco" style={{ marginTop: 'var(--sp-2)' }}>
                  {r.voci.map((v, i) => (
                    <li key={`${v.voce}-${i}`} className="voce riga-tra">
                      <span className="testo-faint cresci">{v.voce}</span>
                      <span className="testo-num">{euro(v.importo)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}

            {q.saldo > 0 && (
              <div className="avviso avviso-avviso">
                Versa la quota con bonifico indicando come causale: <strong>Quota {anno}/{meseSelezionato}</strong>.
              </div>
            )}
          </div>
        </section>
      )}

      <section className="scheda">
        <div className="scheda-intestazione">
          <h2>Versamenti {anno}</h2>
          {storico.dati && (
            <span className="etichetta etichetta-neutro">{euro(storico.dati.data.totaleImporti)}</span>
          )}
        </div>
        {storico.inCorso && <Caricamento />}
        {storico.errore && <ErroreCaricamento messaggio={storico.errore} onRiprova={storico.ricarica} />}
        {storico.dati && storico.dati.data.documenti.length === 0 && (
          <PaginaVuota titolo="Nessun versamento registrato" />
        )}
        <div className="elenco">
          {storico.dati?.data.documenti.map((v) => (
            <div key={v._id} className="voce">
              <span className="cresci pila-1">
                <strong>{euro(v.importo)}</strong>
                <span className="testo-faint">
                  {fmtData(v.dataVersamento)} · {v.unita?.codice} · {v.causale ?? 'Quota condominiale'}
                </span>
              </span>
              <span className="etichetta etichetta-successo">
                {v.periodo.mese}/{v.periodo.anno}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="riga" style={{ marginTop: 'var(--sp-4)' }}>
        <Link className="btn btn-secondario" to="/c/comunicazioni">
          Contatta l’amministratore
        </Link>
      </div>
    </RichiediCondominio>
  );
}
