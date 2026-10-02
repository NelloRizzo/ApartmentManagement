import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/api/client';

export interface StatoCaricamento {
  dati: unknown;
  inCorso: boolean;
  errore: string | null;
  ricarica: () => void;
}

/**
 * Caricamento dati con deduplicazione per chiave di richiesta e cancellazione
 * della richiesta precedente quando cambiano le dipendenze.
 */
export function useApi<T>(
  fn: (segnale: AbortSignal) => Promise<T>,
  dipendenze: unknown[],
  opzioni: { attivo?: boolean } = {},
): StatoCaricamento & { dati: T | null } {
  const { attivo = true } = opzioni;
  const [dati, setDati] = useState<T | null>(null);
  const [inCorso, setInCorso] = useState(attivo);
  const [errore, setErrore] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!attivo) {
      setInCorso(false);
      return;
    }

    const controller = new AbortController();
    let vivo = true;

    setInCorso(true);
    setErrore(null);

    fnRef
      .current(controller.signal)
      .then((risultato) => {
        if (vivo) setDati(risultato);
      })
      .catch((e: unknown) => {
        if (!vivo || controller.signal.aborted) return;
        setErrore(e instanceof ApiError ? e.message : 'Errore di rete: riprova più tardi');
      })
      .finally(() => {
        if (vivo) setInCorso(false);
      });

    return () => {
      vivo = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dipendenze, tick, attivo]);

  const ricarica = useCallback(() => setTick((t) => t + 1), []);

  return { dati, inCorso, errore, ricarica };
}
