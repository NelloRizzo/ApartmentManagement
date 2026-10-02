import { useCallback, useState, type ReactNode } from 'react';

/**
 * Area di stampa: tutto ciò che è qui dentro finisce nel PDF, tutto il resto no.
 *
 * Va avvolta attorno al solo documento. Il foglio include l'interfaccia
 * (barra laterale, intestazione, pulsanti) e senza questo involucro la stampa
 * riprodurrebbe anche quella, e il PDF risulterebbe illeggibile.
 */
export function AreaStampa({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-stampa="" className={className}>
      {children}
    </div>
  );
}

/**
 * Pulsante che stampa solo l'area contrassegnata.
 *
 * Il PDF si ottiene dalla finestra di stampa del browser scegliendo
 * "Salva in PDF": è il modo per avere un vero PDF senza aggiungere una libreria
 * che deve reimplementare impaginazione, caratteri e interruzioni di pagina.
 * `afterprint` ripristina lo schermo anche se l'utente chiude la stampa con
 * Escape, evento che `window.matchMedia('print')` non intercetta.
 */
export function PulsanteStampa({ etichetta = 'Stampa' }: { etichetta?: string }) {
  const [inCorso, setInCorso] = useState(false);

  const stampa = useCallback(() => {
    document.body.classList.add('stampa-attiva');

    const pulisce = () => {
      document.body.classList.remove('stampa-attiva');
      setInCorso(false);
      window.removeEventListener('afterprint', pulisce);
    };

    window.addEventListener('afterprint', pulisce);
    setInCorso(true);
    window.print();
  }, []);

  return (
    <button type="button" className="btn btn-secondario" onClick={stampa} disabled={inCorso}>
      {inCorso ? 'Stampa in corso…' : etichetta}
    </button>
  );
}
