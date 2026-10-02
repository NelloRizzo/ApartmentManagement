import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/hooks/useApi';
import { api } from '@/api/client';
import { Caricamento, ErroreCaricamento, PaginaVuota } from '@/components/Feedback';
import { Statistica, EtichettaStato } from '@/components/Elementi';
import { TitoloPagina, RichiediCondominio } from '@/components/TitoloPagina';
import { euro, mese, numero } from '@/lib/formattazione';
import type { ApiEnvelope, RiepilogoQuote } from '@/types/domain';

export default function PaginaQuote() {
  const { condominioId } = useAuth();
  const ora = new Date();
  const [anno, setAnno] = useState(ora.getFullYear());
  const [meseSelezionato, setMeseSelezionato] = useState(ora.getMonth() + 1);
  const [soloMorosi, setSoloMorosi] = useState(false);

  const riepilogo = useApi<ApiEnvelope<RiepilogoQuote>>(
    (segnale) =>
      api.get<RiepilogoQuote>(
        `/condomini/${condominioId}/versamenti/quote`,
        { anno, mese: meseSelezionato },
        { signal: segnale },
      ),
    [condominioId, anno, meseSelezionato],
    { attivo: Boolean(condominioId) },
  );

  if (!condominioId) return null;

  const q = riepilogo.dati?.data;
  const righe = q ? (soloMorosi ? q.morosi : q.righe) : [];
  const anni = [ora.getFullYear() - 2, ora.getFullYear() - 1, ora.getFullYear(), ora.getFullYear() + 1];

  return (
    <RichiediCondominio>
      <TitoloPagina titolo="Quote condominiali" descrizione="Ripartizione delle spese e stato dei versamenti." />

      <div className="riga" style={{ marginBottom: 'var(--sp-3)' }}>
        <div className="campo cresci">
          <label className="campo-etichetta" htmlFor="anno">
            Anno
          </label>
          <select id="anno" className="area" value={anno} onChange={(e) => setAnno(Number(e.target.value))}>
            {anni.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="campo cresci">
          <label className="campo-etichetta" htmlFor="mese">
            Mese
          </label>
          <select
            id="mese"
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

      {riepilogo.inCorso && <Caricamento />}
      {riepilogo.errore && <ErroreCaricamento messaggio={riepilogo.errore} onRiprova={riepilogo.ricarica} />}

      {q && (
        <>
          <div className="statistiche" style={{ marginBottom: 'var(--sp-4)' }}>
            <Statistica valore={euro(q.totaleDovuto)} etichetta="Dovuto" />
            <Statistica valore={euro(q.totaleVersato)} etichetta="Versato" tono="successo" />
            <Statistica
              valore={euro(q.saldo)}
              etichetta="Saldo"
              tono={q.saldo > 0 ? 'pericolo' : 'successo'}
            />
            <Statistica
              valore={q.morosi.length}
              etichetta="Morosi"
              tono={q.morosi.length > 0 ? 'pericolo' : 'successo'}
            />
          </div>

          <label className="casella" style={{ marginBottom: 'var(--sp-3)' }}>
            <input
              type="checkbox"
              checked={soloMorosi}
              onChange={(e) => setSoloMorosi(e.target.checked)}
            />
            <span>Mostra solo le unità non in regola</span>
          </label>

          {righe.length === 0 ? (
            <PaginaVuota
              titolo={soloMorosi ? 'Nessun moroso' : 'Nessuna quota registrata'}
              descrizione={
                soloMorosi
                  ? `Tutte le unità hanno versato la quota di ${mese(meseSelezionato).toLowerCase()}.`
                  : 'Imposta un bilancio preventivo per l’anno selezionato, altrimenti le quote non possono essere calcolate.'
              }
            />
          ) : (
            <div className="elenco">
              {righe.map((r) => (
                <RigaQuota key={r.unitaId} riga={r} />
              ))}
            </div>
          )}
        </>
      )}
    </RichiediCondominio>
  );
}

function RigaQuota({ riga }: { riga: RiepilogoQuote['righe'][number] }) {
  const [aperto, setAperto] = useState(false);

  return (
    <div className="scheda" style={{ marginBottom: 'var(--sp-2)' }}>
      <button
        type="button"
        className="voce voce-clicabile"
        onClick={() => setAperto((v) => !v)}
        aria-expanded={aperto}
        style={{ width: '100%' }}
      >
        <span className="cresci pila-1">
          <strong>
            {riga.codice}
            {riga.nome ? ` · ${riga.nome}` : ''}
          </strong>
          <span className="testo-faint">
            {numero(riga.millesimi)} millesimi
          </span>
        </span>
        <span className="pila-1 testo-destra">
          <strong className="testo-num">{euro(riga.totale)}</strong>
          <EtichettaStato stato={riga.stato} />
        </span>
      </button>

      {aperto && (
        <div className="scheda-corpo pila-3">
          <div className="riga riga-tra">
            <span className="testo-muto">Versato</span>
            <span className="testo-num">{euro(riga.versato)}</span>
          </div>
          <div className="riga riga-tra">
            <span className="testo-muto">Saldo</span>
            <strong className={`testo-num ${riga.saldo > 0 ? 'testo-danger' : 'testo-successo'}`}>
              {euro(riga.saldo)}
            </strong>
          </div>

          <details>
            <summary className="testo-faint" style={{ cursor: 'pointer' }}>
              Dettaglio delle voci ({riga.voci.length})
            </summary>
            <ul className="elenco" style={{ marginTop: 'var(--sp-2)' }}>
              {riga.voci.map((v, i) => (
                <li key={`${v.voce}-${i}`} className="voce riga-tra">
                  <span className="testo-faint cresci">{v.voce}</span>
                  <span className="testo-num">{euro(v.importo)}</span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
