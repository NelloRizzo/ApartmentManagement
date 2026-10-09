# Idee da fare

_Le voci di primo livello sono numerate e la numerazione è continua: per parlarne
basta il numero. Una voce realizzata si cancella e la sua ragione va nel
`CHANGELOG.md`, come per i bug in `bugs.md`. L'unica eccezione è
`IMPLEMENTAZIONI FUTURE`, le cui voci non si numerano._

IMPLEMENTAZIONI FUTURE
_(voci rimandate e idee messe da parte, da riprendere quando si ha tempo: in
questa sezione le voci non si numerano, per parlarne basta il titolo.
**L'ordine in cui sono elencate è l'ordine di esecuzione**: la prima che si
affronta è la prima della lista.)_
- Il ruolo `portiere`: lo crea l'amministratore di condominio, vede i condòmini e annota i propri compiti
  - **deciso**: il portiere serve **un solo stabile**, ed è creato dall'amministratore di condominio come gli altri appartenenti al suo team
  - **non può essere un assistente con permessi**: `registraDelegazione` aggiunge l'assistente a **tutti** i condomini del delegante, e `User.permessi` è un elenco unico valido ovunque, quindi un "portiere-assistente" vedrebbe l'intero portafoglio con gli stessi permessi. Il ruolo dedicato e il legame in `condominiServito` esistono proprio per questo
  - oggi il ruolo è **implementato e non attivabile**: nessuna rotta crea un `User` con `role: 'portiere'`, e `addServizio` collega un utente a `condominiServito` **senza impostargli il ruolo**, mentre ogni guard decide su `role`. Il client non chiama mai `/servizi`, non c'è schermata per scegliere a chi assegnare il servizio, il seed non ne crea e nessuna verifica lo copre
  - **due modi di dire la stessa cosa** — "è in `condominiServito`" e "`role` vale `portiere`" — che possono contraddirsi senza che nulla lo mostri, perché finora non è stato usato nessuno dei due
  - **prima delle altre due voci della sezione**, perché le blocca entrambe: la guida dovrebbe documentare schermate che non esistono, e l'informativa del portiere descriverebbe un flusso di dati che non c'è ancora
  - passi, nell'ordine:
    - **creazione**: `POST /condomini/:id/servizi` deve **creare** l'account invece di collegare un id esistente: email, nome, cognome, telefono, `passwordTemporanea` e `inviaConfermaA` come per gli altri del team, ruolo impostato a `portiere`, legame in `condominiServito`
    - schermata di assegnazione **nello stabile**, dove si gestiscono gli iscritti, non in `/c/team`: il team è del team, il portiere è dello stabile
    - **bacheca: la struttura attuale non basta**. `Attivita` non ha un condominio (`/staff/attivita` è l'unico router fuori da `/condomini/:id`) mentre il portiere serve un solo stabile: senza lo scope, un amministratore con cinque stabili può assegnare il compito di uno al portiere di un altro. Serve `Attivita.condominio` e validare gli assegnatari contro "chi serve quello stabile"
    - la parte "il portiere annota i suoi compiti" **è già scritta**: `filtroVisibile` è proprietario o assegnatario e `assicuraPuoSegnareFatto` dà lo stesso diritto a entrambi. Il blocco è solo il `requireRole('admin')` a monte del router e `assicuraAssegnatari`, che valida gli assegnatari contro il team e quindi rifiuterebbe un portiere
    - navigazione: il portiere vede oggi solo la sezione Account, mentre `RichiediAmministratore` gli lascia passare le pagine di gestione senza che il menu le proponga
    - **condòmini**: `GET /condomini/:id/unita` usa `requirePermesso` e blocca anche il portiere, e `GET /condomini/:id/condomini` richiede `iscritti:leggere` e restituisce contatti **e millesimi**. Serve una lettura dedicata al portiere con **codice unità, piano, cognome e telefono**: niente email, niente millesimi né quota. A un portiere serve bussare alla porta, non sapere la posizione patrimoniale del condòmino
    - verifiche: `npm test` per i guard e uno script che copra creazione, assegnazione di un compito e revoca del servizio
  - **privacy**: così il portiere diventa **destinatario** dei dati personali dei condòmini, non titolare dei propri. Tre conseguenze, da riprendere nella voce sulla privacy policy: l'assegnazione è un atto dell'amministratore di condominio e deve essere **registrata e revocabile** (un interruttore per stabile, non una concessione permanente), l'informativa del portiere è una **terza** e diversa da quella del condòmino perché non è l'interessato di quei dati, e l'informativa del condòmino deve dire che i propri dati di contatto possono essere visibili al personale dello stabile
- Privacy policy per ruolo
  - serve un'informativa distinta per chi usa l'applicazione, perché il titolare del trattamento cambia
  - condòmini: il titolare è l'amministratore di condominio, che tratta i dati delle unità e delle quote per conto del condominio; Gestione Condomini agisce da responsabile del trattamento
  - amministratori di condominio: il titolare è l'amministratore di piattaforma, che tratta i dati del team e degli amministratori
  - due ruoli non sono coperti: il **superadmin** (Gestione Condomini è insieme titolare e responsabile per i dati del team e degli amministratori) e il **portiere** (il titolare è l'amministratore di condominio, come per il condòmino, ma per il portiere l'informativa è un'altra ancora: non è l'interessato dei dati che vede, è chi li riceve per servire lo stabile)
  - **nessun banner cookie serve**: l'unico cookie è il refresh token `httpOnly` con path `/api/auth`, non ci sono analytics né pixel. Il "registro dei consensi" serve solo se si aggiungono tracciamenti non necessari, quindi non va costruito insieme all'informativa
  - passi, nell'ordine:
    - **decidere consenso o presa visione**: non esiste registrazione self-service (`auth.routes.ts` espone solo login, refresh, logout e conferma email, e gli account li crea il superadmin o l'amministratore), quindi non c'è un momento naturale in cui raccogliere il consenso. La proposta è **presa visione**: spunta e versione del testo mostrata all'account, senza modello nuovo. La firma richiederebbe un momento deciso, un modello con utente, versione e data, e una rotta che li mostri: è un ordine di grandezza di lavoro in più
    - l'informativa del **portiere** va scritta per ruolo come le altre e non è un adattamento di quella del condòmino: il portiere non è l'interessato dei dati che vede, è il destinatario che li usa per servire lo stabile, quindi titolare, finalità e responsabili sono diversi
    - decidere la **granularità dei contatti** che il portiere vede e come viene concessa: la proposta è che sia l'amministratore di condominio a decidere, per stabile e in modo revocabile, e che il portiere veda solo ciò che serve per il mestiere (cognome, telefono, unità), non la email e non i millesimi. È anche il punto in cui il portiere diventa destinatario di dati personali, e va detto nell'informativa del condòmino che i propri dati di contatto possono essere visibili al personale dello stabile
    - rotta pubblica dell'informativa, **fuori da `RichiediAutenticazione`** (in `App.tsx` oggi ci sono solo `/accedi` e `/conferma-email`), con rotta per ruolo o selettore: va poter leggere prima del login, quando l'utente non ha ancora un ruolo
    - link nella pagina di accesso, che oggi non ha una zona di link, e nel profilo
    - diritto di accesso: `mieDati` in `comunicazione.controller.ts` raccoglie comunicazioni, legami e registro operazioni di un utente ma nessuna rotta la chiama, quindi oggi l'interessato non può scaricarli
    - **allargare `mieDati` prima di esporla**: non raccoglie unità immobiliari, versamenti, presenze e votazioni, allegati e contratto, quindi esposta così com'è sarebbe un'esportazione incompleta, che per una richiesta di accesso è peggio che non esportare nulla. Da ricordare che il registro operazioni contiene `ip` e `userAgent`, quindi è dato personale
    - esporre `mieDati` su una rotta `GET` dell'area autenticata (è già `asyncHandler` con `currentUser`) e un pulsante nel profilo che scarica il file dal browser, senza dipendenze nuove
  - l'informativa deve dichiarare l'esportazione dei dati propri **solo dopo che esiste davvero**: prometterla prima sarebbe dichiarare il falso
  - la sua struttura non dipende dal portiere, quindi se l'obbligo legale ha fretta si può fare prima e aggiungere dopo il paragrafo del portiere: è una riga di ordine, non un lavoro doppio
- Guida in pdf (download da dashboard) per l'utilizzo per l'amministratore di condominio e per un utente condòmino
  - l'infrastruttura c'è già e senza dipendenze: `AreaStampa` e `PulsanteStampa` in `client/src/components/Stampa.tsx`, `_stampa.scss` con `@page`, colore in stampa e `break-inside`, già usati da verbali, bilanci e dettaglio assemblea. La scelta registrata in `AGENTS.md` è il PDF dalla finestra di stampa del browser
  - **da decidere: "download" o "stampa"**. Il pulsante apre la finestra di stampa e l'utente sceglie "Salva in PDF": un file che si scarica da solo richiede una libreria e contraddice quella scelta. La proposta è **stampa**, che costa zero dipendenze
  - **"da dashboard" non raggiunge tutti**: `c/panorama` è dentro `RichiediAmministratore`, che dirotta il condòmino a `/c/versamenti` e il superadmin a `/p`. Un pulsante sul panorama lo vede solo l'amministratore e il portiere
  - **deciso: due file**, `docs/guida-admin.md` e `docs/guida-condomino.md`: sono due pubblici che non hanno quasi nulla in comune, e in un file solo la prosa di ciascuno finirebbe accanto a quella dell'altro. **Ne servirà un terzo per il portiere**, che avrà schermate sue: è il secondo motivo per cui questa voce viene dopo quella del portiere
  - passi, nell'ordine:
    - decidere "download" o "stampa" (vedi sopra)
    - **l'indice delle sezioni non si scrive**: si prende da `gruppiNavigazione` in `client/src/components/navigazione.ts`, che è già filtrato per ruolo e permesso. Così una sezione nuova compare da sola e non può risultare mancante, e nel file finisce solo la prosa
    - la prosa è scritta **per chi usa l'applicazione**, in seconda persona: nel file non finiscono note di implementazione, perché vengono stampate all'utente finale
    - formato: sottoinsieme di Markdown scritto da noi (titoli, elenchi, grassetto, link), senza dipendenze nuove
    - i file arrivano al browser con una copia da `docs/` a `client/public/` durante la build, così la guida stampata è sempre quella corrente e non c'è nessun comando da ricordare
    - una pagina per ruolo dentro `AreaStampa` + `PulsanteStampa`
    - la guida del condòmino descrive **solo le schermate che lui ha**: le sue quote sono `/c/versamenti` e non `/c/quote`, che è dietro `RichiediAmministratore`. L'elenco autorevole è `gruppiNavigazione` in `client/src/components/navigazione.ts`, non le rotte di `App.tsx`: è quello che il menu filtra per ruolo e permesso, quindi è quello che l'utente vede davvero
    - i link: panorama per l'amministratore, `/c/versamenti` per il condòmino; il superadmin non ha bisogno di una guida di condominio, ma la rotta non deve escluderlo
    - ~20-30 righe in più in `_stampa.scss`: il foglio oggi pensa a card, tabelle e controlli, non a un testo lungo (larghezza di colonna, URL dei link stampati, interruzioni di pagina)
  - **regola in `AGENTS.md` da aggiungere**: ogni modifica a un comportamento che un utente vede si riflette nei file di guida, nello stesso intervento. Da sola non basta a garantire niente, nessuna verifica automatica può dire che un paragrafo è diventato falso: l'unica protezione è che l'unica cosa dimenticabile sia il testo, non l'indice
  - il codice è la parte piccola: il grosso sono le guide, e sono testo che invecchierà in silenzio, perché nessuna verifica automatica può segnalare che una guida descrive una schermata cancellata
- Rubrica contatti per comunicare con l'esterno
  - oggi `Comunicazione` ha come destinatari solo soggetti dell'applicazione: `filtroVisibilita` costruisce la partecipazione su `User` e `Condomino`, quindi non c'è modo di scrivere a chi non ha un account
  - **deciso: le aziende esterne si lasciano perdere**, quindi la rubrica non è per fornitori con un ruolo proprio: serve per **mandare**, non per far entrare. Un contatto esterno non ha account e non entra mai nell'applicazione, riceve per email
  - da conseguire: un modello `Contatto` per condominio (nome, ente o ruolo, telefono, email, note), la possibilità di scegliere un contatto come destinatario, e il fatto che **lettura e non letto non si applicano** a chi non ha una posizione: oggi ogni destinatario ha un posto nella conversazione, e senza posto il conteggio delle non lette non sa che cosa fare
  - è la stessa esigenza che sta dietro `condominiServito` e il ruolo `portiere`, risolta dal lato opposto: quella porta *dentro* l'applicazione chi serve lo stabile, questa porta *fuori* chi non lo serve
- Test automatici sulla logica delle quote e del verbale
  - `npm test` copre oggi solo i permessi, che sono l'area a rischio più alto
  - `quoteVersamenti.service.ts` (riparto del residuo sui centesimi, nuda proprietà, regime) e `verbale.service.ts` (quorum ordinaria e straordinaria, millesimi rappresentati, delibere con segnaposto) sono la seconda area a rischio alto e non hanno test
  - `scripts/verifica-bilancio.ps1` e `verifica-crud-verbali.ps1` coprono il percorso via API, ma non i casi limite del calcolo
- Tradurre in inglese tutto il codice che non è interfaccia
  - identificatori, modelli, strutture dati, variabili, nomi di funzione, nomi dei file, backend e frontend; nell'interfaccia restano in inglese solo i nomi delle rotte
  - i messaggi di errore inviati dal server restano in italiano