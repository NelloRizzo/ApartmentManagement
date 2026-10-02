import { useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { api, ApiError } from '@/api/client';
import { notifica } from '@/hooks/useNotifiche';
import { Caricamento, ErroreCaricamento, PaginaVuota } from '@/components/Feedback';
import { TitoloPagina } from '@/components/TitoloPagina';
import { dataOra } from '@/lib/formattazione';
import type { Collaboratore, MessaggioPiattaforma } from '@/types/domain';

export default function PaginaMessaggiPiattaforma() {
  const [composizioneAperta, setComposizioneAperta] = useState(false);
  const [selezionato, setSelezionato] = useState<MessaggioPiattaforma | null>(null);

  const elenco = useApi<MessaggioPiattaforma[]>(
    (segnale) =>
      api
        .get<MessaggioPiattaforma[]>('/contratti/messaggi', undefined, { signal: segnale })
        .then((r) => r.data),
    [],
  );

  const amministratori = useApi<Collaboratore[]>(
    (segnale) =>
      api
        .get<Collaboratore[]>('/staff/amministratori', { page: 1, limit: 100 }, { signal: segnale })
        .then((r) => r.data),
    [],
  );

  const messaggi = elenco.dati ?? [];
  const nonLetti = messaggi.filter((m) => !m.letto).length;

  return (
    <>
      <TitoloPagina
        titolo="Messaggi agli amministratori"
        descrizione="Comunicazioni della piattaforma verso gli amministratori di condominio."
        azioni={
          <button type="button" className="btn btn-primario" onClick={() => setComposizioneAperta(true)}>
            + Nuovo messaggio
          </button>
        }
      />

      {elenco.inCorso && <Caricamento />}
      {elenco.errore && <ErroreCaricamento messaggio={elenco.errore} onRiprova={elenco.ricarica} />}

      {elenco.dati && messaggi.length === 0 && (
        <PaginaVuota
          titolo="Nessun messaggio"
          descrizione="Invia comunicazioni e solleciti agli amministratori."
        />
      )}

      {elenco.dati && messaggi.length > 0 && (
        <p className="testo-faint testo-centrato" style={{ marginBottom: 'var(--sp-3)' }}>
          {messaggi.length} messaggi, di cui {nonLetti} non letti
        </p>
      )}

      <div className="elenco">
        {messaggi.map((m) => (
          <button
            key={m.id}
            type="button"
            className="scheda voce-clicabile"
            style={{ marginBottom: 'var(--sp-2)', textAlign: 'left' }}
            onClick={() => setSelezionato(m)}
          >
            <div className="scheda-corpo pila-1">
              <div className="riga riga-tra">
                <strong className="cresci">{m.oggetto}</strong>
                <div className="riga">
                  <span className="etichetta etichetta-neutro">{m.tipo}</span>
                  {!m.letto && <span className="etichetta etichetta-pericolo">Non letto</span>}
                </div>
              </div>
              <div className="testo-faint">
                a {m.destinatario.nome} {m.destinatario.cognome} · {dataOra(m.creatoIl)}
              </div>
              <p className="testo-faint">
                {m.corpo.slice(0, 140)}
                {m.corpo.length > 140 ? '…' : ''}
              </p>
            </div>
          </button>
        ))}
      </div>

      {composizioneAperta && (
        <ModuloMessaggio
          amministratori={amministratori.dati ?? []}
          onChiuso={() => setComposizioneAperta(false)}
          onInviato={() => {
            setComposizioneAperta(false);
            elenco.ricarica();
          }}
        />
      )}

      {selezionato && (
        <div className="velo" role="presentation" onClick={() => setSelezionato(null)}>
          <div
            className="scheda"
            role="dialog"
            aria-modal="true"
            aria-label={selezionato.oggetto}
            style={{ width: 'min(34rem, 94vw)', maxHeight: '92dvh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="scheda-intestazione">
              <h2 className="cresci">{selezionato.oggetto}</h2>
              <button type="button" className="btn btn-fantasma btn-sm" onClick={() => setSelezionato(null)} aria-label="Chiudi">
                ✕
              </button>
            </div>
            <div className="scheda-corpo pila-2">
              <div className="testo-faint">
                A {selezionato.destinatario.nome} {selezionato.destinatario.cognome} ·{' '}
                {dataOra(selezionato.creatoIl)}
              </div>
              <p style={{ whiteSpace: 'pre-wrap' }}>{selezionato.corpo}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ModuloMessaggio({
  amministratori,
  onChiuso,
  onInviato,
}: {
  amministratori: Collaboratore[];
  onChiuso: () => void;
  onInviato: () => void;
}) {
  const [destinatario, setDestinatario] = useState('');
  const [tipo, setTipo] = useState<'info' | 'avviso' | 'sollecito'>('info');
  const [oggetto, setOggetto] = useState('');
  const [corpo, setCorpo] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const destinatari = amministratori.filter((a) => a.role === 'admin');

  async function invia() {
    setErrore(null);
    setInCorso(true);
    try {
      await api.post('/contratti/messaggi', { destinatario, tipo, oggetto: oggetto.trim(), corpo });
      notifica('Messaggio inviato');
      onInviato();
    } catch (e) {
      setErrore(e instanceof ApiError ? (e.primoErroreValidazione ?? e.message) : 'Invio non riuscito');
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="velo" role="presentation" onClick={onChiuso}>
      <div
        className="scheda"
        role="dialog"
        aria-modal="true"
        aria-label="Nuovo messaggio"
        style={{ width: 'min(32rem, 94vw)', maxHeight: '92dvh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scheda-intestazione">
          <h2>Messaggio all’amministratore</h2>
          <button type="button" className="btn btn-fantasma btn-sm" onClick={onChiuso} aria-label="Chiudi">
            ✕
          </button>
        </div>

        <div className="scheda-corpo pila-3">
          <div className="campo">
            <label className="campo-etichetta" htmlFor="mm-dest">
              Destinatario
            </label>
            <select id="mm-dest" className="area" value={destinatario} onChange={(e) => setDestinatario(e.target.value)}>
              <option value="">Seleziona…</option>
              {destinatari.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome} {a.cognome} ({a.email})
                </option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="mm-tipo">
              Tipo
            </label>
            <select id="mm-tipo" className="area" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
              <option value="info">Informazione</option>
              <option value="avviso">Avviso</option>
              <option value="sollecito">Sollecito</option>
            </select>
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="mm-ogg">
              Oggetto
            </label>
            <input
              id="mm-ogg"
              className="area"
              value={oggetto}
              onChange={(e) => setOggetto(e.target.value)}
              placeholder="Es. Rinnovo del contratto per il prossimo anno"
            />
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="mm-corpo">
              Messaggio
            </label>
            <textarea
              id="mm-corpo"
              className="area area-testo"
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
            />
          </div>

          {errore && (
            <div className="avviso avviso-pericolo" role="alert">
              {errore}
            </div>
          )}

          <div className="riga">
            <button
              type="button"
              className="btn btn-primario cresci"
              onClick={invia}
              disabled={inCorso || !destinatario || !oggetto.trim()}
            >
              {inCorso ? 'Invio…' : 'Invia messaggio'}
            </button>
            <button type="button" className="btn btn-fantasma" onClick={onChiuso}>
              Annulla
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}