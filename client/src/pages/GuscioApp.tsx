import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { iniziali } from '@/lib/formattazione';
import { etichette } from '@/components/Elementi';
import { gruppiNavigazione, vociPrimarie, type VoceNavigazione } from '@/components/navigazione';

/** Titolo dell'intestazione per chi non amministra alcun condominio. */
const TITOLI_SEZIONE: Record<string, string> = {
  p: 'Dashboard',
  'p/contratti': 'Contratti',
  'p/amministratori': 'Amministratori',
  'p/messaggi': 'Messaggi agli amministratori',
  profilo: 'Profilo e posizioni',
  contratto: 'Il mio contratto',
};

/**
 * Riduce il percorso alla sezione: `/p/contratti/6abe…` restituisce `p/contratti`,
 * mentre le rotte di dettaglio senza sezione propria restano come sono.
 */
function segnaleDiSezione(percorso: string): string {
  const parti = percorso.split('/').filter(Boolean);
  if (parti[0] === 'p') return parti.length > 1 ? `p/${parti[1]}` : 'p';
  return parti.join('/');
}

export default function GuscioApp() {
  const { utente, logout, condominioId, selezionaCondominio, nonLette, puo } = useAuth();
  const naviga = useNavigate();
  const posizione = useLocation();
  const [pannelloAperto, setPannelloAperto] = useState(false);

  // Il pannello si richiude a ogni cambio di rotta, così non resta aperto
  // sovrapposto alla pagina successiva.
  useEffect(() => {
    setPannelloAperto(false);
  }, [posizione.pathname]);

  if (!utente) return null;

  const selezionata = utente.condomini.find((c) => c.condominioId === condominioId);
  // Il superadmin amministra solo gli stabili di cui è titolare: negli altri
  // le rotte di condominio rispondono 403, quindi non gli si propongono.
  const amministra = utente.condomini.some((c) => !c.assistito);

  /*
   * Nell'intestazione il nome del condominio compare solo a chi quel condominio
   * lo amministra. Al superadmin che non ne amministra nessuno mostrerebbe il
   * nome di uno stabile su cui non può operare: meglio il titolo della sezione
   * che sta aprendo. Gli altri ruoli, portiere compreso, continuano a vedere il
   * nome dello stabile in cui operano.
   */
  const titoloIntestazione =
    utente.role === 'superadmin' && !amministra
      ? (TITOLI_SEZIONE[segnaleDiSezione(posizione.pathname)] ?? 'Steward')
      : (selezionata?.nome ?? 'Steward');

  // Le sezioni non delegate non vengono mostrate: il backend le rifiuterebbe.
  const gruppi = gruppiNavigazione(utente.role, puo, amministra);
  const primarie = vociPrimarie(utente.role, puo, amministra);

  async function esci() {
    await logout();
    naviga('/accedi', { replace: true });
  }

  return (
    <div className="guscio-con-barra">
      {/* Sidebar: unica navigazione su desktop. */}
      <nav className="barra-laterale" aria-label="Navigazione principale">
        <div className="barra-marca">
          <span className="barra-marca-simbolo" aria-hidden="true">
            ⌂
          </span>
          <span>
            <strong>Steward</strong>
            <span className="testo-faint">{etichette.ruolo(utente.role)}</span>
          </span>
        </div>

        {/*
          I selettori si mostrano solo a chi amministra almeno uno stabile: al
          superadmin che non ne gestisce nessuno offrirebbero condomini su cui
          tutte le sezioni rispondono 403.
        */}
        {amministra && utente.condomini.length > 1 && (
          <div className="campo barra-condominio">
            <label className="campo-etichetta" htmlFor="sel-cond-barra">
              Condominio
            </label>
            <select
              id="sel-cond-barra"
              className="area"
              value={condominioId ?? ''}
              onChange={(e) => selezionaCondominio(e.target.value)}
            >
              {utente.condomini.map((c) => (
                <option key={c.condominioId} value={c.condominioId}>
                  {c.nome} ({c.codice})
                </option>
              ))}
            </select>
          </div>
        )}

        {gruppi.map((gruppo) => (
          <div key={gruppo.titolo} className="barra-gruppo">
            <span className="barra-gruppo-titolo">{gruppo.titolo}</span>
            {gruppo.voci.map((voce) => (
              <VoceBarra
                key={voce.a}
                voce={voce}
                nonLette={voce.badge ? nonLette : 0}
                attivo={posizione.pathname === voce.a}
              />
            ))}
          </div>
        ))}

        <div className="barra-piè">
          <button type="button" className="btn btn-secondario btn-sm btn-pieno" onClick={esci}>
            Esci
          </button>
        </div>
      </nav>

      <div className="guscio">
        <header className="intestazione">
          <button
            type="button"
            className="intestazione-azione barra-mobile"
            onClick={() => setPannelloAperto(true)}
            aria-label="Apri il menu"
            aria-expanded={pannelloAperto}
          >
            ☰
          </button>
          <div className="intestazione-titolo">{titoloIntestazione}</div>
          <span className="etichetta etichetta-info" title={etichette.ruolo(utente.role)}>
            {iniziali(utente.nome, utente.cognome)}
          </span>
        </header>

        {/*
          Il selettore si mostra solo a chi amministra almeno uno stabile: al
          superadmin che non ne gestisce nessuno offrirebbe condomini su cui
          tutte le sezioni rispondono 403.
        */}
        {amministra && utente.condomini.length > 1 && (
          <div className="condominio-sbarra">
            <select
              className="area"
              aria-label="Seleziona condominio"
              value={condominioId ?? ''}
              onChange={(e) => selezionaCondominio(e.target.value)}
            >
              {utente.condomini.map((c) => (
                <option key={c.condominioId} value={c.condominioId}>
                  {c.nome} ({c.codice})
                </option>
              ))}
            </select>
          </div>
        )}

        <main className="contenuto">
          {!utente.emailConfermato && <AvvisoConfermaEmail />}
          <Outlet />
        </main>

        {/* Barra inferiore: solo su schermi stretti (il CSS la nasconde da 48rem). */}
        <nav className="nav-inferiore" aria-label="Sezioni principali">
          {primarie.map((voce) => (
            <NavLink
              key={voce.a}
              to={voce.a}
              className={({ isActive }) => `nav-voce${isActive ? ' attiva' : ''}`}
            >
              <span className="nav-icona" aria-hidden="true">
                {voce.icona}
              </span>
              <span>{voce.etichetta}</span>
              {voce.badge && nonLette > 0 && <span className="nav-badge">{nonLette > 9 ? '9+' : nonLette}</span>}
            </NavLink>
          ))}
          <button
            type="button"
            className="nav-voce"
            onClick={() => setPannelloAperto(true)}
            aria-label="Apri tutte le sezioni"
          >
            <span className="nav-icona" aria-hidden="true">
              ☰
            </span>
            <span>Altro</span>
          </button>
        </nav>

        {pannelloAperto && (
          <div className="velo velo-lato" role="presentation" onClick={() => setPannelloAperto(false)}>
            <div
              className="pannello"
              role="dialog"
              aria-modal="true"
              aria-label="Tutte le sezioni"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pannello-intestazione">
                <div>
                  <strong>
                    {utente.nome} {utente.cognome}
                  </strong>
                  <div className="testo-faint">{etichette.ruolo(utente.role)}</div>
                </div>
                <button
                  type="button"
                  className="btn btn-fantasma btn-sm"
                  onClick={() => setPannelloAperto(false)}
                  aria-label="Chiudi il menu"
                >
                  ✕
                </button>
              </div>

              <div className="pannello-corpo">
                {gruppi.map((gruppo) => (
                  <div key={gruppo.titolo} className="pila-1">
                    <span className="barra-gruppo-titolo">{gruppo.titolo}</span>
                    {gruppo.voci.map((voce) => (
                      <VoceBarra
                        key={voce.a}
                        voce={voce}
                        nonLette={voce.badge ? nonLette : 0}
                        attivo={posizione.pathname === voce.a}
                      />
                    ))}
                  </div>
                ))}

                <button type="button" className="btn btn-secondario btn-pieno" onClick={esci}>
                  Esci dall’account
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function VoceBarra({
  voce,
  nonLette,
  attivo,
}: {
  voce: VoceNavigazione;
  nonLette: number;
  attivo: boolean;
}) {
  return (
    <NavLink to={voce.a} className={`barra-voce${attivo ? ' attiva' : ''}`} end>
      <span className="barra-voce-icona" aria-hidden="true">
        {voce.icona}
      </span>
      <span className="cresci">{voce.etichetta}</span>
      {voce.badge && nonLette > 0 && <span className="nav-badge">{nonLette > 9 ? '9+' : nonLette}</span>}
    </NavLink>
  );
}
/**
 * Avviso per un indirizzo email non ancora confermato.
 *
 * L'accesso resta consentito: bloccarlo renderebbe inutilizzabili gli account
 * il cui indirizzo non è stato ancora cliccato, mentre il problema da segnalare
 * è solo che non sappiamo che l'email è davvero sua. Il pulsante serve perché chi
 * ha creato l'utente sappia comunque recapitargli il link.
 */
function AvvisoConfermaEmail() {
  const { utente, reinviaConferma } = useAuth();
  const [inCorso, setInCorso] = useState(false);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [fallito, setFallito] = useState(false);

  async function reinvia() {
    setInCorso(true);
    setMessaggio(null);
    const esito = await reinviaConferma();
    setInCorso(false);
    if (esito.ok) {
      setMessaggio('Email di conferma reinviata: controlla la posta, anche lo spam.');
    } else {
      setFallito(true);
      setMessaggio(esito.errore ?? 'Invio non riuscito');
    }
  }

  return (
    <div className={`avviso ${fallito ? 'avviso-pericolo' : 'avviso-avviso'}`} role="status">
      <div className="riga riga-tra">
        <div className="cresci pila-1">
          <strong>Conferma il tuo indirizzo email.</strong>
          <span>
            Abbiamo scritto a <strong>{utente?.email}</strong>. Finché non apri il link non sappiamo che
            l&apos;indirizzo sia tuo: se l&apos;email è sbagliata, nessuno potrà rubarti l&apos;account.
          </span>
          {messaggio && <span>{messaggio}</span>}
        </div>
        <button type="button" className="btn btn-secondario btn-sm" onClick={reinvia} disabled={inCorso}>
          {inCorso ? 'Invio…' : 'Reinvia email'}
        </button>
      </div>
    </div>
  );
}