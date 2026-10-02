import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/hooks/useApi';
import { api, ApiError } from '@/api/client';
import { notifica } from '@/hooks/useNotifiche';
import { Caricamento, ErroreCaricamento, PaginaVuota } from '@/components/Feedback';
import { TitoloPagina } from '@/components/TitoloPagina';
import { RinviaConferma } from '@/components/RinviaConferma';
import { data as fmtData } from '@/lib/formattazione';
import { AMBITI, type Ambito, type Collaboratore, type EsitoConferma, type Permesso } from '@/types/domain';

const TUTTI: Permesso[] = AMBITI.flatMap((a) => [`${a.chiave}:leggere`, `${a.chiave}:scrivere`] as Permesso[]);

function tuttiIPermessi(): Permesso[] {
  return [...TUTTI];
}

export default function PaginaTeam() {
  const { utente, isSuperadmin } = useAuth();
  const [inModifica, setInModifica] = useState<Collaboratore | 'nuovo' | null>(null);

  const elenco = useApi<{ data: Collaboratore[]; meta: { total: number } }>(
    async (segnale) => {
      const risposta = await api.get<Collaboratore[]>(
        '/staff/assistenti',
        { page: 1, limit: 100, sort: 'cognome' },
        { signal: segnale },
      );
      return { data: risposta.data, meta: { total: risposta.meta?.total ?? risposta.data.length } };
    },
    [],
  );

  if (!utente) return null;

  const assistenti = elenco.dati?.data ?? [];

  return (
    <>
      <TitoloPagina
        titolo="Team e deleghe"
        descrizione="Delega ai tuoi collaboratori solo gli ambiti di cui hanno bisogno."
        azioni={
          <button type="button" className="btn btn-primario" onClick={() => setInModifica('nuovo')}>
            + Nuovo assistente
          </button>
        }
      />

      {isSuperadmin && (
        <div className="avviso avviso-info" style={{ marginBottom: 'var(--sp-3)' }}>
          Come amministratore di piattaforma vedi i tuoi assistenti. Per gestire gli amministratori di condominio e i
          contratti usa la sezione <strong>Piattaforma</strong>.
        </div>
      )}

      {elenco.inCorso && <Caricamento />}
      {elenco.errore && <ErroreCaricamento messaggio={elenco.errore} onRiprova={elenco.ricarica} />}

      {elenco.dati && assistenti.length === 0 && (
        <PaginaVuota
          titolo="Nessun assistente"
          descrizione="Delega a un collega solo gli ambiti necessari: potrà lavorare sui tuoi condomini senza poter modificare il resto."
        />
      )}

      <div className="elenco">
        {assistenti.map((a) => (
          <button
            key={a.id}
            type="button"
            className="scheda voce-clicabile"
            style={{ marginBottom: 'var(--sp-2)', textAlign: 'left' }}
            onClick={() => setInModifica(a)}
          >
            <div className="scheda-corpo pila-2">
              <div className="riga riga-tra">
                <strong>
                  {a.nome} {a.cognome}
                </strong>
                <div className="riga">
                  {!a.attivo ? (
                    <span className="etichetta etichetta-pericolo">Disattivato</span>
                  ) : a.accessoPieno ? (
                    <span className="etichetta etichetta-info">Accesso completo</span>
                  ) : (
                    <span className="etichetta etichetta-avviso">{a.permessi.length} ambiti delegati</span>
                  )}
                  {!a.emailConfermato && (
                    <span className="etichetta etichetta-avviso">Email non confermata</span>
                  )}
                </div>
              </div>
              <div className="testo-faint testo-faint-blocco">
                {a.email}
                {a.telefono ? ` · ${a.telefono}` : ''}
                {a.ultimoAccesso ? ` · ultimo accesso ${fmtData(a.ultimoAccesso)}` : ''}
              </div>
              {!a.accessoPieno && <ElencoAmbiti permessi={a.permessi} />}
            </div>
          </button>
        ))}
      </div>

      {elenco.dati && (
        <p className="testo-faint testo-centrato" style={{ marginTop: 'var(--sp-3)' }}>
          {elenco.dati.meta.total} assistenti
        </p>
      )}

      {inModifica && (
        <ModuloAssistente
          assistente={inModifica === 'nuovo' ? null : inModifica}
          onChiuso={() => setInModifica(null)}
          onSalvato={() => {
            setInModifica(null);
            elenco.ricarica();
          }}
        />
      )}
    </>
  );
}

export function ElencoAmbiti({ permessi }: { permessi: Permesso[] }) {
  const concessi = new Set(permessi);
  return (
    <div className="riga">
      {AMBITI.filter((a) => permessi.some((p) => p.startsWith(a.chiave))).map((a) => (
        <span key={a.chiave} className="etichetta etichetta-neutro">
          {a.etichetta}
          {concessi.has(`${a.chiave}:scrivere`) ? ' · completo' : ''}
        </span>
      ))}
    </div>
  );
}

function ModuloAssistente({
  assistente,
  onChiuso,
  onSalvato,
}: {
  assistente: Collaboratore | null;
  onChiuso: () => void;
  onSalvato: () => void;
}) {
  const [email, setEmail] = useState(assistente?.email ?? '');
  const [nome, setNome] = useState(assistente?.nome ?? '');
  const [cognome, setCognome] = useState(assistente?.cognome ?? '');
  const [telefono, setTelefono] = useState(assistente?.telefono ?? '');
  const [attivo, setAttivo] = useState(assistente?.attivo ?? true);
  const [permessi, setPermessi] = useState<Set<Permesso>>(
    new Set(assistente?.permessi ?? []),
  );
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  /** L'email non è partita: la password provvisoria va consegnata a mano. */
  const [passwordDaConsegnare, setPasswordDaConsegnare] = useState(false);

  function commuta(ambito: Ambito, azione: 'leggere' | 'scrivere') {
    setPermessi((precedenti) => {
      const prossimo = new Set(precedenti);
      const chiave = `${ambito}:${azione}` as Permesso;
      if (prossimo.has(chiave)) {
        prossimo.delete(chiave);
        // Togliere la scritture toglie anche la lettura: altrimenti l'ambito
        // resterebbe attivo solo in sola lettura.
        if (azione === 'scrivere') prossimo.delete(`${ambito}:leggere` as Permesso);
      } else {
        prossimo.add(chiave);
        if (azione === 'scrivere') prossimo.add(`${ambito}:leggere` as Permesso);
      }
      return prossimo;
    });
  }

  function selezionaTutto() {
    setPermessi(new Set(tuttiIPermessi()));
  }

  function svuota() {
    setPermessi(new Set());
  }

  const ambitiConcessi = AMBITI.filter((a) => permessi.has(`${a.chiave}:leggere` as Permesso)).length;

  async function salva() {
    setErrore(null);
    setInCorso(true);
    try {
      if (assistente) {
        await api.patch(`/staff/assistenti/${assistente.id}`, {
          nome,
          cognome,
          telefono: telefono || null,
          attivo,
          permessi: [...permessi],
        });
        notifica('Deleghe aggiornate');
      } else {
        const risposta = await api.post<{
          conferma?: EsitoConferma;
          passwordDaConsegnare?: boolean;
        }>('/staff/assistenti', {
          email: email.trim(),
          nome: nome.trim(),
          cognome: cognome.trim(),
          telefono: telefono.trim() || undefined,
          permessi: [...permessi],
        });
        /*
         * La password provvisoria viaggia nell'email: senza l'invio l'assistente
         * non avrebbe modo di sapere la sua, perché nessuno l'ha scelta. Va detto
         * apertamente, altrimenti l'amministratore crederebbe che sia arrivata.
         */
        if (risposta.data.conferma?.inviata) {
          notifica('Assistente creato: email con password provvisoria e link di conferma inviata.');
        } else {
          setPasswordDaConsegnare(true);
          notifica(
            'Assistente creato, ma l’email non è partita: la password provvisoria andrà consegnata a mano.',
            'errore',
          );
        }
      }
      onSalvato();
    } catch (e) {
      setErrore(e instanceof ApiError ? (e.primoErroreValidazione ?? e.message) : 'Salvataggio non riuscito');
    } finally {
      setInCorso(false);
    }
  }

  async function revoca() {
    if (!assistente) return;
    setInCorso(true);
    setErrore(null);
    try {
      await api.delete(`/staff/assistenti/${assistente.id}`);
      notifica('Delega revocata');
      onSalvato();
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Revoca non riuscita');
      setInCorso(false);
    }
  }

  return (
    <div className="velo" role="presentation" onClick={onChiuso}>
      <div
        className="scheda"
        role="dialog"
        aria-modal="true"
        aria-label={assistente ? 'Modifica delega' : 'Nuovo assistente'}
        style={{ width: 'min(48rem, 96vw)', maxHeight: '92dvh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="scheda-intestazione">
          <h2>{assistente ? `${assistente.nome} ${assistente.cognome}` : 'Nuovo assistente'}</h2>
          <button type="button" className="btn btn-fantasma btn-sm" onClick={onChiuso} aria-label="Chiudi">
            ✕
          </button>
        </div>

        <div className="scheda-corpo pila-4">
          {!assistente && (
            <>
              <div className="avviso avviso-info">
                Se l’email è già registrata, l’utente viene convertito in assistente. Altrimenti viene creato un
                account con password provvisoria.
              </div>
              <div className="campo">
                <label className="campo-etichetta" htmlFor="a-email">
                  Email
                </label>
                <input
                  id="a-email"
                  className="area"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="riga">
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="a-nome">
                Nome
              </label>
              <input id="a-nome" className="area" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="campo cresci">
              <label className="campo-etichetta" htmlFor="a-cognome">
                Cognome
              </label>
              <input
                id="a-cognome"
                className="area"
                value={cognome}
                onChange={(e) => setCognome(e.target.value)}
              />
            </div>
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="a-tel">
              Telefono
            </label>
            <input
              id="a-tel"
              className="area"
              type="tel"
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </div>

          <div className="campo">
            <div className="riga riga-tra">
              <span className="campo-etichetta">Ambiti delegati</span>
              <div className="riga">
                <button type="button" className="btn btn-secondario btn-sm" onClick={selezionaTutto}>
                  Tutti
                </button>
                <button type="button" className="btn btn-fantasma btn-sm" onClick={svuota}>
                  Nessuno
                </button>
              </div>
            </div>
            <span className="campo-aiuto">
              Concedere la scrittura comprende anche la lettura. Un ambiente con sola lettura nasconde i pulsanti
              di modifica ma permette di consultare i dati.
            </span>

            <div style={{ marginTop: 'var(--sp-2)' }}>
              {AMBITI.map((a) => (
                <div
                  key={a.chiave}
                  style={{
                    borderBottom: '1px solid var(--c-border)',
                    padding: 'var(--sp-2) 0',
                  }}
                >
                  <div className="riga riga-tra">
                    <div className="cresci">
                      <strong style={{ fontSize: 'var(--fs-sm)' }}>{a.etichetta}</strong>
                      <div className="testo-faint">{a.descrizione}</div>
                    </div>
                    <div className="riga">
                      <label className="casella" style={{ padding: 0 }}>
                        <input
                          type="checkbox"
                          checked={permessi.has(`${a.chiave}:leggere` as Permesso)}
                          onChange={() => commuta(a.chiave, 'leggere')}
                        />
                        <span style={{ fontSize: 'var(--fs-sm)' }}>Legge</span>
                      </label>
                      <label className="casella" style={{ padding: 0 }}>
                        <input
                          type="checkbox"
                          checked={permessi.has(`${a.chiave}:scrivere` as Permesso)}
                          onChange={() => commuta(a.chiave, 'scrivere')}
                        />
                        <span style={{ fontSize: 'var(--fs-sm)' }}>Scrive</span>
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {permessi.size === 0 && (
            <div className="avviso avviso-avviso">
              Senza ambiti delegati l’assistente potrà solo consultare l’app, ma non operare.
            </div>
          )}

          {assistente && (
            <label className="casella">
              <input type="checkbox" checked={attivo} onChange={(e) => setAttivo(e.target.checked)} />
              <span>Accesso consentito</span>
            </label>
          )}

          {errore && (
            <div className="avviso avviso-pericolo" role="alert">
              {errore}
            </div>
          )}

          {passwordDaConsegnare && (
            <div className="avviso avviso-pericolo" role="alert">
              L&apos;email non è partita, quindi l&apos;assistente non ha ricevuto la password
              provvisoria. Il server non la conserva in chiaro: annulla la delega e ricrea
              l&apos;assistente quando l&apos;invio torna disponibile.
            </div>
          )}

          <div className="riga">
            <button
              type="button"
              className="btn btn-primario cresci"
              onClick={salva}
              disabled={inCorso || (ambitiConcessi === 0 && !assistente)}
            >
              {inCorso ? 'Salvataggio…' : 'Salva'}
            </button>
            <button type="button" className="btn btn-fantasma" onClick={onChiuso}>
              Annulla
            </button>
            {assistente && (
              <button type="button" className="btn btn-pericolo" onClick={revoca} disabled={inCorso}>
                Revoca delega
              </button>
            )}
          </div>

          {/*
            Il reinvio sta qui e non sulla card: la card è un pulsante che apre
            questo modulo, e annidare un secondo pulsante produrrebbe HTML non
            valido e un click ambiguo.
          */}
          {assistente && !assistente.emailConfermato && (
            <div className="avviso avviso-avviso pila-2">
              <div>
                <strong>Indirizzo email non confermato.</strong> {assistente.email} non ha ancora
                confermato la propria casella: se l&apos;indirizzo non è suo, nessuno potrà
                accorgersene.
              </div>
              <RinviaConferma
                url={`/staff/assistenti/${assistente.id}/reinvia-conferma`}
                destinatario={assistente.email}
                alTermine={onSalvato}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}