# AGENTS.md

Istruzioni per gli agenti AI che modificano questo repository.
Leggi questo file prima di toccare il codice.

## Documentazione in questa cartella

- `AGENTS.md` (questo file): convenzioni del codice e regole del dominio;
- `reset-produzione.md`: come azzerare il database di produzione;
- `TODO.md`: le cose da realizzare, ordinate per urgenza;
- `CHANGELOG.md`: cosa è cambiato e perché.

**`bugs.md` e `new_tasks.md` sono in `.gitignore`**: restano in locale e non
entrano nel repository. Sono le due code di lavoro di chi guida il progetto, e
per costruzione sono transitorie — un bug viene risolto o spostato in `TODO.md`,
un'idea viene discussa e poi entra in `TODO.md` o muore. Se finissero nella
storia del repository sembrerebbero decisioni prese, e non lo sono.

**Prima di proporre un intervento, leggere `TODO.md`.** Se un punto aperto
riguarda ciò che stai per toccare, chiedere quale affrontare e con quale
urgenza, invece di decidere da soli l'ordine: il file raccoglie cose che sembrano
evidenti ma non lo sono.

**All'inizio di ogni sessione, leggere `new_tasks.md`.** Se contiene voci,
spostarle in `TODO.md` e discutere con l'utente la priorità da assegnare a
ciascuna prima di lavorarci: il file è la coda di lavoro di chi guida il
progetto, le voci entrano in `TODO.md` solo dopo questa discussione e non
vanno svuotate in autonomia.

Quando un punto del `TODO.md` viene realizzato, si sposta in `CHANGELOG.md` con
la ragione della scelta, che è la parte che serve a chi leggerà il codice fra sei
mesi.

**Un commit per ogni voce del `TODO.md` affrontata e risolta.** Così la storia
del repository segue la coda di lavoro: se un intervento non va, si annulla senza
trascinare gli altri, e da un messaggio di commit si capisce quale voce è stata
risolta.

## I bug che si trovano navigando

`bugs.md` raccoglie i difetti noti, ed è scritto da chi usa l'applicazione, non da
chi scrive il codice: contiene cose che si vedono solo girando fra le pagine, e
che nessuna verifica automatica copre.

**Ogni difetto trovato in navigazione va messo in `bugs.md`**, con la pagina in
cui si manifesta e come si arriva a riprodurlo. Serve a chi lo troverà dopo di te,
che non avrà la tua sessione. Il file è in locale e non entra nel repository,
perché è una coda di lavoro e non un documento: niente di quel che ci scrivi deve
sopravvivere alla sessione.

Un bug in `bugs.md` ha due destini, e non si lascia a metà:

- **si risolve subito**, se è contenuto e il rischio di toccarlo è basso;
- **si sposta in `TODO.md`**, se è complesso, se mette mano a più domini o se
  richiede una scelta di prodotto. **In questo caso va chiesto conferma prima**,
  perché spostare qualcosa in `TODO.md` significa rinunciare a farlo adesso, e la
  priorità non spetta a chi lo ha trovato.

Non si lascia un bug in `bugs.md` senza averlo né risolto né spostato: un file
che si riempie e non si svuota non serve a nessuno. **A fine sessione `bugs.md`
deve essere vuoto**: quello che resta va comunicato a chi guida il progetto e
spostato in `TODO.md` sotto `PRIORITA ALTA`, perché è un difetto noto che
rischia di essere perso.

**Un bug risolto si cancella subito, non si annota.** Appena il difetto è
corretto la voce sparisce da `bugs.md`: il prima e il dopo sono già nel
`CHANGELOG.md`, quindi annotarla qui lascerebbe dentro un file la voce di un
problema che non esiste più, e un file con roba risolta sembra una coda che non si
chiude. Vale anche quando il difetto si risolve per un motivo che non sta nel
codice: la voce sparisce ugualmente, e il motivo va in `CHANGELOG.md`.

## Cosa fa l'applicazione

Gestione condominiale per amministratori che seguono più condomini. Un
amministratore gestisce unità immobiliari, quote millesimali, assemblee,
verbali, bilanci, quote di versamento e comunicazioni. Ogni condòmino vede le
proprie quote, i verbali delle assemblee a cui ha partecipato e può scrivere
all'amministratore.

## Comandi

Tutti i comandi vanno eseguiti dalla **radice** del repository, salvo dove
indicato diversamente.

```bash
npm install          # installa le dipendenze di entrambi i workspace
npm run dev          # avvia API (4000) e frontend (5173) in parallelo
npm run typecheck    # tsc --noEmit su server e client
npm run lint         # eslint su server e client
npm run build        # compila entrambi
npm test             # test automatici dei permessi, senza database
npm run verifica     # verifiche di percorso completo, con API in esecuzione
npm run seed         # popola il DB con dati demo
npm run seed -- --reset   # svuota le collezioni e ripopola
npm run reset:produzione  # azzera il DB di produzione, vedi docs/reset-produzione.md
```

Prima di dichiarare finito un intervento, `npm run typecheck` e `npm run lint`
devono passare. Se l'intervento tocca i permessi, anche `npm test`; se tocca un
CRUD o una guardia, anche `npm run verifica`. Non aggiungere dipendenze senza un
motivo concreto.

`npm run reset:produzione` è l'unico modo per ottenere un account `superadmin` su
un database svuotato: non esiste una rotta che promuova un utente esistente.
Le sue difese sono volute e non vanno allentate:

- la connessione arriva da `MONGODB_URI_PRODUZIONE`, mai da `MONGODB_URI`, che nel
  `.env` locale è il Mongo di sviluppo; se manca, lo script non parte e non ha un
  piano B;
- `localhost` e `127.0.0.1` vengono rifiutati comunque;
- `--yes` è obbligatorio, e senza il comando si limita a stampare il piano.

## Non lasciare processi appesi

`npm run dev` **non è un comando che si lancia e si dimentica**: `tsx watch` e
Vite restano in ascolte e si riavviavano a ogni file salvato. Un agente che lo
avvia in background senza spegnerlo occupa le porte 4000 e 5173, continua a
ripartire e costringe chi guida il progetto a killingli a mano.

- **Una sola istanza, e si spegne prima di dichiarare finito.** Prima di
  riavviarla controllare che le porte siano libere
  (`Get-NetTCPConnection -State Listen -LocalPort 4000,4001,5173`), poi usare
  `taskkill /PID <pid> /T /F`: senza `/T` resta vivo il `tsx watch` figlio, che
  riapre la porta dopo un secondo.
- **Se il server non parte, controlla il loop.** In passato è capitato che
  lanciare `npm run dev` in un certo modo (in background, con le porte non
  davvero libere o con un'istanza già avviata) andasse in conflitto e il server
  iniziasse a riavviarsi in loop, con più istanze `tsx`/`vite` appese e una
  coda di child process che non morivano. Se il server non risponde: controlla
  che le porte siano libere e che non restino istanze node/tsx/vite in ascolto
  (`Get-Process node,tsx,vite -ErrorAction SilentlyContinue`), uccidi tutto
  (`taskkill /F /IM node.exe`, `tsx.exe`, `vite.exe` se servono), poi riprova.
  Non riavviare a ripetizione se c'è già un processo che le occupa.
- **Nessun comando che attende all'infinito.** Un'attesa lunga sembra un
  blocco: l'attesa dell'avvio è un ciclo con timeout che dice a ogni tentativo
  cosa sta facendo e termina con `pronto dopo N tentativi`, mai uno `Start-Sleep`
  fisso seguito da un comando che non finisce.
- **`Invoke-RestMethod`, mai `Invoke-WebRequest`**, nelle verifiche: in Windows
  PowerShell 5.1 la seconda va in errore sulle risposte JSON ("IE engine not
  available"), quindi un'API sana sembra muta e si finisce per riavviarla.
- **Preferire `node_modules\.bin\tsx.cmd` a `npx`**: `npx` può risolvere o
  installare qualcosa e questo è un avvio che deve durare pochi secondi.
- Se una verifica lascia dati (un amministratore di prova), cancellarli: un
  account creato con una password casuale resta nel database e non è più
  eliminabile da nessuno, perché nessuno la conosce.

## Struttura

```
server/          API Node + Express + Mongoose (TypeScript, ESM)
  src/
    config/      configurazione da env e connessione Mongo
    models/      schema Mongoose + interfacce TypeScript
    services/    logica di dominio (tabella millesimi, quote, verbali…)
    controllers/ traduzione HTTP ↔ servizi
    routes/      composizione dei router e validazione
    validators/  schemi Zod di body, query e parametri
    middleware/  auth, errori, upload, rate limit
    utils/       errori tipizzati, paginazione, risposte
client/          frontend React + Vite (TypeScript, SCSS, PWA)
  src/
    api/         client HTTP con refresh automatico
    components/  componenti riusabili e guardie di rotta
    contexts/    AuthContext
    hooks/       useApi, useNotifiche
    pages/       una pagina per rotta
    styles/      _tokens, _reset, _components, _layout
    types/       tipi del dominio (mirror dei modelli server)
    lib/         formattazione it-IT (euro, date, millesimi)
```

## Regole del backend

### Struttura di una richiesta

`routes/` → `middleware/validate` (Zod) → `middleware/auth` →
`controller` → `service` → `model`.

I controller non contengono calcoli di dominio: delegano ai servizi.
I servizi non conoscono Express.

### Validazione dei parametri di lista

**Questo è il punto in cui è più facile introdurre bug.**

Ogni rotta di lista dichiara uno schema dedicato in `validators/schemas.ts`
(`unitaListQuery`, `assembleaListQuery`, `versamentoListQuery`, …) e lo
applica con `validate(schema, 'query')`. `validate` **sostituisce** `req.query`
con il risultato validato.

Nei controller leggere i campi da `req.query` e usare `paginazioneDa(req.query)`
per la paginazione. **Non** usare `getPagination(req)` su queste rotte: Zod
elimina le chiavi non dichiarate, quindi i filtri verrebbero persi e ogni
ricerca/ filtro sembrerebbe ignorato.

```ts
// Corretto
const q = req.query as unknown as { page: number; limit: number; stato?: string; sort: string; order: 'asc' | 'desc' };
const { page, limit, sort, order } = paginazioneDa(q, 'data');
if (q.stato) query.stato = q.stato;

// Sbagliato: getPagination scarta `stato`
const { page, limit } = getPagination(req);
```

### Booleani nelle query string

Usare `flagQuery` (`validators/schemas.ts`), mai `z.coerce.boolean()`:
`Boolean("false")` vale `true`, quindi `?approvato=false` selezionerebbe i
documenti approvati.

### Campi dichiarati nelle rotte di scrittura

`validate` **sostituisce** `req.body` con il risultato di Zod, che rimuove le
chiavi non dichiarate: un `PATCH` con un campo assente dallo schema riceve 200 e
lascia i valori come erano, quindi la risposta sembra aver applicato una modifica
che non è avvenuta (visto su `PATCH /versamenti/:id` con `unita` o `periodo`).

**Ogni volta che si aggiunge o si tocca una rotta di scrittura (`POST`, `PUT`,
`PATCH`), verificare che tutti i campi che il client manda e che il controller
legge siano dichiarati nello schema Zod**, anche quelli annidati: è la stessa
trappola di `delibera` e `bilancio` in `assembleaCreateSchema`, che non dichiarati
spariscono dalla convocazione senza errore.

Non serve una passata di `strict()` su tutti i domini: si aggiunge **per schema**,
quando un dominio dà fastidio. I condomini sono già `strict` in creazione e
modifica; `versamentoUpdateSchema` e `bilancioUpdateSchema` (che usano `.omit()`
per i campi immutabili) sono i candidati più probabili.

### Query e riferimenti

Un campo `ref` non si può filtrare con il percorso puntato (`'utente.nome'`):
va risolto prima in un `$in` di id. Vedi `condomino.controller.ts` per il
pattern con `User.find(...)`.

Le query si costruiscono **sempre** nel codice, mai da oggetti greci del
client: gli schemi Zod accettano solo ObjectId a 24 cifre, numeri, booleani e
stringhe. Per questo `sanitizeFilter` non è abilitato (in Mongoose 8 è
incompatibile con `$in`); il commento in `config/database.ts` spiega il perché.

### Mongoose

- Usare `import mongoose from 'mongoose'` per `models`: il pacchetto è CJS e
  Node non espone `models` come named export ESM. `base.ts` lo centralizza.
- I tipi nelle interfacce usano `ObjectId` da `./base.js`, non
  `Schema.Types.ObjectId` (che nei tipi è una classe diversa da `Types.ObjectId`).
- `populate()` va tipizzato esplicitamente:
  `.populate<{ utente: UtenteRiepilogo }>('utente', 'nome cognome')` e
  `.lean<CondominoPopolato[]>()`.
- `strictPopulate` è attivo: un `populate` su un percorso inesistente fallisce
  rumorosamente invece di restituire silenziosamente `[]`. È voluto.

### Collezioni

Ogni modello ha una collezione esplicita e **univoca**. Attenzione: `Condominio`
e `Condomino` hanno nomi simili (`condomini` e `condominati`) per scelta.
Non rinominare una collezione senza un piano di migrazione.

## Regole del dominio

### Quote millesimali

- Ogni **ripartizione in uso** (`diritto`, `uso`, `spese`, `scale`,
  `ascensore`) deve sommare esattamente 1000.
- Una ripartizione **assente** non è soggetta al vincolo: un edificio senza
  ascensore non introduce la ripartizione `ascensore`.
- Le revisioni sono immutabili: `nuovaRevisione` chiude la precedente con
  `validTo` e inserisce la nuova con `revisione + 1`.
- La normalizzazione avviene sul **totale della ripartizione** (1000), non sui
  millesimi della singola unità. Confondere le due produce quote sbagliate di
  un ordine di grandezza.

### Calcolo delle quote

In `quoteVersamenti.service.ts`:

- importo mensile = `importo annuale / 12`;
- quota unità = `importo mensile × (millesimi unità / totale ripartizione)`;
- gli importi sono arrotondati a due decimali, quindi la somma delle quote non
  coincide sempre con il totale. Il residuo (centesimi) viene assorbito dalla
  unità con più millesimi, così la somma è sempre esatta;
- la nuda proprietà vale metà dei millesimi di diritto; la quota di
  comproprietà scala il totale.

### Verbali

`verbale.service.ts` genera il testo a partire da presenze, votazioni e delibere.

- Quorum ordinaria: maggioranza dei presenti. Straordinaria: 2/3 dei millesimi
  (art. 1136 c.c.).
- I millesimi rappresentati da un condomino sommano le quote delle sue unità,
  scalate per quota di proprietà e per nuda proprietà.
- Un verbale con `modificatoManualmente: true` **non** viene rigenerato: va
  segnalato all'utente, non sovrascritto.
- Se l'esito dichiarato non coincide con il quorum calcolato, il verbale lo
  segnala con un avviso invece di correggerlo: è il segretario a decidere.
- **Il segretario si indica mentre l'assemblea si sta svolgendo**, con
  `PATCH /assemblee/:id` e il campo `segretario`: il server lo accetta finché
  l'assemblea non è `conclusa`. Il nome entra nel verbale in apertura ("Funge da
  segretario …") e nella riga di firma; senza designazione il testo usa la formula
  generica, per questo la scelta non è obbligatoria.
- `dettaglio-verbale` restituisce anche `amministratore`, perché presiede senza
  comparire mai fra i condòmini: senza quel campo il selettore non potrebbe
  proporre chi sta gestendo l'assemblea. `utenteId` dei condòmini va letto da
  `utente._id` (il campo è popolato).
- **La delega in verbale si risolve su `Condomino`, non su `User`.**
  `Presenza.delegaA` è un riferimento a `Condomino` (così lo dichiara il modello,
  così lo manda il selettore del foglio presenze, così lo scrive il seed):
  cercando quell'id in `User` la ricerca non trovava nessuno e la riga
  "presente tramite delega a …" non compariva mai, pur contando le deleghe in
  apertura. Il nome arriva dal `utente` popolato del legame, e senza filtro su
  `attivo` perché il delegatario resta tale anche se oggi non è più iscritto.
- Le delibere dei modelli contengono i segnaposto `{totale}` e `{totaleMensile}`:
  vengono risolti in `deliberaRisolta` con le cifre del bilancio collegato al
  punto, cioè quando i numeri sono quelli che l'assemblea approva davvero.

## Regole del dominio

### Bilancio

- Un solo documento per `condominio + anno + tipo` (indice univolo). `tipo` è
  `preventivo` o `consuntivo`.
- **`POST /bilanci` è una creazione, non un aggiornamento**: la stessa coppia
  `anno + tipo` è un 409. Prima rispondeva 200 sostituendo le voci, quindi un
  doppio invio azzerava il bilancio. Anno e tipo non sono modificabili con
  `PATCH`, e `bilancioUpdateSchema` li omette a questo scopo.
- **Un bilancio approvato non è modificabile**: `assicuraModificabile` risponde
  409. L'approvazione è il momento in cui l'assemblea ratifica le cifre, dopo il
  quale il verbale e le quote deliberate non possono più discostarsi.
- Le voci si modificano **una alla volta** (`POST/PATCH/DELETE /bilanci/:id/voci`)
  e ogni operazione ricalcola `totale` nella stessa chiamata. Non rimandare
  l'intero elenco: ogni correzione a un importo perderebbe le voci aggiunte
  intanto da qualcun altro.
- Il consuntivo si genera dal preventivo **approvato** con
  `POST /bilanci/:id/consuntivo`, che copia le voci azzerando l'importo e
  conservando il previsto in `previsto`. L'operazione è idempotente.
- `quoteVersamenti.service.ts` legge **solo il preventivo**: il consuntivo non
  genera quote, serve a chiudere l'esercizio e a ratificare le ripartizioni.

### Modelli di punto all'ordine

`modelliOrdine.service.ts` tiene i punti all'ordine già scritti, con la delibera
composta e il bilancio collegato. `GET /assemblee/modelli?anno=` li restituisce
già composti.

- Va dichiarata **prima** di `GET /:id` nelle rotte: dopo verrebbe letta come id.
- Un punto da modello porta `delibera` e `bilancio`: entrambi devono essere
  dichiarati in `assembleaCreateSchema`, altrimenti Zod li scarta in silenzio e
  la convocazione perde il testo.


## Regole del frontend

- **Mobile first.** La navigazione è una barra inferiore fino a 48rem, poi
  diventa sidebar. I target touch sono almeno 2.75rem.
- Gli input usano `font-size: 16px` (`var(--fs-md)`) per evitare lo zoom
  automatico su iOS.
- **I pulsanti usano `token SCSS` in `_tokens.scss`.** Non inventare colori o
  spaziature.
- **`pila-N` sta in piedi da solo**: il `display: flex` è su `.pila-1..6` e non
  solo su `.pila`. Non scrivere `className="pila-4"` aspettandoti che `.pila` ci
  sia: `gap` su un elemento che non è flex non fa nulla, e il difetto si vede
  come "manca un margine sopra" in punti che sembrano non avere niente in comune.
- **`riga-tra` funziona solo su un elemento flex**, perché è un
  `justify-content: space-between`. Va abbinata a `riga`, ma anche a un'altra
  classe flex come `.voce`: la regola è che l'elemento sia flex, non che ci sia
  per forza `riga`. Senza, i due figli si impilano e sembra un problema di
  margini.
- Il testo utente è in italiano. I messaggi di errore dell'API arrivano già
  in italiano: mostrarli così come sono.
- `useApi` gestisce caricamento, errore e cancellazione della richiesta
  precedente. Non chiamare `fetch` direttamente dai componenti.
- I tipi in `client/src/types/domain.ts` rispecchiano le risposte dell'API:
  quando cambi il backend, aggiorna anche quelli.
- Il formattatore (`lib/formattazione.ts`) è l'unico posto dove si formattano
  euro, date e millesimi.

## Ruoli e permessi

I ruoli sono `superadmin`, `admin`, `portiere`, `condomino`.

- `superadmin` amministra la piattaforma: crea amministratori e contratti, incassa
  le rate, scrive i messaggi. Non è soggetto al proprio contratto. **Non ha
  posizioni nei condomini**: `profiloCompleto` non gli restituisce stabili, quindi
  il profilo non gli mostra "Condomìni amministrati" e `RichiediAmministratore` lo
  rimanda a `/p`. Alle API dei condomini continua ad avere accesso, perché è
  `requireCondominioAccess` a deciderlo e i test lo coprono: cambia solo ciò che
  l'interfaccia gli presenta come suo.
- `admin` senza elenco di permessi ha accesso pieno a tutti i suoi condomini.
- `admin` **assistente** è un admin con `permessi` non nulli, collegato al
  delegante con `User.delegatoDa` e ammesso nei condomii da `Condominio.assistenti`.
- I permessi sono `ambito:azione`, con ambiti `unita`, `iscritti`, `tabella`,
  `bilanci`, `assemblee`, `verbali`, `versamenti`, `comunicazioni`,
  `amministrazione` e azioni `leggere`/`scrivere`. **`scrivere` implica `leggere`**
  (`haPermesso` in `types/domain.ts`).

**I permessi sono di un utente, non di un utente in un condominio.** `User.permessi`
è un elenco unico valido su tutti gli stabili dell'assistente: "su questo tutto, su
quello solo i versamenti" non è esprimibile, e renderlo possibile richiederebbe
elenchi multipli o togliere il `null` (che oggi significa accesso pieno). **Non è un
lavoro previsto**, e per questo la delega a un assistente resta tutto o niente (vedi
«Bacheca delle attività»).

Per questo i permessi **si sistemano una rotta alla volta**, non con un intervento
unico: `requirePermesso` e `requirePermessoLettura` ricevono già
`req.params.condominioId` e possono risolvere l'elenco giusto, ma ogni rotta sotto
`/condomini/:condominioId` va controllata quando la si tocca.

### I guard di permesso

Sono diversi e non vanno scambiati:

| Guard | Chi passa | Da usare su |
| --- | --- | --- |
| `requirePermesso(p)` | solo `superadmin` e `admin` | **scritture** (blocca condòmini e portieri) |
| `requirePermessoLettura(p)` | chiunque, ma controlla l'ambito se è `admin` | **liste e dettagli** |
| `requirePermessoOPartecipante(p)` | chiunque, ma controlla l'ambito solo se è `admin` o `superadmin` | **scritture aperte anche ai condòmini** |

`requirePermessoLettura` esiste perché `requirePermesso` sulle rotte `GET`
impedirebbe ai condòmini di vedere i propri verbali e le proprie quote: i
condòmini non hanno `permessi` e per loro il filtro è dentro il controller.
Applicare `requirePermesso` a una rotta di lettura rompe il pannello del
condòmino; non applicare `requirePermessoLettura` a una lista lascia passare un
assistente su ambiti non delegati.

`requirePermessoOPartecipante` esiste per le rotte in cui la stessa scrittura è
legittima per due soggetti diversi: il condòmino scrive all'amministratore,
l'amministratore scrive ai condòmini (è il caso delle comunicazioni). Applicare
`requirePermesso` vieterebbe al condòmino di scrivere, che è il diritto che
l'applicazione gli riconosce. Il guard lascia passare i partecipanti ma non è
tutto: `requireCondominioAccess` gli chiede una posizione nel condominio e i
controller ne verificano la proprietà (`mittente`, `bozza`).

`GET /condomini/:id/unita` è l'eccezione: usa `requirePermesso`, perché il
condòmino conosce già la propria unità da `GET /auth/me` e non deve poter
sfogliare lo stabile.

- **La non letta si conta con `lettaDa`, mai con `stato`.** `stato` è un campo
  unico della comunicazione e `segnaLetta` lo porta a `'letta'` per tutti: usarlo
  farebbe sparire il pallino di ogni destinatario quando uno solo apre il
  messaggio. `contaNonLette` parte da `filtroVisibilita` e non da un `$or` fatto a
  mano, così il conteggio non può divergere dall'elenco.
- **Le attività senza `dataFine` in bacheca vanno in fondo**, anche in ordine
  crescente: in MongoDB un campo assente ordina come `null` e verrebbe prima di
  ogni data. Per questo la lista passa da `listaOrdinata`, che calcola
  `conScadenza` e restituisce gli id: `populate` non esiste sulle aggregazioni, e
  `find({ _id: { $in } })` restituisce in ordine arbitrario, quindi i documenti
  vanno rimessi nell'ordine degli id.
- **`order` si dichiara nello schema che ne ha bisogno**, non si sposta il default
  di `paginationQuery`: quel `desc` serve le liste archiviali e le inversioni
  riusano `listaOrdinata`.
- **Il perimetro delle comunicazioni è il condominio della rotta**, non un filtro
  della query: `condominio` non va dichiarato in `comunicazioneListQuery` perché
  `validate` lo scarterebbe, e il controller deve usare `req.params.condominioId`.
  Un condominio diverso risponde **404**, non 403. La mappa dei ruoli è quella di
  `requireCondominioAccess` e di `filtroCondomini`, e il superadmin li vede tutti per
  scelta.
- **`assicuraAccesso` deve reggere il `populate`.** È chiamata da `getOne`, che
  popola mittente e destinatario, e da `segnaLetta`/`update`, che non lo fanno:
  usare `idDi` e non `String(campo)`, altrimenti il confronto con l'id fallisce
  sempre e il mittente non riesce ad aprire il proprio messaggio. Il percorso
  dell'amministratore non lo rivela, perché per lui il controllo di partecipazione
  non esiste.
- **`unita` non ha un indirizzo** e non è pensata per averne: l'unità si intende
  dentro il condominio, che ha un `indirizzo` obbligatorio. Per la posizione basta
  il link a Google Maps sull'indirizzo del condominio.
- **`Condominio.codice` è autogenerato e immutabile.** Lo genera
  `generaCodiceCondominio` (nome ripulito più 6 cifre esadecimali) e non è un campo
  che il client possa scegliere: è l'identificativo con cui lo stabile compare nei
  contratti. Perciò `condominioCreateSchema` e `condominioUpdateSchema` sono
  `strict`: mandarlo è un 400 esplicito, non una modifica ignorata in silenzio.
- **Il selettore del condominio non è riservato a chi amministra**: la condizione è
  averne più di uno, perché un condòmino iscritto a due stabili deve poter
  scegliere come un amministratore. Al superadmin non serve un'eccezione a parte:
  il profilo non gli restituisce posizioni, quindi la condizione non si verifica.
- **Nell'intestazione il titolo è `Condominio attivo: <nome>`**, o `Dashboard` per
  il superadmin: il nome da solo sembrava il titolo della pagina.

## Allegati

I file stanno in MongoDB dentro `Allegato`, e **il documento che li ospita tiene
solo l'id**. I metadati si leggono dal documento `Allegato` a ogni richiesta. Non è
una scelta estetica: l'URL è firmato e vale 24 ore, quindi un URL scritto dentro il
documento che lo referenzia scaderebbe da solo e il file diventerebbe
irraggiungibile.

**Dove stanno, e perché lì.**

| Documento | Campo | Motivo |
| --- | --- | --- |
| Voce di bilancio | `voci.$[].allegati` | la fattura e la quietanza sono di **quella** spesa |
| Punto all'ordine | `ordineDelGiorno.$[].allegati` | la relazione è di **quella** deliberazione |
| Verbale | `allegati` | è un documento unico, non ha sotto-elementi |
| Versamento | `allegato` (singolo) | una quietanza sola, e sostituirla cancella il file vecchio |
| Comunicazione | `allegati` | vale per create, update e risposte |

Non esiste un allegato a livello di assemblea né di bilancio: non saprebbe a quale
voce o a quale punto appartenere.

**Regole che non si spostano.**

- **`leggiMetaAllegati` va montata dopo `upload` e prima di `validate`.** `validate`
  *sostituisce* `req.body` con il risultato di Zod, che scarta le chiavi non
  dichiarate: i metadati degli allegati, non facendo parte dello schema del
  documento, arriverebbero vuoti e ogni file prenderebbe per oggetto il titolo del
  documento padre.
- **I campi dei metadati hanno il prefisso `allegati`** (`allegatiOggetto`,
  `allegatiFonte`, …) perché il corpo ha già un `oggetto` proprio.
- **`flagCorpo`, non `z.boolean()`**, sui campi booleani delle rotte che accettano
  file: multer legge ogni campo come stringa, quindi `salvaComeBozza: 'true'`
  fallirebbe la validazione.
- **La cancellazione non è in cascata.** Il file viene eliminato **dopo** che il
  documento non lo referenzia più: il contrario lascerebbe un documento con un id che
  non porta più a nessun file. Sul client, che rimuova le voci del thread una alla
  volta, è un comportamento da documentare e non un bug.
- **I documenti ratificati non accettano allegati**: bilancio approvato, verbale
  approvato, assemblea conclusa. Dopo la delibera aggiungere un documento sarebbe
  cambiarne il contenuto.
- **`espandiAnnidati` serve per le voci e i punti**, perché gli allegati sono dentro
  un array e `espandiAllegati` guarda solo il primo livello. Dimenticarsene non
  rompe nulla: il cliente riceve degli id al posto dei file e non può scaricarli.

## Bacheca delle attività

`/staff/attivita` è l'unico dominio che **non** sta sotto
`/condomini/:id`: l'attività è un compito che l'amministratore dà ai propri
assistenti, quindi non appartiene a uno stabile. Non esiste un ambito
delegabile in `AMBITI` e di conseguenza **nessun guard di permesso**: l'accesso
dipende dal documento, ed è `attivita.service.ts` a stabilirlo.

- **Il team è `User.delegatoDa`**, per stabilità e non perché `Condominio.assistenti`
  sbagli: i due campi non possono divergere, perché `creaAssistente` scrive
  `delegatoDa` e chiama `registraDelegazione`, che aggiunge l'assistente a **tutti**
  i condomini del delegante, e `revocaAssistente` fa il contrario sugli stessi
  campi. Se il team dipendesse dagli stabili, aggiungere un condominio
  all'amministratore cambierebbe la bacheca da sola e toglierne uno toglierebbe
  all'assistente i compiti.
- **La delega a un assistente è tutto o niente**: non esiste modo di delegare su un
  solo condominio, e `Condominio.assistenti` non si scrive da `PATCH /condomini/:id`:
  gli unici scrittori sono la creazione e la revoca della delega.
- **Il team non è visibile a ruolo**: `requireRole('admin')` non distingue
  l'amministratore dall'assistente, perché entrambi hanno `role: 'admin'`. Chi
  crea è l'amministratore delegante e la verifica è `assicuraCreatore`, sul
  documento `delegatoDa` dell'utente corrente.
- **Visibile = proprietario o assegnatario.** "Non visibile" è **404, non 403**:
  rispondere 403 confermerebbe che l'attività esiste a chi non deve vederla. Il
  403 è per chi la vede ma non può agire (l'assistente che tenta di eliminare).
- **`assegnatari` è un elenco esplicito e può essere vuoto**, che significa "non
  ancora passata a nessuno" e quindi visibile solo al proprietario. Non è "tutti":
  è la trappola di `permessi: null` capovolta.
- **Gli assegnatari sono validati contro il team** in `assicuraAssegnatari`,
  altrimenti si assegnerebbe lavoro a chiunque, compreso il superadmin.
- **Un thread è di un solo livello**: `parent` su se stesso, e un'attività che ha
  già un padre non può diventare padre. Senza il controllo A → B → A non
  termina.
- **La cancellazione non è in cascata**: le voci del thread si eliminano a parte,
  il client le propone una per una.
- `sonoProprietario` e `assegnatoAMe` arrivano calcolati nelle risposte: la UI
  non deve dedurre il confronto fra id dal proprio elenco.

## Controllo del contratto

- Ogni scrittura di dominio passa per `controllaServizio`: se il contratto è
  sospeso o cessato, l'amministratore **e i suoi assistenti** non possono
  scrivere. Le letture restano sempre consentite.
- La capacità è contata in **condomìni**, non in unità immobiliari, e si
  consuma solo sulla creazione di un condominio: `verificaCapacitaPerCondominio(1)`
  sta su `POST /condomini` e su nessun'altra rotta. Aggiungere unità immobiliari
  non consuma capacità. Un contratto scaduto continua a permettere la gestione di
  ciò che esiste, ma non l'espansione.
- La capacità è **unica per contratto**: `statoServizio` conta i condomìni
  amministrati dal *titolare* del contratto, non quelli su cui lavora l'assistente
  che ha fatto la richiesta. Se si contassero sull'assistente, ogni assistente
  vedrebbe un contratto con tutta la capacità disponibile e il limite non
  verrebbe mai applicato.
- Lo stato `scaduto` non viene scritto mai: è derivato dalla data, così non
  serve un job schedulato.

## Sicurezza

- Access token solo in memoria, mai in `localStorage`. Refresh token in cookie
  `httpOnly` con path `/api/auth`.
- Cambiare la password incrementa `tokenVersion` e invalida tutte le sessioni.
- `requireCondominioAccess` controlla che l'utente sia amministratore, servizio
  o condòmino di quel condominio. Ogni rotta sotto
  `/condomini/:condominioId` deve averlo.
- Gli allegati sono limitati a 10 MB e a un allowlist di MIME.
- Non loggare password, token o dati personali. In particolare le password
  provvisorie **non** vanno nel `auditLog`: viaggiano solo nell'email di conferma.
- `GET /auth/me` restituisce `condominioId` (non `id`) negli oggetti condominio:
  i test e il client lo usano per comporre gli URL delle rotte annidate.

## Conferma dell'indirizzo email

Gli account creati dal superadmin e dall'amministratore per il proprio team
ricevono un'email di conferma. **L'accesso non è bloccato**: l'utente entra e
vede un avviso finché l'indirizzo non è confermato, perché un account inutilizzabile
sarebbe un danno peggiore di un indirizzo non verificato.

- `emailConfermato` è separato da `attivo`: `attivo` è disattivazione
  amministrativa, `emailConfermato` dice solo che non sappiamo se l'indirizzo è suo.
- Il token è casuale, vale una volta sola e in database si conserva **solo
  l'hash SHA-256**. Non serve un JWT: la revoca è un `unset` e la verifica è una
  ricerca per hash.
- La conferma passa da `POST /auth/conferma-email`, non da una GET: i filtri
  anti-spam aprono i link in anteprima e consumerebbero il token. Per questo il
  link punta a una pagina del frontend che fa la POST esplicita.
- Se l'invio fallisce l'utente **resta creato** e chi lo ha creato vede
  l'esito e può reinviare. `inviaEmail` non solleva mai.
- Le password provvisorie si generano con `passwordTemporanea` in
  `ruolo.service.ts`, che usa `crypto`: `Math.random` non regge a un attacco a
  forza bruta su una password che l'utente non ha scelto.
- L'intestazione verso Brevo è `api-key`, non `x-api-key`: con quest'ultima
  Brevo risponde "authentication not found in headers" anche con chiave valida.

## Testing

Ci sono due livelli, con requisiti diversi.

**1. Test automatici, senza database e senza API in esecuzione.** La logica dei
permessi, che è l'area a rischio più alto:

```bash
npm test
```

Sono in `server/src/tests/*.test.ts` e girano con il runner di Node via `tsx`.
Coprono `haPermesso`, `puoEseguire` e i guard: `requireCondominioAccess` è
verificato sostituendo i metodi `exists` dei modelli, quindi nessuna connessione
viene aperta. **Aggiungi un caso qui quando modifichi i permessi**: sono le
implicazioni che un refactoring romperebbe in silenzio (`scrivere` implica
`leggere`, `null` è accesso pieno e `[]` no, `assemblee` non concede `verbali`,
un condòmino non amministrerebbe nemmeno con un elenco compilato).

`tsconfig.build.json` esclude `src/tests` dalla build: `npm run typecheck`
continua a controllarli, `dist` non li contiene.

**2. Verifiche di percorso completo, con API in esecuzione e dati demo.**

```bash
docker compose up -d mongo
npm run seed -- --reset
npm run dev            # in un altro terminale
npm run verifica       # dalla root: esegue gli script in sequenza
```

`npm run verifica` riporta il totale dei controlli (249 al momento) e fa girare
tutti gli script anche dopo un fallimento: raccoglie alla fine quelli rossi ed esce
con 1 se ce n'è almeno uno. Gli script sono in `scripts/` e hanno tutti la stessa
forma: un `Check` per ogni asserzione, con i casi negativi (403 del condòmino,
409 della transizione illegale) accanto a quelli positivi.

| Script | Copre |
| --- | --- |
| `verifica-ruoli.ps1` | profili, contratti, assistenti |
| `verifica-permessi.ps1` | matrice di accesso per ruolo |
| `verifica-bilancio.ps1` | voci una alla volta, consuntivo, modelli |
| `verifica-conferma-email.ps1` | conferma degli indirizzi |
| `verifica-frontend-condomino.ps1` | che il condòmino conserva i propri dati |
| `verifica-permesso-comunicazioni.ps1` | il guard delle comunicazioni, lato admin e lato condòmino, il conteggio delle non lette e il perimetro di condominio |
| `verifica-crud-condomini.ps1` | creazione, codice autogenerato e non modificabile, modifica, cancellazione, dipendenze bloccanti |
| `verifica-crud-verbali.ps1` | generazione, modifica, approvazione, revoca, eliminazione |
| `verifica-crud-versamenti.ps1` | registrazione, campi immutabili, cancellazione |
| `verifica-crud-assemblee.ps1` | transizioni di stato, ricalcolo millesimi, eliminazione, il badge delle convocazioni, la risposta al condòmino, il segretario indicato durante lo svolgimento, la delega riportata nel verbale e la delibera tenuta nascosta ai condòmini finché l'assemblea è in convocazione |
| `verifica-crud-bilanci.ps1` | creazione, duplicata rifiutata, approvazione, revoca, eliminazione |
| `verifica-millesimi.ps1` | tabella vuota non valida, tabella coerente, revisione squilibrata rifiutata |
| `verifica-attivita.ps1` | bacheca del team, assegnatari, proprietario contro assegnatario, thread a un livello, ordine per scadenza con le senza scadenza in fondo |
| `verifica-allegati.ps1` | caricamento, metadati, firma, rimozione, dominio approvato, allegati per voce e per verbale |

Gli script sono eseguiti da `verifica.ps1` con `powershell` (Windows PowerShell
5.1). Lanciandone uno direttamente con `pwsh` i controlli che confrontano il
**codice** di errore falliscono senza che nulla sia cambiato: in PowerShell 7
`ErrorDetails.Message` non è più il corpo grezzo ma una stringa riformattata,
quindi `"code":"NOT_FOUND"` non corrisponde più. Per questo il regex accetta
spazi opzionali (`"code"\s*:\s*"(\w+)"`) e va mantenuto così.

Un condominio creato da una verifica interrotta resta bloccato per sempre: le API
rifiutano di eliminare un'unità che ha quote in vigore e contano anche le unità
disattivate. `npm run purge:condominio -- <id>` rimuove condominio, unità e
quote; va usato solo in locale.

Credenziali demo:

| Account | Password | Ruolo |
| --- | --- | --- |
| `superadmin@condomini.local` | `SuperAdmin123!` | superadmin |
| `admin@condomini.local` | `Admin123!` | admin (accesso pieno) |
| `assistente@example.com` | `Assistente123!` | admin con solo `versamenti:scrivere` |
| `marco.rossi@example.com` | `Condomino123!` | condòmino |

> In PowerShell non chiamare una funzione `H`: `h` è l'alias di `Get-History` e
> l'errore è fuorviante.

Controlli minimi dopo una modifica al dominio:

1. `GET /condomini/:id/tabella-millesimi` → `valida: true` e ogni ripartizione
   attiva fa 1000.
2. `GET /condomini/:id/versamenti/quote` → la somma di `righe[].totale`
   coincide con `totaleDovuto`.
3. Rigenera il verbale e leggilo: presenze, quorum e delibere devono
   corrispondere ai dati inseriti.
4. Verifica i permessi con un account condòmino: non deve poter né creare
   condomini né registrare versamenti, e non deve poter elencare le unità.
5. Verifica i permessi con l'assistente: con il solo permesso
   `versamenti:scrivere` deve poter scrivere e leggere i versamenti e ricevere
   403 su tutto il resto, scritture e letture.

## Scelte strutturali da non annullare

- **Nomi delle collezioni.** `condomini` (il condominio) e `condominati` (i
  legami utente↔unità) sono nomi volutamente simili. Sono stati scelti per non
  avere collisioni con nomi plurali italiani; non unificarli.
- **Router con prefisso esplicito.** Ogni dominio è montato su un prefisso
  proprio in `ambitoCondominio.routes.ts`. Montare più router sullo stesso
  prefisso fa sì che un `/:id` generico intercetti risorse di altri domini
  (è successo: `/assemblee` finiva come id di un condomino).
- **`paginazioneDa` invece di `getPagination`.** Vedi la regola sulle liste.
- **Service worker disattivato in dev** (`devOptions.enabled: false`) perché
  mascherebbe le modifiche a caldo del frontend.
- **Gli allegati stanno in MongoDB, non su disco.** Il filesystem del servizio
  è temporaneo su Render: i file in `server/uploads` sparisce a ogni deploy.
  `allegato.service.ts` li salva e li serve da `/allegati/:id` con firma a tempo
  (24 ore), perché `<img src>` non può portare il token di accesso.
- **Il documento che ospita un allegato tiene solo l'id**, non l'URL firmato né una
  copia dei metadati. Vedi la sezione "Allegati".
- **Gli URL degli allegati sono assoluti in produzione.** Servono `URL_API` e il
  percorso firmato: senza, un `src="/allegati/x"` finirebbe sul sito statico e
  riceverebbe un 404. In sviluppo restano relativi e passano dal proxy di Vite.
- **Gli allegati non vanno in cache nella PWA:** il link firmato scade, e una
  copia in cache continuerebbe a essere servita dopo la scadenza.
- **`.velo` centrato, `.velo-lato` per il pannello.** `.velo` è l'overlay dei
  dialog e li centra; il pannello di navigazione usa il modificatore `.velo-lato`
  per restare a sinistra. Senza il modificatore i form finirebbero in alto a
  sinistra, perché `.velo` era nato per il pannello.
- **Le conferme passano da `useConferma`, mai da `window.confirm`.** L'hook
  restituisce una promise, quindi il chiamante resta lineare:
  `if (!(await chiedi({ titolo, messaggio, conferma, pericolo }))) return;`.
  `pericolo: true` mette il pulsante rosso e sposta il focus sull'annullamento,
  così `Invio` non distrugge nulla per riflesso: va usato su ogni eliminazione.
- **Dentro una pagina che ha già un dialog, `{conferma}` va come ultimo figlio
  del `.velo`.** `.velo` e `.scheda` sono entrambi `position: fixed` con lo
  stesso `z-index`: a parità di z-index vince l'ultimo nell'ordine del DOM, quindi
  una conferma renderizzata prima del dialog resterebbe sotto e sembrerebbe
  non comparire.
- **`.solo-stampa` esiste solo in stampa.** Serve a stampare il testo di una
  `textarea`: il browser stampa una `textarea` come un riquadro grigio delle
  sue dimensioni, con il testo tagliato.
- **Stampa: `AreaStampa` + `PulsanteStampa`, mai `window.print()` a caso.** Il
  PDF si ottiene dalla finestra di stampa del browser con "Salva in PDF", senza
  dipendenze aggiuntive. Ogni `window.print()` va preceduto dall'area di stampa:
  senza, il foglio riproduce anche barra laterale e pulsanti.
- **`--reset` elenca le collezioni con `listCollections`**, non con
  `connection.collections()`: quest'ultimo vede solo i modelli già registrati nel
  processo, quindi `--reset` lascia sul disco i dati delle esecuzioni precedenti.
- **`?` in `if (body.unita && body.unita.length > 0)`** nei controller è un
  controllo di runtime sui dati, non opzionale TypeScript: va mantenuto.
- **Ogni scrittura su un contratto lascia una voce in `storico`**, con
  `modifiche: [{ campo, da, a }]` per i valori cambiati. Le voci si scrivono
  leggendo il valore **prima** di assegnare il nuovo: dopo, "da" e "a" sono la
  stessa cosa. I nomi dei campi nello storico sono in italiano
  (`capacità (condomini)`), non quelli del modello.
- **`PATCH /contratti/:id` è `strict`**: `dataScadenza`, `stato` e
  `amministratore` non sono dichiarati e quindi la richiesta fallisce con 400.
  Non allentare in `partial()` senza allentare anche la ragione: una data
  ignorata in silenzio sembrerebbe cambiata.
