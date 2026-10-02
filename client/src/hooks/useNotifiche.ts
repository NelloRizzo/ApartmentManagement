import { useEffect, useState } from 'react';

export interface Notifica {
  id: number;
  testo: string;
  tono: 'successo' | 'errore' | 'info';
}

let contatore = 0;
const ascoltatori = new Set<(n: Notifica) => void>();

/** Notifiche "toast" leggere, senza dipendenze esterne. */
export function notifica(testo: string, tono: Notifica['tono'] = 'successo'): void {
  const n: Notifica = { id: ++contatore, testo, tono };
  for (const ascolta of ascoltatori) ascolta(n);
}

export function useNotifiche(): { notifiche: Notifica[]; chiudi: (id: number) => void } {
  const [notifiche, setNotifiche] = useState<Notifica[]>([]);

  useEffect(() => {
    const ascolta = (n: Notifica) => {
      setNotifiche((precedenti) => [...precedenti, n]);
      window.setTimeout(() => {
        setNotifiche((precedenti) => precedenti.filter((x) => x.id !== n.id));
      }, 4500);
    };
    ascoltatori.add(ascolta);
    return () => {
      ascoltatori.delete(ascolta);
    };
  }, []);

  const chiudi = (id: number) => setNotifiche((precedenti) => precedenti.filter((x) => x.id !== id));

  return { notifiche, chiudi };
}
