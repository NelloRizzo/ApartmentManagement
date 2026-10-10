import { useEffect, useState } from 'react';

/**
 * Novità del service worker: se c'è una versione nuova, si avvisa invece di
 * ricaricare da soli.
 *
 * Vite è configurato con `registerType: 'prompt'` (vedi `vite.config.ts`).
 * `autoUpdate` aggiornava la pagina senza dirlo: chi stava compilando un
 * verbale si vedeva ricaricare sotto le mani, senza capire perché. Qui la
 * versione nuova **aspetta**, e ad applicarla è chi la usa.
 *
 * Il segnale arriva da `registerSW` in `main.tsx`, che non è dentro React: questo
 * modulo è il tramite fra i due, con lo stesso schema di `useNotifiche`.
 */
const ascoltatori = new Set<(disponibile: boolean) => void>();
let inAttesa = false;
let attivaNuovaVersione: (() => Promise<void>) | null = null;

/** Collegato da `main.tsx`: applica la versione in attesa e ricarica. */
export function collegaAttivazione(attiva: () => Promise<void>): void {
  attivaNuovaVersione = attiva;
}

/** Chiamato da `registerSW` quando un nuovo service worker è pronto. */
export function segnalaNuovaVersione(): void {
  inAttesa = true;
  for (const ascolta of ascoltatori) ascolta(true);
}

export function useAggiornamento(): { disponibile: boolean; aggiorna: () => void } {
  const [disponibile, setDisponibile] = useState(inAttesa);

  useEffect(() => {
    const ascolta = (p: boolean) => setDisponibile(p);
    ascoltatori.add(ascolta);
    // Il segnale può essere arrivato prima del montaggio: lo stato del modulo è
    // la fonte di verità, così non si perde una versione pronta mentre React
    // non era ancora in ascolto.
    ascolta(inAttesa);
    return () => {
      ascoltatori.delete(ascolta);
    };
  }, []);

  return {
    disponibile,
    aggiorna: () => {
      void attivaNuovaVersione?.();
    },
  };
}
