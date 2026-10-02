import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/hooks/useApi';
import { api } from '@/api/client';
import { Caricamento, ErroreCaricamento, PaginaVuota } from '@/components/Feedback';
import { EtichettaStato } from '@/components/Elementi';
import { TitoloPagina } from '@/components/TitoloPagina';
import { euro, data as fmtData, dataOra } from '@/lib/formattazione';
import type { MioStatoContratto, MessaggioPiattaforma } from '@/types/domain';

/** Vista del contratto dal punto di vista dell'amministratore di condominio. */
export default function PaginaMioContratto() {
  const { utente } = useAuth();

  const stato = useApi<MioStatoContratto>(
    (segnale) =>
      api.get<MioStatoContratto>('/contratti/mio-stato', undefined, { signal: segnale }).then((r) => r.data),
    [],
  );

  const messaggi = useApi<MessaggioPiattaforma[]>(
    (segnale) =>
      api
        .get<MessaggioPiattaforma[]>('/contratti/messaggi', undefined, { signal: segnale })
        .then((r) => r.data),
    [],
  );

  if (!utente) return null;

  if (utente.role === 'condomino' || utente.role === 'portiere') {
    return (
      <>
        <TitoloPagina titolo="Il mio contratto" />
        <PaginaVuota
          titolo="Non applicabile"
          descrizione="Questa sezione riguarda gli amministratori di condominio."
        />
      </>
    );
  }

  const s = stato.dati;

  return (
    <>
      <TitoloPagina titolo="Il mio contratto" descrizione="Condizioni del servizio e comunicazioni della piattaforma." />

      {stato.inCorso && <Caricamento />}
      {stato.errore && <ErroreCaricamento messaggio={stato.errore} onRiprova={stato.ricarica} />}

      {s && s.ruolo === 'superadmin' && (
        <div className="statistiche">
          <div className="statistica">
            <div className="statistica-valore">{s.contrattiAttivi}</div>
            <div className="statistica-etichetta">Contratti attivi</div>
          </div>
          <div className="statistica">
            <div className="statistica-valore">{s.inScadenzaEntro30Giorni}</div>
            <div className="statistica-etichetta">In scadenza entro 30 giorni</div>
          </div>
        </div>
      )}

      {s && s.ruolo === 'admin' && !s.contratto && (
        <PaginaVuota
          titolo="Nessun contratto attivo"
          descrizione="Non puoi ancora operare: l’amministratore di piattaforma deve stipulare un contratto che abiliti la gestione delle unità immobiliari."
        />
      )}

      {s?.contratto && (
        <>
          {s.stato === 'sospeso' ? (
            <div className="avviso avviso-pericolo" style={{ marginBottom: 'var(--sp-4)' }} role="alert">
              <div>
                <strong>Contratto sospeso.</strong> Puoi consultare i dati ma non modificarli. Contatta
                l’amministratore di piattaforma per la riattivazione.
              </div>
            </div>
          ) : s.contratto.scaduto ? (
            <div className="avviso avviso-pericolo" style={{ marginBottom: 'var(--sp-4)' }} role="alert">
              <div>
                <strong>Contratto scaduto il {fmtData(s.contratto.dataScadenza)}.</strong> Continui a gestire i
                condomini già attivi, ma non puoi aggiungere nuove unità immobiliari.
              </div>
            </div>
          ) : (
            s.contratto.giorniAllaScadenza !== null &&
            s.contratto.giorniAllaScadenza <= 60 && (
              <div className="avviso avviso-avviso" style={{ marginBottom: 'var(--sp-4)' }}>
                Il contratto scade il {fmtData(s.contratto.dataScadenza)}, tra{' '}
                {s.contratto.giorniAllaScadenza} giorni. Rivolgiti alla piattaforma per il rinnovo.
              </div>
            )
          )}

          <div className="statistiche" style={{ marginBottom: 'var(--sp-4)' }}>
            <div className="statistica">
              <div className="statistica-valore">
                {s.contratto.unitaInUso}/{s.contratto.unitaMassime}
              </div>
              <div className="statistica-etichetta">Unità immobiliari in carico</div>
            </div>
            <div className="statistica">
              <div className="statistica-valore">{euro(s.contratto.costo)}</div>
              <div className="statistica-etichetta">Costo per {s.contratto.periodicita}</div>
            </div>
            <div className="statistica">
              <div className="statistica-valore">{s.contratto.unitaDisponibili}</div>
              <div className="statistica-etichetta">Unità ancora disponibili</div>
            </div>
            <div className="statistica">
              <div className="statistica-valore">
                {s.contratto.giorniAllaScadenza !== null && s.contratto.giorniAllaScadenza >= 0
                  ? s.contratto.giorniAllaScadenza
                  : '—'}
              </div>
              <div className="statistica-etichetta">Giorni alla scadenza</div>
            </div>
          </div>

          <section className="scheda" style={{ marginBottom: 'var(--sp-4)' }}>
            <div className="scheda-intestazione">
              <h2>{s.contratto.codice}</h2>
              <EtichettaStato stato={s.stato ?? 'bozza'} />
            </div>
            <div className="scheda-corpo pila-2">
              <div className="riga riga-tra">
                <span className="testo-muto">Scadenza</span>
                <strong>{fmtData(s.contratto.dataScadenza)}</strong>
              </div>
              {s.prossimaRata && (
                <div className="riga riga-tra">
                  <span className="testo-muto">Prossima rata</span>
                  <strong>
                    {euro(s.prossimaRata.importo)} · {fmtData(s.prossimaRata.scadenza)}
                  </strong>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {messaggi.dati && messaggi.dati.length > 0 && (
        <section className="scheda">
          <div className="scheda-intestazione">
            <h2>Messaggi dalla piattaforma</h2>
          </div>
          <div className="elenco">
            {messaggi.dati.map((m) => (
              <div key={m.id} className="scheda-corpo pila-1">
                <div className="riga riga-tra">
                  <strong className="cresci">{m.oggetto}</strong>
                  {!m.letto && <span className="etichetta etichetta-pericolo">Non letto</span>}
                </div>
                <p className="testo-faint">{m.corpo}</p>
                <span className="testo-faint">
                  {m.mittente.nome} {m.mittente.cognome} · {dataOra(m.creatoIl)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}