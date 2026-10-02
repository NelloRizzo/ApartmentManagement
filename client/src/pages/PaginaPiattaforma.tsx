import { Link } from 'react-router-dom';
import { useApi } from '@/hooks/useApi';
import { api } from '@/api/client';
import { Caricamento, ErroreCaricamento, PaginaVuota } from '@/components/Feedback';
import { EtichettaStato, Statistica } from '@/components/Elementi';
import { TitoloPagina } from '@/components/TitoloPagina';
import { euro, data as fmtData } from '@/lib/formattazione';
import type { CaricoContratto, RiepilogoPiattaforma } from '@/types/domain';

/**
 * Landing dell'amministratore di piattaforma.
 *
 * Il superadmin non amministra nessun condominio, quindi il panorama di
 * condominio non gli serve e non gli si mostra: questa pagina riprende il suo
 * lavoro, cioè gli amministratori, i contratti e quanto è stato incassato.
 */
export default function PaginaPiattaforma() {
  const riepilogo = useApi<RiepilogoPiattaforma>(
    (segnale) =>
      api
        .get<RiepilogoPiattaforma>('/contratti/piattaforma', undefined, { signal: segnale })
        .then((r) => r.data),
    [],
  );

  const carico = useApi<CaricoContratto[]>(
    (segnale) =>
      api
        .get<CaricoContratto[]>('/contratti/carico', undefined, { signal: segnale })
        .then((r) => r.data),
    [],
  );

  const r = riepilogo.dati;
  const inScadenza = r?.inScadenza ?? [];

  return (
    <>
      <TitoloPagina
        titolo="Dashboard"
        descrizione="Amministratori, contratti di fornitura e incassi."
        azioni={
          <div className="riga">
            <Link className="btn btn-secondario btn-sm" to="/p/amministratori">
              Amministratori
            </Link>
            <Link className="btn btn-primario btn-sm" to="/p/contratti">
              Nuovo contratto
            </Link>
          </div>
        }
      />

      {riepilogo.inCorso && !r && <Caricamento />}
      {riepilogo.errore && <ErroreCaricamento messaggio={riepilogo.errore} onRiprova={riepilogo.ricarica} />}

      {r && (
        <>
          <div className="statistiche">
            <Statistica
              valore={r.amministratori}
              etichetta="Amministratori"
              tono={r.amministratori === 0 ? 'avviso' : 'neutro'}
            />
            <Statistica valore={r.contrattiAttivi} etichetta="Contratti attivi" />
            <Statistica
              valore={r.contrattiSospesi}
              etichetta="Contratti sospesi"
              tono={r.contrattiSospesi > 0 ? 'pericolo' : 'neutro'}
            />
            <Statistica valore={euro(r.incassatoMese)} etichetta="Incassato questo mese" tono="successo" />
            <Statistica valore={euro(r.incassato)} etichetta="Incassato complessivo" />
          </div>

          {inScadenza.length > 0 && (
            <div className="avviso avviso-avviso" style={{ marginTop: 'var(--sp-4)' }} role="status">
              <div>
                <strong>{inScadenza.length === 1 ? 'Un contratto scade' : `${inScadenza.length} contratti scadono`}</strong>{' '}
                entro trenta giorni:
                {inScadenza.map((c) => (
                  <div key={c.contratto}>
                    <Link to={`/p/contratti/${c.contratto}`}>{c.codice}</Link> — tra {c.giorni}{' '}
                    {c.giorni === 1 ? 'giorno' : 'giorni'} ({fmtData(c.scadenza)})
                  </div>
                ))}
              </div>
            </div>
          )}

          {r.amministratori === 0 && (
            <div className="avviso avviso-avviso" style={{ marginTop: 'var(--sp-4)' }}>
              <div>
                Non c'è ancora nessun amministratore.{' '}
                <Link to="/p/amministratori">Crea il primo account</Link>, poi stipula un contratto per
                abilitare la gestione dei condomini.
              </div>
            </div>
          )}
        </>
      )}

      <section className="scheda" style={{ marginTop: 'var(--sp-4)' }}>
        <div className="scheda-intestazione">
          <h2>Contratti e utilizzo della capacità</h2>
        </div>

        {carico.inCorso && carico.dati === null && <Caricamento />}
        {carico.errore && <ErroreCaricamento messaggio={carico.errore} onRiprova={carico.ricarica} />}

        {carico.dati !== null && carico.dati.length === 0 && (
          <div className="scheda-corpo">
            <PaginaVuota
              titolo="Nessun contratto"
              descrizione="Senza contratto un amministratore non può aggiungere unità immobiliari, pur potendo gestire quelle esistenti."
              azione={
                <Link className="btn btn-primario" to="/p/contratti">
                  Stipula un contratto
                </Link>
              }
            />
          </div>
        )}

        {carico.dati !== null && carico.dati.length > 0 && (
          <div className="contenitore-tabella">
            <table className="tabella">
              <thead>
                <tr>
                  <th scope="col">Contratto</th>
                  <th scope="col">Amministratore</th>
                  <th scope="col">Stato</th>
                  <th scope="col">Unità</th>
                  <th scope="col">Scadenza</th>
                </tr>
              </thead>
              <tbody>
                {carico.dati.map((c) => (
                  <tr key={c.contratto}>
                    <th scope="row">
                      <Link to={`/p/contratti/${c.contratto}`}>{c.codice}</Link>
                    </th>
                    <td>{c.amministratore}</td>
                    <td>
                      <EtichettaStato stato={c.stato} />
                    </td>
                    <td className="testo-num">
                      {c.unitaInUso}/{c.unitaMassime}
                      <span className="testo-faint"> · {c.percentualeUtilizzo}%</span>
                    </td>
                    <td className="testo-num">{fmtData(c.scadenza)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
