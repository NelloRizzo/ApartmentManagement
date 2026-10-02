import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/hooks/useApi';
import { api, ApiError } from '@/api/client';
import { notifica } from '@/hooks/useNotifiche';
import { Caricamento, ErroreCaricamento, PaginaVuota } from '@/components/Feedback';
import { EtichettaStato, etichette } from '@/components/Elementi';
import { TitoloPagina, RichiediCondominio } from '@/components/TitoloPagina';
import { AreaStampa, PulsanteStampa } from '@/components/Stampa';
import { data as fmtData } from '@/lib/formattazione';
import type { ApiEnvelope, Verbale } from '@/types/domain';

export default function PaginaVerbali() {
  const { condominioId, utente } = useAuth();
  const [aperto, setAperto] = useState<Verbale | null>(null);

  const elenco = useApi<ApiEnvelope<Verbale[]>>(
    (segnale) =>
      api.get<Verbale[]>(`/condomini/${condominioId}/verbali`, { page: 1, limit: 30 }, { signal: segnale }),
    [condominioId],
    { attivo: Boolean(condominioId) },
  );

  if (!condominioId) return null;

  const verbali = elenco.dati?.data ?? [];
  const amministratore = utente?.role !== 'condomino';

  return (
    <RichiediCondominio>
      <TitoloPagina
        titolo="Verbali"
        descrizione="Verbali delle assemblee a cui hai partecipato."
      />

      {elenco.inCorso && <Caricamento />}
      {elenco.errore && <ErroreCaricamento messaggio={elenco.errore} onRiprova={elenco.ricarica} />}

      {elenco.dati && verbali.length === 0 && (
        <PaginaVuota
          titolo="Nessun verbale disponibile"
          descrizione={
            amministratore
              ? 'I verbali vengono generati dall’anagrafica di ciascuna assemblea, dopo la verbalizzazione.'
              : 'Verranno pubblicati qui i verbali delle assemblee a cui hai partecipato.'
          }
          azione={
            amministratore ? (
              <Link className="btn btn-primario" to="/c/assemblee">
                Vai alle assemblee
              </Link>
            ) : undefined
          }
        />
      )}

      <div className="elenco">
        {verbali.map((v) => {
          const a = typeof v.assemblea === 'string' ? null : v.assemblea;
          return (
            <button
              key={v._id}
              type="button"
              className="scheda voce-clicabile"
              style={{ marginBottom: 'var(--sp-2)', textAlign: 'left' }}
              onClick={() => setAperto(v)}
            >
              <div className="scheda-corpo pila-1">
                <div className="riga riga-tra">
                  <strong>Verbale n. {v.numero}</strong>
                  <EtichettaStato stato={v.approvato ? 'approvato' : 'bozza'} testo={v.approvato ? 'Approvato' : 'Bozza'} />
                </div>
                <div className="testo-faint">
                  Assemblea {a ? `${etichette.tipoAssemblea(a.tipo)} n. ${a.numero}` : ''} · {fmtData(v.data)}
                </div>
                <div className="riga">
                  <span className="etichetta etichetta-neutro">
                    {v.snapshot.presenze.numeroCondomini} presenti
                  </span>
                  {v.snapshot.presenze.numeroDeleghe > 0 && (
                    <span className="etichetta etichetta-neutro">{v.snapshot.presenze.numeroDeleghe} deleghe</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {aperto && <DettaglioVerbale verbale={aperto} onChiudi={() => setAperto(null)} />}
    </RichiediCondominio>
  );
}

function DettaglioVerbale({ verbale, onChiudi }: { verbale: Verbale; onChiudi: () => void }) {
  const { condominioId } = useAuth();
  const [testo, setTesto] = useState(verbale.testo);
  const [modificato, setModificato] = useState(verbale.modificatoManualmente);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function salva() {
    setErrore(null);
    setInCorso(true);
    try {
      await api.patch(`/condomini/${condominioId}/verbali/${verbale._id}/testo`, { testo });
      notifica('Testo del verbale aggiornato');
      setModificato(true);
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Salvataggio non riuscito');
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="velo" role="dialog" aria-modal="true" aria-label={`Verbale n. ${verbale.numero}`} onClick={onChiudi}>
      <div
        className="scheda"
        style={{ width: '100%', maxWidth: '48rem', maxHeight: '92dvh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scheda-intestazione">
          <h2 className="cresci">Verbale n. {verbale.numero}</h2>
          <button type="button" className="btn btn-fantasma btn-sm" onClick={onChiudi} aria-label="Chiudi">
            ✕
          </button>
        </div>

        <div className="scheda-corpo pila-3" style={{ overflowY: 'auto' }}>
          {errore && (
            <div className="avviso avviso-pericolo" role="alert">
              {errore}
            </div>
          )}

          {modificato && (
            <div className="avviso avviso-avviso">
              Il testo è stato modificato a mano e non verrà sovrascritto dalla rigenerazione automatica.
            </div>
          )}

          <textarea
            className="area area-testo verbale-testo"
            style={{ minHeight: '20rem', fontFamily: 'inherit' }}
            value={testo}
            onChange={(e) => {
              setTesto(e.target.value);
              setModificato(true);
            }}
            aria-label="Testo del verbale"
          />

          <AreaStampa>
            <pre className="verbale-testo solo-stampa">{testo}</pre>
          </AreaStampa>

          <div className="riga">
            <button type="button" className="btn btn-primario cresci" onClick={salva} disabled={inCorso}>
              {inCorso ? 'Salvataggio…' : 'Salva modifiche'}
            </button>
            <PulsanteStampa etichetta="Stampa / PDF" />
          </div>
        </div>
      </div>
    </div>
  );
}
