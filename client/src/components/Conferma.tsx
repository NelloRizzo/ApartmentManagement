import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';

export interface RichiestaConferma {
  /** Titolo della finestra: dice cosa sta per succedere. */
  titolo: string;
  /** Corpo della domanda, con il dettaglio che rende la scelta informata. */
  messaggio: string;
  /** Etichetta del pulsante che conferma. */
  conferma?: string;
  /** Etichetta del pulsante che annulla. */
  annulla?: string;
  /**
   * `true` per le cancellazioni: il pulsante diventa rosso e il focus va
   * sull'annullamento, così `Invio` non distrugge nulla per disattenzione.
   */
  pericolo?: boolean;
}

type Risolutore = (confermato: boolean) => void;

/**
 * Finestra di conferma al posto di `window.confirm`.
 *
 * `confirm()` è bloccante, non stilabile e su Android è una riga di testo
 * grigia: impossibile farci notare *cosa* si sta distruggendo. Qui la domanda
 * può dire "il verbale n. 4, già approvato" e il pulsante dice "Elimina".
 *
 * Si usa come hook: `chiedi` restituisce una promise, quindi il flusso del
 * chiamante resta lineare e si può usare `await` senza coinvolgere il lettore
 * di stati della finestra.
 */
export function useConferma(): {
  chiedi: (richiesta: RichiestaConferma) => Promise<boolean>;
  elemento: ReactElement | null;
} {
  const [richiesta, setRichiesta] = useState<RichiestaConferma | null>(null);
  const risolutore = useRef<Risolutore | null>(null);

  const chiedi = useCallback((r: RichiestaConferma) => {
    // Una seconda richiesta senza risposta lascerebbe la prima promise appesa
    // per sempre: si chiude negando, che è la risposta più prudente.
    risolutore.current?.(false);
    return new Promise<boolean>((resolve) => {
      risolutore.current = resolve;
      setRichiesta(r);
    });
  }, []);

  const rispondi = useCallback((confermato: boolean) => {
    risolutore.current?.(confermato);
    risolutore.current = null;
    setRichiesta(null);
  }, []);

  // Smontare la pagina con la finestra aperta deve sbloccare chi aspetta.
  useEffect(() => () => risolutore.current?.(false), []);

  return {
    chiedi,
    elemento: richiesta ? <FinestraConferma richiesta={richiesta} onRisposta={rispondi} /> : null,
  };
}

function FinestraConferma({
  richiesta,
  onRisposta,
}: {
  richiesta: RichiestaConferma;
  onRisposta: (confermato: boolean) => void;
}) {
  const { titolo, messaggio, conferma = 'Conferma', annulla = 'Annulla', pericolo = false } = richiesta;

  useEffect(() => {
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onRisposta(false);
    };
    window.addEventListener('keydown', suTasto);
    return () => window.removeEventListener('keydown', suTasto);
  }, [onRisposta]);

  return (
    <div className="velo" role="presentation" onClick={() => onRisposta(false)}>
      <div
        className="scheda"
        role="dialog"
        aria-modal="true"
        aria-label={titolo}
        style={{ width: 'min(28rem, 94vw)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scheda-intestazione">
          <h2>{titolo}</h2>
        </div>
        <div className="scheda-corpo pila-4">
          <p>{messaggio}</p>
          <div className="riga riga-tra">
            {/* Sulle cancellazioni il focus parte dall'annullamento: chi preme
                `Invio` per riflesso non deve distruggere un documento. */}
            <button
              type="button"
              className="btn btn-fantasma"
              autoFocus={pericolo}
              onClick={() => onRisposta(false)}
            >
              {annulla}
            </button>
            <button
              type="button"
              className={`btn ${pericolo ? 'btn-pericolo' : 'btn-primario'}`}
              onClick={() => onRisposta(true)}
            >
              {conferma}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
