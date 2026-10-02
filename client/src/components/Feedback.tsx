import type { ReactNode } from 'react';
import { useNotifiche } from '@/hooks/useNotifiche';

export function Notifiche() {
  const { notifiche, chiudi } = useNotifiche();
  if (notifiche.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: 'fixed',
        insetInline: 'var(--sp-4)',
        bottom: 'calc(var(--nav-h) + var(--safe-bottom) + var(--sp-3))',
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--sp-2)',
        pointerEvents: 'none',
      }}
    >
      {notifiche.map((n) => (
        <div
          key={n.id}
          className={`avviso avviso-${n.tono === 'successo' ? 'successo' : n.tono === 'errore' ? 'pericolo' : 'info'}`}
          style={{ boxShadow: 'var(--sh-3)', pointerEvents: 'auto' }}
          role={n.tono === 'errore' ? 'alert' : 'status'}
        >
          <span className="cresci">{n.testo}</span>
          <button
            type="button"
            onClick={() => chiudi(n.id)}
            aria-label="Chiudi notifica"
            style={{ border: 'none', background: 'none', fontSize: '1.2rem', lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function PaginaVuota({ titolo, descrizione, azione }: { titolo: string; descrizione?: string; azione?: ReactNode }) {
  return (
    <div className="stato-vuoto">
      <h3>{titolo}</h3>
      {descrizione && <p className="pila-1">{descrizione}</p>}
      {azione && <div style={{ marginTop: 'var(--sp-4)' }}>{azione}</div>}
    </div>
  );
}

export function Caricamento({ testo = 'Caricamento…' }: { testo?: string }) {
  return (
    <div className="stato-caricamento" role="status">
      <div className="girac" aria-hidden="true" />
      <span>{testo}</span>
    </div>
  );
}

export function ErroreCaricamento({ messaggio, onRiprova }: { messaggio: string; onRiprova?: () => void }) {
  return (
    <div className="avviso avviso-pericolo pila-2" role="alert">
      <span className="cresci">{messaggio}</span>
      {onRiprova && (
        <button type="button" className="btn btn-secondario btn-sm" onClick={onRiprova}>
          Riprova
        </button>
      )}
    </div>
  );
}
