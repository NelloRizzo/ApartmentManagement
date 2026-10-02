import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api, ApiError } from '@/api/client';
import { notifica } from '@/hooks/useNotifiche';
import { TitoloPagina } from '@/components/TitoloPagina';
import { etichette } from '@/components/Elementi';

export default function PaginaProfilo() {
  const { utente, logout, ricarica } = useAuth();
  const [nome, setNome] = useState(utente?.nome ?? '');
  const [cognome, setCognome] = useState(utente?.cognome ?? '');
  const [telefono, setTelefono] = useState(utente?.telefono ?? '');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  if (!utente) return null;

  async function salva() {
    setErrore(null);
    setInCorso(true);
    try {
      await api.patch('/auth/me', { nome, cognome, telefono: telefono || undefined });
      await ricarica();
      notifica('Profilo aggiornato');
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Salvataggio non riuscito');
    } finally {
      setInCorso(false);
    }
  }

  return (
    <>
      <TitoloPagina titolo="Profilo" descrizione={etichette.ruolo(utente.role)} />

      <section className="scheda" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="scheda-corpo pila-3">
          <div className="riga">
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="nome">
                Nome
              </label>
              <input id="nome" className="area" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="cognome">
                Cognome
              </label>
              <input id="cognome" className="area" value={cognome} onChange={(e) => setCognome(e.target.value)} />
            </div>
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="tel">
              Telefono
            </label>
            <input
              id="tel"
              className="area"
              type="tel"
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="+39 340 0000000"
            />
          </div>

          <div className="campo">
            <span className="campo-etichetta">Email</span>
            <p className="testo-muto">{utente.email}</p>
          </div>

          {errore && (
            <div className="avviso avviso-pericolo" role="alert">
              {errore}
            </div>
          )}

          <button type="button" className="btn btn-primario" onClick={salva} disabled={inCorso}>
            {inCorso ? 'Salvataggio…' : 'Salva profilo'}
          </button>
        </div>
      </section>

      <section className="scheda" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="scheda-intestazione">
          <h2>Le mie posizioni</h2>
        </div>
        <div className="elenco">
          {utente.condomini.map((c) => (
            <div key={c.condominioId} className="voce">
              <span className="cresci pila-1">
                <strong>
                  {c.nome} ({c.codice})
                </strong>
                <span className="testo-faint">
                  {etichette.regime(c.regime)} · unità {c.unita.join(', ')}
                  {c.quota < 100 ? ` · quota ${c.quota}%` : ''}
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="scheda" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="scheda-intestazione">
          <h2>Sessione</h2>
        </div>
        <div className="scheda-corpo pila-3">
          <p className="testo-muto">
            Accesso effettuato come {etichette.ruolo(utente.role)} su {utente.email}.
          </p>
          <button type="button" className="btn btn-secondario btn-pieno" onClick={() => void logout()}>
            Esci dall’account
          </button>
        </div>
      </section>
    </>
  );
}
