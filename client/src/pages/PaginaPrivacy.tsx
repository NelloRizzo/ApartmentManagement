import { Link, useParams } from 'react-router-dom';
import { TitoloPagina } from '@/components/TitoloPagina';

/**
 * Informativa sul trattamento dei dati personali, una per ruolo.
 *
 * **È una bozza, e va riletta da chi ne è responsabile prima della pubblicazione.**
 * Le parti descrittive sono state ricavate dal codice e quindi descrivono il
 * comportamento reale; i valori segnati con `DA COMPILARE` non si possono dedurre
 * e sono quelli su cui il responsabile del trattamento deve decidere.
 *
 * Il testo è **pubblico** e vive fuori da `RichiediAutenticazione`: l'informativa
 * va poter leggere prima di accedere, quando non si sa ancora quale ruolo
 * avrà chi la legge, ed è per questo che le pagine sono divise per ruolo e non
 * scelte dall'utente.
 *
 * I ruoli sono quelli di `UserRole`: la divisione non è per comodità, perché il
 * **titolare del trattamento cambia** da uno all'altro ed è il dato che l'informativa
 * deve dichiarare per prima.
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

  return (
    <>
      <TitoloPagina
        titolo="Informativa sul trattamento dei dati personali"
        descrizione="Chi tratta i tuoi dati, perché, e come puoi chiederne la rettifica o la cancellazione."
      />

      <div className="pila-4">
        <div className="avviso avviso-avviso">
          <strong>Documento in bozza.</strong> I dati che l&apos;applicazione tratta sono descritti
          come sono, ma i valori commerciali e legali sono ancora da completare e la
          pubblicazione deve essere preceduta da una rilettura di chi ne è responsabile.
        </div>

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

        {scelto?.chiave === 'condomino' && <Condomino />}
        {scelto?.chiave === 'admin' && <Amministratore />}
        {scelto?.chiave === 'portiere' && <Personale />}
        {scelto?.chiave === 'superadmin' && <Piattaforma />}
      </div>
    </>
  );
}

/** Le voci comuni: quelle che non cambiano con il ruolo vanno dette una volta sola. */
function Comuni() {
  return (
    <>
      <h2>Che dati trattiamo, in ogni caso</h2>
      <p>
        Il tuo account porta nome, cognome, indirizzo email e, se lo hai indicato, il numero di
        telefono. A questi si aggiunge un registro delle operazioni che fai: ogni azione che
        lascia una traccia (una quota salvata, una revisione della tabella millesimale, un verbale
        approvato) viene registrata con la data, l&apos;operazione e l&apos;indirizzo IP da cui è
        stata fatta.
      </p>
      <p>
        L&apos;indirizzo IP è la ragione per cui non è un dettaglio: serve a risalire a chi ha
        fatto una cosa nel caso di un contesto, ed è per questo che finisce nell&apos;esportazione
        dei tuoi dati.
      </p>

      <h2>Cookie</h2>
      <p>
        L&apos;applicazione usa <strong>un solo cookie</strong>: quello che mantiene la sessione
        aperta, di nome <code>refresh</code>. Non è leggibile dal codice delle pagine — sta
        solo nella zona riservata al server — e non serve a profilarti. Non usiamo cookie di
        profilazione né strumenti di statistica, quindi non c&apos;è un banner di consenso da
        accettare.
      </p>

      <h2>Per quanto tempo li conserviamo</h2>
      <p>
        Il <strong>registro delle operazioni</strong> — quello che comprende anche gli indirizzi IP —
        viene conservato per <strong>12 mesi</strong>. I dati di uno stabile, cioè verbali, delibere,
        bilanci, quote, versamenti e comunicazioni, vengono conservati per <strong>10 anni</strong>,
        perché servono a dimostrare nel tempo come sono state prese le decisioni dell&apos;assemblea e
        come sono state calcolate le spese.
      </p>
      <p>
        Trascorso il periodo i dati vengono cancellati. <strong>DA VERIFICARE</strong> — questa è
        una scadenza che il testo dichiara e che il sistema deve applicare: se non c&apos;è una
        cancellazione automatica, la promise va mantenuta con un intervento manuale e scritto, e
        questa frase va riletta di conseguenza.
      </p>

      <h2>I tuoi diritti</h2>
      <p>
        Puoi chiedere di <strong>accedere</strong> ai tuoi dati, di farli <strong>rettificare</strong>,
        di <strong>cancellare</strong>, di <strong>limitare</strong> o di <strong>opporti</strong> al
        trattamento, e di riceverli in un formato leggibile da un altro programma. Puoi revocare
        un consenso quando il trattamento si basa su di esso.
      </p>
      <p>
        I dati li scarichi direttamente dall&apos;applicazione, dal tuo profilo. Per il resto —
        rettifica, cancellazione, opposizione — scrivi a <strong>DA COMPILARE</strong>.
      </p>
      <p>
        Se ritieni che il trattamento violi il regolamento, puoi presentare reclamo al Garante per la
        protezione dei dati personali.
      </p>
    </>
  );
}

function Condomino() {
  return (
    <article className="scheda">
      <div className="scheda-corpo pila-3">
        <h2>Chi tratta i tuoi dati</h2>
        <p>
          I tuoi dati di condòmino — le unità di cui sei titolare o fruitore, i tuoi millesimi, i
          versamenti, le assemblee a cui partecipi — li tratta <strong>l&apos;amministratore di
          condominio</strong> che amministra lo stabile, perché è lui che li usa per conto del
          condominio. <strong>DA COMPILARE: nome e indirizzo dell&apos;amministratore</strong>, che
          cambia da condominio a condominio e per questo va indicato stabilimento per stabilimento.
        </p>
        <p>
          Gestione Condomini <strong>DA COMPILARE: denominazione e indirizzo</strong> tratta questi
          stessi dati in qualità di <strong>responsabile del trattamento</strong>, perché li
          custodisce nell&apos;applicazione: è il software che li raccoglie e li restituisce a chi
          amministra. Non li usa per finalità proprie e non li cede a terzi.
        </p>

        <h2>Perché sono trattati</h2>
        <p>
          Per gestire la contabilità dello stabile: stabilire e applicare i millesimi, calcolare la
          quota dovuta, registrare i versamenti, convocare e verbalizzare le assemblee, gestire le
          comunicazioni fra te e l&apos;amministratore. La base giuridica è
          <strong> DA COMPILARE — proposta: esecuzione del contratto e legittimo interesse
          dell&apos;amministratore</strong> (art. 6 comma 1 lett. b e f del regolamento). La scelta va
          confermata da chi ne è responsabile.
        </p>

        <h2>Chi altro li vede</h2>
        <p>
          <strong>Il personale dello stabile.</strong> Se l&apos;amministratore assegna a qualcuno
          un incarico di portiere o di servizio, quella persona vede la rubrica dello stabile con
          <strong>cognome, telefono e unità</strong> — non la tua email, non i tuoi millesimi, non i
          tuoi versamenti. L&apos;assegnazione è un atto dell&apos;amministratore, viene registrata e
          può essere revocata in qualsiasi momento.
        </p>
        <p>
          Il resto lo vede il solo amministratore e i suoi eventuali assistenti, per gli ambiti che
          ha loro delegato.
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
          I dati che ti riguardano come amministratore — il tuo account, la tua attività, gli
          stabili che amministri — li tratta <strong>Gestione Condomini</strong>,
          <strong> DA COMPILARE: denominazione e indirizzo</strong>, in qualità di
          <strong>titolare del trattamento</strong>: sei tu il titolare perché operi per conto tuo
          e non per conto di terzi.
        </p>
        <p>
          Attenzione alla differenza, perché è il punto delicato del ruolo: i dati dei
          <strong>condòmini</strong> che amministri non sono tuoi e non puoi usarne per finalità
          tue. Sono dell&apos;amministratore di condominio nel senso indicato nell&apos;informativa
          dei condòmini, e Gestione Condomini ne è responsabile. Vale anche per il personale dello
          stabile che ti asseghi.
        </p>

        <h2>Perché sono trattati</h2>
        <p>
          Per erogare e gestire il servizio che hai sottoscritto: i tuoi stabili, le unità, gli
          iscritti, le quote millesimali, i bilanci, le assemblee e i verbali. La base giuridica è
          <strong> DA COMPILARE — proposta: esecuzione del contratto</strong> (art. 6 comma 1 lett. b).
        </p>
        <p>
          Trattiamo anche i dati dei tuoi assistenti e del personale che ti assegna, perché servono
          a dare loro accesso agli stabili: sono dati che tu ci hai chiesto di trattare, e sei tu il
          titolare per questo specifico trattamento.
        </p>

        <h2>Il personale che ti assegni</h2>
        <p>
          Quando assegni a qualcuno un incarico di portiere, decidi tu che quella persona veda la
          rubrica dei residenti con cognome, telefono e unità. È una tua decisione, non nostra: noi
          registriamo l&apos;assegnazione e la revoca nel registro operazioni. Un portiere non vede
          quote, versamenti, bilanci né verbali.
        </p>

        <Comuni />
      </div>
    </article>
  );
}

function Personale() {
  return (
    <article className="scheda">
      <div className="scheda-corpo pila-3">
        <h2>Perché questa informativa è diversa dalle altre</h2>
        <p>
          Sei <strong>destinatario</strong> dei dati personali dei residenti dello stabile in cui
          lavori, non l&apos;interessato di quelli che riguardano te. Per questo il titolare del
          trattamento non sei tu, e non vale l&apos;informativa dei condòmini né quella degli
          amministratori.
        </p>

        <h2>Chi tratta i dati che vedi</h2>
        <p>
          Li tratta <strong>l&apos;amministratore di condominio</strong> che ti ha assegnato
          l&apos;incarico — <strong>DA COMPILARE: nome e indirizzo</strong> — per la finalità di
          gestire il rapporto con i residenti. Gestione Condomini
          <strong> DA COMPILARE: denominazione e indirizzo</strong> è il
          <strong>responsabile del trattamento</strong>, perché fornisce l&apos;applicazione che ti
          fa vedere quei dati.
        </p>

        <h2>Quali dati vedi, e quali no</h2>
        <p>
          Vedi la <strong>rubrica dello stabile</strong>: cognome, numero di telefono e unità
          immobiliari dei residenti iscritti. Non vedi la loro email, i loro millesimi, le loro quote,
          i versamenti, i bilanci, i verbali né le comunicazioni. Non puoi modificare nulla di
          tutto questo: la tua unica possibilità di scrittura è segnare come «fatto» i compiti che
          ti sono stati affidati.
        </p>
        <p>
          Vedi inoltre i compiti che l&apos;amministratore ti affida, con il titolo e la descrizione
          che ha scritto. Se un compito contiene dati di terzi, è l&apos;amministratore che ne
          risponde.
        </p>

        <h2>Per quanto puoi trattarli</h2>
        <p>
          Non puoi usare questi dati <strong>solo per servire lo stabile</strong>: per raggiungere chi
          abita in un&apos;unità, per consegne, per emergenze. Non puoi copiarli, divulgarli a terzi,
          né trattarli per conto tuo. Ogni revoca dell&apos;incarico fa cessare questo accesso da
          parte tua, e l&apos;amministratore può revocarlo in qualsiasi momento.
        </p>
        <p>
          <strong>DA COMPILARE</strong> — l&apos;amministratore di condominio deve dichiarare nel suo
          proprio documento quali tempi di conservazione applica ai dati che ti ha messo a
          disposizione, e se il tuo incarico comporta degli obblighi di riservatezza da far valere
          per iscritto.
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
          <strong>Gestione Condomini — DA COMPILARE: denominazione e indirizzo</strong> è il
          <strong>titolare del trattamento</strong> dei dati che ti riguardano come amministratore
          di piattaforma, e anche dei dati degli amministratori che amministri: per questi ultimi sei
          il titolare e noi siamo i suoi responsabili. Il confine è netto e vale la pena tenerlo
          chiaro: quando gestisci un amministratore stai trattando dati di terzi per conto suo, non
          dati tuoi.
        </p>

        <h2>Perché sono trattati</h2>
        <p>
          Per erogare il servizio agli amministratori, gestire i contratti e le relative rate,
          inviare le comunicazioni di piattaforma e assisterli. La base giuridica è
          <strong> DA COMPILARE — proposta: esecuzione del contratto</strong>.
        </p>
        <p>
          Il registro operazioni che riguarda le tue azioni ha come finalità la sicurezza del servizio
          e la verifica degli accessi: viene conservato per <strong>12 mesi</strong>.
        </p>

        <Comuni />
      </div>
    </article>
  );
}