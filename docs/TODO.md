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
- Le notifiche non dovrebbero coprire la pagina
  - oggi sono un riquadro `position: fixed` sotto l'intestazione, che passa sopra
    il contenuto mentre leggi
  - **da chiarire prima di muoverle**: cosa non va. Coprono il contenuto, spariscono
    troppo in fretta, o altro. Spostarle inline non è un cambio di `position`: ogni
    pagina dovrebbe riservare il posto, e su una pagina lunga in cui si è scesi in
    fondo un messaggio in alto non si vede

- Rubrica contatti per comunicare con l'esterno
  - **chiarito**: non è la rubrica dei residenti che ha il personale dello stabile,
    ma l'elenco dei **fornitori esterni**, e la vede **solo il team**, personale
    dello stabile compreso. Le due cose hanno nomi simili e scopi opposti
  - da conseguire: un modello `Contatto` per condominio (nome, ente o ruolo, telefono, email, note), la possibilità di scegliere un contatto come destinatario di una comunicazione, e il fatto che **lettura e non letto non si applicano** a chi non ha una posizione: oggi ogni destinatario ha un posto nella conversazione, e senza posto il conteggio delle non lette non sa che cosa fare
  - **un contatto esterno non entra nell'applicazione**: nessun account, riceve per email
  - la creazione si fa dal team, come per le altre persone: niente ruolo nuovo, è
    solo una rubrica
  - **privacy, da rifare quando la rubrica esiste**: l'informativa del personale
    dello stabile dice che vede solo la rubrica dei residenti, e dovrà dire anche i
    fornitori. I contatti di un fornitore sono dati personali di terzi, con finalità
    e conservazione diverse da quelli dei residenti, quindi probabilmente meritano
    una sezione a sé
  - **serve un ambito nuovo**: la rubrica dei fornitori è un ambito (`fornitori:leggere`).
    Il perimetro del personale oggi è una lista di permessi **vuota**, e aggiungere
    un ambito significa che non è più vuota: va rifatto il ragionamento, perché non
    basta aprire quell'ambito a chi ha `iscritti:leggere` — è la trappola in cui si
    era già caduti una volta

- Privacy policy per ruolo
  - serve un'informativa distinta per chi usa l'applicazione, perché il titolare del trattamento cambia
  - condòmini: il titolare è l'amministratore di condominio, che tratta i dati delle unità e delle quote per conto del condominio; Gestione Condomini agisce da responsabile del trattamento
  - amministratori di condominio: il titolare è l'amministratore di piattaforma, che tratta i dati del team e degli amministratori
  - due ruoli non sono coperti: il **superadmin** (Gestione Condomini è insieme titolare e responsabile per i dati del team e degli amministratori) e il **portiere** (il titolare è l'amministratore di condominio, come per il condòmino, ma per il portiere l'informativa è un'altra ancora: non è l'interessato dei dati che vede, è chi li riceve per servire lo stabile)
  - **nessun banner cookie serve**: l'unico cookie è il refresh token `httpOnly` con path `/api/auth`, non ci sono analytics né pixel. Il "registro dei consensi" serve solo se si aggiungono tracciamenti non necessari, quindi non va costruito insieme all'informativa
  - **deciso: presa visione**, non firma del consenso. Non esiste registrazione self-service (`auth.routes.ts` espone solo login, refresh, logout e conferma email, e gli account li crea il superadmin o l'amministratore), quindi non c'è un momento naturale in cui raccogliere un consenso; e senza un consenso da registrare il registro non serve
  - **deciso: registro operazioni 12 mesi**, **dati di uno stabile, comunicazioni e verbali 10 anni**, con la motivazione delle prescrizioni in materia civile. Vedi il punto sulle scadenze non applicate sotto
  - **fatto**: `client/src/pages/PaginaPrivacy.tsx` con le quattro informative (condòmino, amministratore di condominio, personale dello stabile, amministratore di piattaforma), rotta pubblica `/privacy/:ruolo` **fuori da `RichiediAutenticazione`** con `/privacy` che manda al ruolo condòmino, e link nella pagina di accesso e nel profilo
  - **fatto**: l'informativa **nomina l'amministratore di condominio**, che è il titolare del trattamento dei dati del condòmino. `GET /condomini/:id` popola `amministratore` con nome, cognome, email e telefono: una pagina statica non poteva nominarlo, perché il titolare cambia da condominio a condominio, e la pagina lo legge dal condominio attivo che la UI conosce già. Chi non è collegato riceve la formulazione generale, che dichiara di non essere completa
  - **restano informazioni che non abbiamo**:
    - **denominazione e indirizzo di Gestione Condomini**, e l'indirizzo per esercitare i diritti: sono i punti segnati `DA COMPILARE` nel testo, finché restano così la pagina è una bozza e lo dichiara in testa
    - **l'informativa del personale dello stabile** richiede che l'amministratore dichiari i suoi tempi di conservazione e gli obblighi di riservatezza del ruolo: non sono nostri e non li conosciamo
    - **il testo va riletto da chi ne è responsabile prima della pubblicazione**: è un documento legale, non una descrizione del prodotto
  - **le scadenze dichiarate non sono ancora applicate**: non esiste nessuna cancellazione automatica, quindi il testo promette una cancellazione che il sistema non fa. Serve uno script di cancellazione del registro operazioni e una procedura per i dati di uno stabile, altrimenti la promessa va riscritta come impegno manuale
  - passi, ancora da fare:
    - diritto di accesso: `mieDati` in `comunicazione.controller.ts` raccoglie comunicazioni, legami e registro operazioni di un utente ma nessuna rotta la chiama, quindi oggi l'interessato non può scaricarli
    - **allargare `mieDati` prima di esporla**: non raccoglie unità immobiliari, versamenti (che hanno `condomino` come riferimento diretto), presenze e votazioni, allegati e contratto, quindi esposta così com'è sarebbe un'esportazione incompleta, che per una richiesta di accesso è peggio che non esportare nulla. Da ricordare che il registro operazioni contiene `ip` e `userAgent`, quindi è dato personale
    - esporre `mieDati` su una rotta `GET` dell'area autenticata (è già `asyncHandler` con `currentUser`) e un pulsante nel profilo che scarica il file dal browser, senza dipendenze nuove
  - l'informativa deve dichiarare l'esportazione dei dati propri **solo dopo che esiste davvero**: prometterla prima sarebbe dichiarare il falso

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

- Test automatici sulla logica delle quote e del verbale
  - `npm test` copre oggi solo i permessi, che sono l'area a rischio più alto
  - `quoteVersamenti.service.ts` (riparto del residuo sui centesimi, nuda proprietà, regime) e `verbale.service.ts` (quorum ordinaria e straordinaria, millesimi rappresentati, delibere con segnaposto) sono la seconda area a rischio alto e non hanno test
  - `scripts/verifica-bilancio.ps1` e `verifica-crud-verbali.ps1` coprono il percorso via API, ma non i casi limite del calcolo

- Tradurre in inglese tutto il codice che non è interfaccia
  - identificatori, modelli, strutture dati, variabili, nomi di funzione, nomi dei file, backend e frontend; nell'interfaccia restano in inglese solo i nomi delle rotte
  - i messaggi di errore inviati dal server restano in italiano
