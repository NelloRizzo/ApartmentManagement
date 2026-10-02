# AGENTS.md

Istruzioni per gli agenti AI che modificano questo repository.
Leggi questo file prima di toccare il codice.

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
npm run seed         # popola il DB con dati demo
npm run seed -- --reset   # svuota le collezioni e ripopola
```

Prima di dichiarare finito un intervento, `npm run typecheck` e `npm run lint`
devono passare. Non aggiungere dipendenze senza un motivo concreto.

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
- Le delibere dei modelli contengono i segnaposto `{totale}` e `{totaleMensile}`:
  vengono risolti in `deliberaRisolta` con le cifre del bilancio collegato al
  punto, cioè quando i numeri sono quelli che l'assemblea approva davvero.

## Regole del dominio

### Bilancio

- Un solo documento per `condominio + anno + tipo` (indice univolo). `tipo` è
  `preventivo` o `consuntivo`.
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
- Usare i token SCSS in `_tokens.scss`. Non inventare colori o spaziature.
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
  le rate, scrive i messaggi. Non è soggetto al proprio contratto.
- `admin` senza elenco di permessi ha accesso pieno a tutti i suoi condomini.
- `admin` **assistente** è un admin con `permessi` non nulli, collegato al
  delegante con `User.delegatoDa` e ammesso nei condomii da `Condominio.assistenti`.
- I permessi sono `ambito:azione`, con ambiti `unita`, `iscritti`, `tabella`,
  `bilanci`, `assemblee`, `verbali`, `versamenti`, `comunicazioni`,
  `amministrazione` e azioni `leggere`/`scrivere`. **`scrivere` implica `leggere`**
  (`haPermesso` in `types/domain.ts`).

### I due guard di permesso

Sono diversi e non vanno scambiati:

| Guard | Chi passa | Da usare su |
| --- | --- | --- |
| `requirePermesso(p)` | solo `superadmin` e `admin` | **scritture** (blocca condòmini e portieri) |
| `requirePermessoLettura(p)` | chiunque, ma controlla l'ambito se è `admin` | **liste e dettagli** |

`requirePermessoLettura` esiste perché `requirePermesso` sulle rotte `GET`
impedirebbe ai condòmini di vedere i propri verbali e le proprie quote: i
condòmini non hanno `permessi` e per loro il filtro è dentro il controller.
Applicare `requirePermesso` a una rotta di lettura rompe il pannello del
condòmino; non applicare `requirePermessoLettura` a una lista lascia passare un
assistente su ambiti non delegati.

`GET /condomini/:id/unita` è l'eccezione: usa `requirePermesso`, perché il
condòmino conosce già la propria unità da `GET /auth/me` e non deve poter
sfogliare lo stabile.

## Controllo del contratto

- Ogni scrittura di dominio passa per `controllaServizio`: se il contratto è
  sospeso o cessato, l'amministratore **e i suoi assistenti** non possono
  scrivere. Le letture restano sempre consentite.
- `verificaCapacitaPerUnita(n)` va bene solo sulle rotte che creano unità o
  condomini. Un contratto scaduto continua a permettere la gestione di ciò che
  esiste, ma non l'espansione.
- La capacità è **unica per contratto**: `statoServizio` conta le unità
  amministrate dal *titolare* del contratto, non quelle dell'assistente che ha
  fatto la richiesta. Se si contano sull'assistente, ogni assistente vede un
  contratto con tutte le unità disponibili e il limite non viene mai applicato.
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

Non esiste ancora una suite di test automatici. Fino a che sarà disponibile,
**verifica le modifiche a mano** contro l'API in esecuzione:

```bash
docker compose up -d mongo
npm run seed -- --reset
npm run dev
```

Credenziali demo:

| Account | Password | Ruolo |
| --- | --- | --- |
| `superadmin@condomini.local` | `SuperAdmin123!` | superadmin |
| `admin@condomini.local` | `Admin123!` | admin (accesso pieno) |
| `assistente@example.com` | `Assistente123!` | admin con solo `versamenti:scrivere` |
| `marco.rossi@example.com` | `Condomino123!` | condòmino |

Sono disponibili quattro script di verifica in `scripts/`, da eseguire con API e
frontend attivi: `verifica-ruoli.ps1` (profili, contratti, assistenti),
`verifica-permessi.ps1` (matrice di accesso per ruolo),
`verifica-bilancio.ps1` (voci una alla volta, consuntivo, modelli),
`verifica-conferma-email.ps1` (conferma degli indirizzi) e
`verifica-frontend-condomino.ps1` (che il condòmino conserva i propri dati).

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
- **Gli URL degli allegati sono assoluti in produzione.** Servono `URL_API` e il
  percorso firmato: senza, un `src="/allegati/x"` finirebbe sul sito statico e
  riceverebbe un 404. In sviluppo restano relativi e passano dal proxy di Vite.
- **Gli allegati non vanno in cache nella PWA:** il link firmato scade, e una
  copia in cache continuerebbe a essere servita dopo la scadenza.
- **`.velo` centrato, `.velo-lato` per il pannello.** `.velo` è l'overlay dei
  dialog e li centra; il pannello di navigazione usa il modificatore `.velo-lato`
  per restare a sinistra. Senza il modificatore i form finirebbero in alto a
  sinistra, perché `.velo` era nato per il pannello.
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
