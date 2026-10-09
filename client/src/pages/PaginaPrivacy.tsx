import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/hooks/useApi';
import { api } from '@/api/client';
import { TitoloPagina } from '@/components/TitoloPagina';
import type { Condominio } from '@/types/domain';

/**
 * Informativa sul trattamento dei dati personali, una per ruolo.
 *
 * Il testo dice **che cosa facciamo e perché**, e nient'altro: le quattro pagine
 * esistono perché il titolare del trattamento cambia da un ruolo all'altro, ed è
 * il primo dato che va dichiarato.
 *
 * Sono pubbliche e stanno fuori da `RichiediAutenticazione`: l'informativa va
 * poter leggere prima di accedere, quando non si sa ancora quale ruolo avrà chi la
 * legge. Per questo le pagine sono divise per ruolo e non scelte dall'utente.
 */
type Ruolo = 'condomino' | 'admin' | 'portiere' | 'superadmin';

const RUOLI: { chiave: Ruolo; etichetta: string }[] = [
  { chiave: 'condomino', etichetta: 'Condòmino' },
  { chiave: 'admin', etichetta: 'Amministratore di condominio' },
  { chiave: 'portiere', etichetta: 'Personale dello stabile' },
  { chiave: 'superadmin', etichetta: 'Amministratore di piattaforma' },
];

export default function PaginaPrivacy() {
  const { ruolo } = useParams();
  const scelto = RUOLI.find((r) => r.chiave === ruolo);
  const { condominioId } = useAuth();

  // Il titolare dei dati del condòmino è il suo amministratore di condominio, e
  // cambia da condominio a condominio: lo leggiamo dal condominio attivo, che la
  // UI conosce già. Vale anche per il personale, che è stato assegnato da quella
  // stessa persona. Chi non è collegato riceve la formulazione generale.
  const leggeStabile = scelto?.chiave === 'condomino' || scelto?.chiave === 'portiere';
  const stabile = useApi<Condominio>(
    (segnale) =>
      api.get<Condominio>(`/condomini/${condominioId}`, undefined, { signal: segnale }).then((r) => r.data),
    [condominioId],
    { attivo: leggeStabile && Boolean(condominioId) },
  );

  return (
    <>
      <TitoloPagina
        titolo="Informativa sul trattamento dei dati personali"
        descrizione="Chi tratta i tuoi dati, perché, e come puoi chiederne la rettifica o la cancellazione."
      />

      <div className="pila-4">
        <nav className="riga riga-tra" aria-label="Scegli il tuo ruolo">
          {RUOLI.map((r) => (
            <Link
              key={r.chiave}
              to={`/privacy/${r.chiave}`}
              className={r.chiave === scelto?.chiave ? 'btn btn-primario' : 'btn btn-secondario'}
            >
              {r.etichetta}
            </Link>
          ))}
        </nav>

        {!scelto && (
          <p className="testo-muto">
            Scegli il ruolo che hai nell&apos;applicazione: l&apos;informativa è diversa perché
            cambia chi tratta i tuoi dati.
          </p>
        )}

        {scelto?.chiave === 'condomino' && <Condomino stabile={stabile.dati} />}
        {scelto?.chiave === 'admin' && <Amministratore />}
        {scelto?.chiave === 'portiere' && <Personale stabile={stabile.dati} />}
        {scelto?.chiave === 'superadmin' && <Piattaforma />}
      </div>
    </>
  );
}

function Condomino({ stabile }: { stabile: Condominio | null }) {
  const titolare = stabile?.amministratoreContatti;

  return (
    <article className="scheda">
      <div className="scheda-corpo pila-3">
        <h2>Chi tratta i tuoi dati</h2>
        <p>
          Li tratta{' '}
          {titolare ? (
            <strong>
              {titolare.nome} {titolare.cognome}
            </strong>
          ) : (
            <strong>l&apos;amministratore di condominio</strong>
          )}
          {stabile ? <> del condominio {stabile.nome}</> : null}, che amministra lo stabile in cui
          risiedi o in cui hai un&apos;unità. Gestione Condomini custodisce i dati
          nell&apos;applicazione e agisce per conto suo: non li usa per fini propri e non li cede a
          terzi.
        </p>

        <h2>A cosa servono</h2>
        <p>
          A tenere la contabilità dello stabilio: stabilire i millesimi, calcolare la quota dovuta,
          registrare i versamenti, convocare e verbalizzare le assemblee, e gestire le comunicazioni
          fra te e l&apos;amministratore.
        </p>

        <h2>Chi li vede</h2>
        <p>
          L&apos;amministratore e gli assistenti che gli ha delegato, per gli ambiti che ha loro
          concesso. Se ha assegnato a qualcuno un incarico di personale dello stabile, quella
          persona vede la rubrica con <strong>cognome, telefono e unità</strong> dei residenti, e
          nient&apos;altro: non la tua email, non i tuoi millesimi, non i tuoi versamenti.
        </p>
        <p>
          Ogni assegnazione e ogni revoca sono registrate, e puoi chiederne conto al tuo
          amministratore.
        </p>

        <Comuni />
      </div>
    </article>
  );
}

function Amministratore() {
  return (
    <article className="scheda">
      <div className="scheda-corpo pila-3">
        <h2>Chi tratta i tuoi dati</h2>
        <p>
          Gestione Condomini tratta i tuoi dati come amministratore: il tuo account, la tua attività,
          gli stabili che amministri. Sei il titolare perché operi per conto tuo.
        </p>
        <p>
          I dati dei <strong>condòmini</strong> che amministri non sono tuoi: sono trattati
          dall&apos;amministratore di condominio secondo l&apos;informativa dei condòmini, e Gestione
          Condomini ne è responsabile. Vale anche per il personale che ti assegni.
        </p>

        <h2>A cosa servono</h2>
        <p>
          A erogare il servizio che hai sottoscritto: i tuoi stabili, le unità, gli iscritti, le
          quote millesimali, i bilanci, le assemblee e i verbali.
        </p>

        <h2>Il personale che ti assegni</h2>
        <p>
          Decidi tu chi può vedere la rubrica dei residenti del tuo stabile. Il personale dello
          stabile vede cognome, telefono e unità, e i compiti che gli affidi: non vede quote,
          versamenti, bilanci né verbali. L&apos;assegnazione e la revoca vengono registrate.
        </p>

        <Comuni />
      </div>
    </article>
  );
}

function Personale({ stabile }: { stabile: Condominio | null }) {
  const titolare = stabile?.amministratoreContatti;

  return (
    <article className="scheda">
      <div className="scheda-corpo pila-3">
        <h2>Che ruolo hai sui dati che vedi</h2>
        <p>
          Sei <strong>destinatario</strong> dei dati personali dei residenti dello stabile in cui
          lavori, non l&apos;interessato di quelli che riguardano te. Per questo vale
          l&apos;informativa del personale, non quella dei condòmini né quella degli amministratori.
        </p>

        <h2>Chi li tratta</h2>
        <p>
          Li tratta{' '}
          {titolare ? (
            <strong>
              {titolare.nome} {titolare.cognome}
            </strong>
          ) : (
            <strong>l&apos;amministratore di condominio</strong>
          )}
          {stabile ? <> del condominio {stabile.nome}</> : null}, che ti ha affidato l&apos;incarico.
          Gestione Condomini è il responsabile del trattamento, perché fornisce l&apos;applicazione
          che te li fa vedere.
        </p>

        <h2>Cosa vedi</h2>
        <p>
          La rubrica dello stabile, con <strong>cognome, telefono e unità</strong> dei residenti
          iscritti. Non la loro email, i loro millesimi, le loro quote, i versamenti, i bilanci, i
          verbali né le comunicazioni.
        </p>
        <p>
          E i compiti che ti sono stati affidati, con il titolo e la descrizione che ha scritto
          l&apos;amministratore. Puoi segnarli come fatti; non puoi crearli, modificarli o
          eliminarli.
        </p>

        <h2>Cosa puoi farne</h2>
        <p>
          Servirtene per lo stabile: raggiungere chi abita in un&apos;unità, consegne, emergenze.
          Non puoi copiarli, divulgarli o trattarli per conto tuo.
        </p>

        <Comuni />
      </div>
    </article>
  );
}

function Piattaforma() {
  return (
    <article className="scheda">
      <div className="scheda-corpo pila-3">
        <h2>Chi tratta i tuoi dati</h2>
        <p>
          Gestione Condomini tratta i tuoi dati come amministratore di piattaforma, e i dati degli
          amministratori che amministri: per questi ultimi sei il titolare e Gestione Condomini è il
          suo responsabile. Quando gestisci un amministratore stai trattando dati di terzi per
          conto suo.
        </p>

        <h2>A cosa servono</h2>
        <p>
          A erogare il servizio agli amministratori: contratti e rate, comunicazioni di piattaforma e
          assistenza. Il registro delle operazioni serve alla sicurezza del servizio e alla verifica
          degli accessi.
        </p>

        <Comuni />
      </div>
    </article>
  );
}

/** Le parti che non cambiano con il ruolo. */
function Comuni() {
  return (
    <>
      <h2>Quali dati trattiamo</h2>
      <p>
        Il tuo account: nome, cognome, email e, se lo hai indicato, telefono. E un registro delle
        operazioni che fai, con la data, l&apos;azione e l&apos;indirizzo IP da cui è stata fatta.
      </p>

      <h2>Cookie</h2>
      <p>
        Ne usiamo <strong>uno solo</strong>, quello che mantiene la sessione aperta. Non è
        leggibile dalle pagine e non serve a profilarti. Non usiamo cookie di profilazione né
        strumenti di statistica.
      </p>

      <h2>Per quanto tempo</h2>
      <p>
        Il registro delle operazioni viene conservato per <strong>12 mesi</strong>. I dati di uno
        stabile — verbali, delibere, bilanci, quote, versamenti e comunicazioni — per{' '}
        <strong>10 anni</strong>, perché servono a documentare nel tempo come sono state prese le
        decisioni e come sono state calcolate le spese.
      </p>

      <h2>I tuoi diritti</h2>
      <p>
        Puoi chiedere di <strong>accedere</strong> ai tuoi dati, di farli <strong>rettificare</strong>,
        di <strong>cancellare</strong>, di <strong>limitare</strong> o di <strong>opporti</strong> al
        trattamento, e di riceverli in un formato leggibile da un altro programma.
      </p>
      <p>
        Li scarichi direttamente dall&apos;applicazione, dal tuo profilo. Per il resto — rettifica,
        cancellazione, opposizione — scrivi a Gestione Condomini. Se ritieni che il trattamento
        violi il regolamento, puoi presentare reclamo al Garante per la protezione dei dati
        personali.
      </p>
    </>
  );
}