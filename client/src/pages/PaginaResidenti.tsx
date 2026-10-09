import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/hooks/useApi';
import { api } from '@/api/client';
import { Caricamento, ErroreCaricamento, PaginaVuota } from '@/components/Feedback';
import { TitoloPagina } from '@/components/TitoloPagina';
import type { RubricaStabile } from '@/types/domain';

/**
 * Rubrica dello stabile: chi vive nell'edificio e come contattarlo.
 *
 * È la vista del personale, e per questo ha campi propri: **unità, cognome e
 * telefono**. Non l'email e non i millesimi, che sono dati economici del
 * condomino e non servono a bussare alla porta. L'amministratore vede la pagina
 * uguale, perché anche per lui è una ricerca rapida dei contatti.
 */
export default function PaginaResidenti() {
  const { condominioId } = useAuth();
  const [ricerca, setRicerca] = useState('');

  const rubrica = useApi<RubricaStabile>(
    (segnale) =>
      api
        .get<RubricaStabile>(
          `/condomini/${condominioId}/condomini/rubrica`,
          undefined,
          { signal: segnale },
        )
        .then((r) => r.data),
    [condominioId],
    { attivo: Boolean(condominioId) },
  );

  const filtrati = useMemo(() => {
    const tutti = rubrica.dati?.residenti ?? [];
    const testo = ricerca.trim().toLowerCase();
    if (!testo) return tutti;
    return tutti.filter(
      (r) =>
        r.cognome.toLowerCase().includes(testo) ||
        r.unita.some((u) => u.toLowerCase().includes(testo)) ||
        (r.telefono ?? '').includes(testo),
    );
  }, [rubrica.dati, ricerca]);

  if (!condominioId) return null;

  return (
    <>
      <TitoloPagina
        titolo="Residenti"
        descrizione="Chi vive nello stabile, con il numero per contattarlo."
      />

      {rubrica.inCorso && <Caricamento />}
      {rubrica.errore && (
        <ErroreCaricamento messaggio={rubrica.errore} onRiprova={rubrica.ricarica} />
      )}

      {rubrica.dati && (
        <div className="pila-4">
          <div className="campo">
            <label className="campo-etichetta" htmlFor="cerca-residenti">
              Cerca per cognome, numero o telefono
            </label>
            <input
              id="cerca-residenti"
              className="area"
              type="search"
              value={ricerca}
              onChange={(e) => setRicerca(e.target.value)}
              placeholder="Es. Rossi, oppure B2"
            />
          </div>

          {filtrati.length === 0 ? (
            <PaginaVuota
              titolo="Nessun risultato"
              descrizione={
                ricerca
                  ? 'Nessun residente corrisponde alla ricerca.'
                  : 'Non risultano iscritti attivi in questo condominio.'
              }
            />
          ) : (
            <div className="contenitore-tabella">
              <table className="tabella">
                <thead>
                  <tr>
                    <th>Residente</th>
                    <th>Unità</th>
                    <th>Telefono</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrati.map((r) => (
                    <tr key={r.utenteId}>
                      <td>
                        <strong>{r.cognome}</strong>
                      </td>
                      <td>{r.unita.join(', ') || '—'}</td>
                      <td className="num">{r.telefono ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}