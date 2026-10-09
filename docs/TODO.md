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
- Privacy policy per ruolo
  - serve un'informativa distinta per chi usa l'applicazione, perché il titolare del trattamento cambia
  - condòmini: il titolare è l'amministratore di condominio, che tratta i dati delle unità e delle quote per conto del condominio; Gestione Condomini agisce da responsabile del trattamento
  - amministratori di condominio: il titolare è l'amministratore di piattaforma, che tratta i dati del team e degli amministratori
  - due ruoli non sono coperti: il **superadmin** (Gestione Condomini è insieme titolare e responsabile per i dati del team e degli amministratori) e il **portiere** (il titolare è l'amministratore di condominio, come per il condòmino)
  - **nessun banner cookie serve**: l'unico cookie è il refresh token `httpOnly` con path `/api/auth`, non ci sono analytics né pixel. Il "registro dei consensi" serve solo se si aggiungono tracciamenti non necessari, quindi non va costruito insieme all'informativa
  - passi, nell'ordine:
    - **decidere consenso o presa visione**: non esiste registrazione self-service (`auth.routes.ts` espone solo login, refresh, logout e conferma email, e gli account li crea il superadmin o l'amministratore), quindi non c'è un momento naturale in cui raccogliere il consenso. La proposta è **presa visione**: spunta e versione del testo mostrata all'account, senza modello nuovo. La firma richiederebbe un momento deciso, un modello con utente, versione e data, e una rotta che li mostri: è un ordine di grandezza di lavoro in più
    - rotta pubblica dell'informativa, **fuori da `RichiediAutenticazione`** (in `App.tsx` oggi ci sono solo `/accedi` e `/conferma-email`), con rotta per ruolo o selettore: va poter leggere prima del login, quando l'utente non ha ancora un ruolo
    - link nella pagina di accesso, che oggi non ha una zona di link, e nel profilo
    - diritto di accesso: `mieDati` in `comunicazione.controller.ts` raccoglie comunicazioni, legami e registro operazioni di un utente ma nessuna rotta la chiama, quindi oggi l'interessato non può scaricarli
    - **allargare `mieDati` prima di esporla**: non raccoglie unità immobiliari, versamenti, presenze e votazioni, allegati e contratto, quindi esposta così com'è sarebbe un'esportazione incompleta, che per una richiesta di accesso è peggio che non esportare nulla. Da ricordare che il registro operazioni contiene `ip` e `userAgent`, quindi è dato personale
    - esporre `mieDati` su una rotta `GET` dell'area autenticata (è già `asyncHandler` con `currentUser`) e un pulsante nel profilo che scarica il file dal browser, senza dipendenze nuove
  - l'informativa deve dichiarare l'esportazione dei dati propri **solo dopo che esiste davvero**: prometterla prima sarebbe dichiarare il falso
- Guida in pdf (download da dashboard) per l'utilizzo per l'amministratore di condominio e per un utente condòmino
  - l'infrastruttura c'è già e senza dipendenze: `AreaStampa` e `PulsanteStampa` in `client/src/components/Stampa.tsx`, `_stampa.scss` con `@page`, colore in stampa e `break-inside`, già usati da verbali, bilanci e dettaglio assemblea. La scelta registrata in `AGENTS.md` è il PDF dalla finestra di stampa del browser
  - **da decidere: "download" o "stampa"**. Il pulsante apre la finestra di stampa e l'utente sceglie "Salva in PDF": un file che si scarica da solo richiede una libreria e contraddice quella scelta. La proposta è **stampa**, che costa zero dipendenze
  - **"da dashboard" non raggiunge tutti**: `c/panorama` è dentro `RichiediAmministratore`, che dirotta il condòmino a `/c/versamenti` e il superadmin a `/p`. Un pulsante sul panorama lo vede solo l'amministratore e il portiere
  - passi, nell'ordine:
    - decidere "download" o "stampa" (vedi sopra)
    - una pagina di guida dentro `AreaStampa` + `PulsanteStampa`, con il documento scelto da `useAuth().utente.role`, o due rotte
    - la guida del condòmino descrive **solo le schermate che lui ha**: `/c/versamenti`, `/c/quote`, `/c/assemblee`, `/c/comunicazioni` e il profilo. Una guida generica documenterebbe sezioni che per lui non esistono
    - i link: panorama per l'amministratore, `/c/versamenti` per il condòmino, `/p` per il superadmin; in alternativa una rotta sola con il link nel profilo
    - ~20-30 righe in più in `_stampa.scss`: il foglio oggi pensa a card, tabelle e controlli, non a un testo lungo (larghezza di colonna, URL dei link stampati, interruzioni di pagina)
  - il codice è la parte piccola: il grosso sono le due guide, e sono testo che invecchierà in silenzio, perché nessuna verifica automatica può segnalare che una guida descrive una schermata cancellata
- Test automatici sulla logica delle quote e del verbale
  - `npm test` copre oggi solo i permessi, che sono l'area a rischio più alto
  - `quoteVersamenti.service.ts` (riparto del residuo sui centesimi, nuda proprietà, regime) e `verbale.service.ts` (quorum ordinaria e straordinaria, millesimi rappresentati, delibere con segnaposto) sono la seconda area a rischio alto e non hanno test
  - `scripts/verifica-bilancio.ps1` e `verifica-crud-verbali.ps1` coprono il percorso via API, ma non i casi limite del calcolo
- Tradurre in inglese tutto il codice che non è interfaccia
  - identificatori, modelli, strutture dati, variabili, nomi di funzione, nomi dei file, backend e frontend; nell'interfaccia restano in inglese solo i nomi delle rotte
  - i messaggi di errore inviati dal server restano in italiano
