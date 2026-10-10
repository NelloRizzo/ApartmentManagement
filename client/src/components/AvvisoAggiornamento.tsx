import { useAggiornamento } from '@/hooks/useAggiornamento';

/**
 * Avviso persistente di nuova versione.
 *
 * Non è un toast: quelli spariscono dopo pochi secondi e non hanno un'azione.
 * Qui serve che il messaggio resti finché non si aggiorna, perché ricaricare a
 * sorpresa è ciò che si vuole evitare: l'aggiornamento lo decide chi usa
 * l'applicazione, quando è un momento buono.
 */
export function AvvisoAggiornamento() {
  const { disponibile, aggiorna } = useAggiornamento();
  if (!disponibile) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        insetInline: 'var(--sp-4)',
        // Sopra la barra inferiore del telefono, e non coperta da essa. Su
        // schermo largo la navigazione è una barra laterale e l'avviso resta
        // in basso al centro: va bene lo stesso, non copre nulla.
        bottom: 'calc(var(--nav-h) + var(--safe-bottom) + var(--sp-3))',
        zIndex: 60,
        marginInline: 'auto',
        maxWidth: '32rem',
      }}
    >
      <div
        className="avviso avviso-info"
        style={{ alignItems: 'center', justifyContent: 'space-between' }}
      >
        <span>È disponibile una nuova versione.</span>
        <button type="button" className="btn btn-primario btn-sm" onClick={aggiorna}>
          Aggiorna
        </button>
      </div>
    </div>
  );
}
