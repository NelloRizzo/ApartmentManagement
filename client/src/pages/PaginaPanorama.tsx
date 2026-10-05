import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/hooks/useApi';
import { api } from '@/api/client';
import { Caricamento, ErroreCaricamento, PaginaVuota } from '@/components/Feedback';
import { Statistica, etichette } from '@/components/Elementi';
import { TitoloPagina } from '@/components/TitoloPagina';
import { euro, numero, data as fmtData, mese } from '@/lib/formattazione';
import type { Permesso, RiepilogoCondominio, RiepilogoQuote, UserRole } from '@/types/domain';

/**
 * Scorciatoie verso le sezioni frequenti.
 *
 * Ogni voce porta il permesso necessario: un assistente che può solo registrare
 * versamenti non deve vedere il pulsante "Gestisci quote millesimali", che il
 * backend gli rifiuterebbe con un 403.
 *
 * La bacheca fa eccezione: non ha un permesso proprio, perché l'accesso dipende
 * da chi ha ricevuto l'attività. È quindi filtrata per ruolo.
 */
const SCORCIATOIE: { a: string; etichetta: string; permesso?: Permesso; ruoli?: UserRole[] }[] = [
  { a: '/c/bacheca', etichetta: 'Bacheca', ruoli: ['admin'] },
  { a: '/c/unita', etichetta: 'Unità immobiliari', permesso: 'unita:leggere' },
  { a: '/c/quote', etichetta: 'Quote e versamenti', permesso: 'versamenti:leggere' },
  { a: '/c/tabella', etichetta: 'Gestisci quote millesimali', permesso: 'tabella:leggere' },
  { a: '/c/assemblee', etichetta: 'Assemblee', permesso: 'assemblee:leggere' },
  { a: '/c/comunicazioni', etichetta: 'Comunicazioni', permesso: 'comunicazioni:leggere' },
];

export default function PaginaPanorama() {
  const { condominioId, utente, puo, nonLette } = useAuth();
  const accessi = SCORCIATOIE.filter(
    (s) => (!s.permesso || puo(s.permesso)) && (!s.ruoli || (utente && s.ruoli.includes(utente.role))),
  );

  const riepilogo = useApi<RiepilogoCondominio>(
    (segnale) => api.get<RiepilogoCondominio>(`/condomini/${condominioId}/riepilogo`, undefined, { signal: segnale }).then((r) => r.data),
    [condominioId],
    { attivo: Boolean(condominioId) },
  );

  const quote = useApi<RiepilogoQuote>(
    (segnale) => {
      const ora = new Date();
      return api
        .get<RiepilogoQuote>(
          `/condomini/${condominioId}/versamenti/quote`,
          { anno: ora.getFullYear(), mese: ora.getMonth() + 1 },
          { signal: segnale },
        )
        .then((r) => r.data);
    },
    [condominioId],
    { attivo: Boolean(condominioId) },
  );

  if (!condominioId) {
    return (
      <>
        <TitoloPagina titolo="Panorama" />
        {utente?.role === 'condomino' ? (
          <p className="testo-muto">Seleziona un condominio per visualizzare i dati.</p>
        ) : (
          // Senza condominio non c'è nulla da mostrare: rimandare al Panorama
          // stesso sarebbe un vicolo cieco, quindi si offre la creazione.
          <PaginaVuota
            titolo="Nessun condominio"
            descrizione="Crea il tuo primo condominio: è il contenitore di unità immobiliari, quote, assemblee e bilanci."
            azione={
              <Link className="btn btn-primario" to="/c/condomini">
                Crea il condominio
              </Link>
            }
          />
        )}
      </>
    );
  }

  return (
    <>
      <TitoloPagina
        titolo="Panorama"
        descrizione={`Stato del condominio al ${fmtData(new Date())}`}
      />

      {riepilogo.inCorso && <Caricamento />}
      {riepilogo.errore && <ErroreCaricamento messaggio={riepilogo.errore} onRiprova={riepilogo.ricarica} />}

{riepilogo.dati && (
        <div className="statistiche">
          {/* Il numero si vede sempre: è un dato aggregato, e nasconderlo a chi
              non può aprire la sezione sarebbe togliere un'informazione che
              aveva. Diventa cliccabile solo dove l'utente può davvero arrivare,
              altrimenti il backend risponderebbe 403. */}
          <Statistica
            valore={riepilogo.dati.unita}
            etichetta="Unità immobiliari"
            a={puo('unita:leggere') ? '/c/unita' : undefined}
          />
          <Statistica
            valore={riepilogo.dati.condomini}
            etichetta="Condòmini iscritti"
            a={puo('iscritti:leggere') ? '/c/iscritti' : undefined}
          />
          <Statistica
            valore={riepilogo.dati.assembleeAperte}
            etichetta="Assemblee aperte"
            tono={riepilogo.dati.assembleeAperte > 0 ? 'avviso' : 'neutro'}
            a={puo('assemblee:leggere') ? '/c/assemblee' : undefined}
          />
          <Statistica
            valore={riepilogo.dati.morosiMeseCorrente ?? '-'}
            etichetta="Morosi del mese"
            tono={riepilogo.dati.morosiMeseCorrente ? 'pericolo' : 'successo'}
            a={puo('versamenti:leggere') ? '/c/quote' : undefined}
          />
        </div>
      )}

      {nonLette > 0 && puo('comunicazioni:leggere') && (
        <div className="avviso avviso-avviso" style={{ marginTop: 'var(--sp-4)' }}>
          <span>
            <strong>
              {nonLette === 1 ? 'Hai una comunicazione non letta.' : `Hai ${nonLette} comunicazioni non lette.`}
            </strong>{' '}
            <Link to="/c/comunicazioni">Leggile</Link>.
          </span>
        </div>
      )}

      {riepilogo.dati?.tabella && (
        <div className={`avviso ${riepilogo.dati.tabella.valida ? 'avviso-successo' : 'avviso-avviso'}`} style={{ marginTop: 'var(--sp-4)' }}>
          <span>
            {riepilogo.dati.tabella.ripartizioniAttive.length === 0 ? (
              <>
                <strong>Attenzione:</strong> non è definita alcuna quota millesimale. Le quote non possono
                essere calcolate finché la tabella non è stata impostata.
              </>
            ) : riepilogo.dati.tabella.valida ? (
              <>
                La tabella millesimale è valida: la somma dei millesimi di diritto fa{' '}
                <strong>{numero(riepilogo.dati.tabella.totaleDiritto)}</strong> (revisione{' '}
                {riepilogo.dati.tabella.revisione}).
              </>
            ) : (
              <>
                <strong>Attenzione:</strong> la tabella millesimale non raggiunge i 1000 millesimi. Le quote non
                possono essere calcolate correttamente.
                {riepilogo.dati.tabella.problemi.length > 0 && (
                  <>
                    {' '}
                    Scarto per {riepilogo.dati.tabella.problemi.map((p) => (
                      <span key={p.ripartizione} className="testo-faint">
                        {etichette.ripartizione(p.ripartizione)} {numero(p.totale)} ({p.scarto > 0 ? '+' : ''}
                        {numero(p.scarto)})
                      </span>
                    ))}{' '}
                    <br />
                  </>
                )}
              </>
            )}
            {riepilogo.dati.tabella.delibera && (
              <>
                {' '}
                Delibera: {riepilogo.dati.tabella.delibera}.
              </>
            )}
          </span>
        </div>
      )}

      {quote.dati && (
        <section className="scheda" style={{ marginTop: 'var(--sp-4)' }}>
          <div className="scheda-intestazione">
            <h2>Quote di {mese(quote.dati.mese)}</h2>
            <Link className="btn btn-secondario btn-sm" to="/c/quote">
              Dettaglio
            </Link>
          </div>
          <div className="scheda-corpo pila-3">
            <div className="riga riga-tra">
              <span className="testo-muto">Totale dovuto</span>
              <strong className="testo-num">{euro(quote.dati.totaleDovuto)}</strong>
            </div>
            <div className="riga riga-tra">
              <span className="testo-muto">Versato</span>
              <strong className="testo-num testo-successo">{euro(quote.dati.totaleVersato)}</strong>
            </div>
            <div className="riga riga-tra">
              <span className="testo-muto">Saldo da incassare</span>
              <strong className={`testo-num ${quote.dati.saldo > 0 ? 'testo-danger' : 'testo-successo'}`}>
                {euro(quote.dati.saldo)}
              </strong>
            </div>
            {quote.dati.morosi.length > 0 && (
              <div className="avviso avviso-pericolo">
                {quote.dati.morosi.length} {quote.dati.morosi.length === 1 ? 'unità non ha' : 'unità non hanno'} ancora
                versato la quota di {mese(quote.dati.mese).toLowerCase()}.
              </div>
            )}
          </div>
        </section>
      )}

      {riepilogo.errore === null && !riepilogo.inCorso && accessi.length > 0 && (
        <div className="riga" style={{ marginTop: 'var(--sp-5)', gap: 'var(--sp-2)' }}>
          {accessi.map((a) => (
            <Link key={a.a} className="btn btn-secondario" to={a.a}>
              {a.etichetta}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
