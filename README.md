# Steward Management System

Gestione condominiale per amministratori e per l'amministratore di piattaforma:
quote millesimali, assemblee, verbali automatici, quote di versamento,
comunicazioni e contratti di fornitura.

Backend Node + Express + Mongoose (TypeScript), frontend React + Vite (SCSS,
mobile first, installabile come PWA).

## Requisiti

- Node.js 20 o superiore
- MongoDB: in locale via Docker, oppure un'istanza remota (Atlas o altro)

## Avvio

```bash
cp .env.example .env          # poi modifica MONGODB_URI se serve
npm install
docker compose up -d mongo    # solo se usi Docker
npm run seed                  # dati dimostrativi
npm run dev
```

- API: http://localhost:4000
- Interfaccia: http://localhost:5173

Per ripartire da zero: `npm run seed -- --reset` (elimina le collezioni,
indici compresi).

## Account dimostrativi

| Ruolo                        | Email                        | Password          |
| ---------------------------- | ---------------------------- | ----------------- |
| Amministratore di piattaforma| superadmin@condomini.local  | `SuperAdmin123!`  |
| Amministratore               | admin@condomini.local        | `Admin123!`       |
| Assistente (delega)          | assistente@example.com       | `Assistente123!`  |
| Condòmino                    | marco.rossi@example.com     | `Condomino123!`   |

Sono definiti in `.env` tramite `SEED_SUPERADMIN_EMAIL`,
`SEED_SUPERADMIN_PASSWORD`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` e
`SEED_ASSISTENTE_*`.

L'assistente ha accesso solo a `versamenti:scrivere`: serve per verificare che la
delega limiti davvero l'ambito visibile, in lettura come in scrittura.

## Funzionalità

**Amministratore di piattaforma (`superadmin`)**

- elenco degli amministratori e creazione di nuovi account
- contratti di fornitura: unità massime, costo, periodicità, durata, scadenza
- sospensione, riattivazione, cessazione e proroga
- rate generate dal contratto e incasso
- messaggi di piattaforma verso gli amministratori

**Amministratore**

- gestione di più condomini, unità immobiliari e condòmini
- tabella millesimali per ripartizioni (`diritto`, `uso`, `spese`, `scale`,
  `ascensore`) con storico delle revisioni e controllo che ogni ripartizione
  in uso sommi 1000
- bilanci preventivi e consuntivi, con ripartizione delle spese
- assemblee ordinarie e straordinarie: convocazione, presenze, deleghe,
  votazioni per punto, delibere, transizioni di stato
- redazione automatica del verbale a partire dai dati dell'assemblea
- registrazione dei versamenti e calcolo delle quote mensili
- bilanci con voci modificabili una alla volta; il consuntivo si genera dal
  preventivo approvato e mostra lo scostamento voce per voce
- punti all'ordine dell'assemblea già scritti, con la delibera predisposta e le
  cifre prese dal bilancio collegato
- comunicazioni verso i condòmini, con broadcast o per singole unità
- delega di ambiti a un assistente, con permessi per ambito e azione
- stato del proprio contratto e ricezione dei messaggi di piattaforma

Un contratto **sospeso** blocca ogni scrittura, per l'amministratore e per i suoi
assistenti. Un contratto **scaduto** lascia gestire ciò che esiste ma impedisce
di aggiungere unità immobiliari oltre la capacità acquistata.

## Email e conferma degli indirizzi

Gli account creati dal superadmin e dall'amministratore per il proprio team
ricevono un'email di conferma dell'indirizzo, inviata tramite
[Brevo](https://www.brevo.it). L'accesso **non viene bloccato**: l'utente entra
normalmente e vede un avviso in alto finché non conferma, perché renderebbe
inutilizzabili gli account appena creati. Se l'email non parte, l'utente resta
comunque creato e chi lo ha creato vede l'esito e può reinviare.

La password provvisoria degli assistenti viaggia nella stessa email: senza,
nessuno saprebbe quale sia, perché non è stata scelta da nessuno.

Per attivare l'invio servono `BREVO_API_KEY` e un mittente verificato su Brevo.
Senza chiave l'applicazione funziona normalmente, semplicemente non spedisce:
vedi la sezione `Configurazione`.

Verbali, bilanci e convocazioni si stampano dal pulsante **Stampa / PDF**: si
ottiene un PDF dalla finestra di stampa del browser scegliendo "Salva in PDF",
senza librerie aggiuntive.

**Condòmino**

- quote dovute, con il dettaglio delle voci di spesa
- storico dei propri versamenti
- verbali delle assemblee a cui ha partecipato
- messaggi all'amministratore, con risposta in thread

## Pubblicazione su Render

La configurazione è in `render.yaml`: Render → **New** → **Blueprint** →
selezionare il repository. Vengono creati due servizi:

- `steward-api`: il backend Node, in ascolto su `$PORT`;
- `stewardmanagementsystem`: il sito statico servito da `client/dist`, che
  diventa **https://stewardmanagementsystem.onrender.com**.

I due nomi non sono decorativi: da essi dipendono i valori derivati
`CORS_ORIGINS`, `URL_FRONTEND`, `URL_API` e `VITE_API_URL`. Rinominare un
servizio richiede di aggiornare quei campi.

### Cookie di sessione e dominio (obbligatorio per la PWA)

Il refresh token sta in un cookie `httpOnly`: è ciò che tiene connessa la PWA
fra un avvio e l'altro. Perché il browser lo mandi, frontend e API devono essere
**same-site**. Non lo sono sui nomi di default: `onrender.com` è nella
[Public Suffix List](https://publicsuffix.org/), quindi
`stewardmanagementsystem.onrender.com` e `steward-api-ef7e.onrender.com` hanno
registrabile diverso e sono **cross-site**. Un cookie `SameSite=Lax` non parte
mai nelle chiamate `fetch` a `/auth/refresh`: la sessione non si rinnova e si
rifà il login a ogni avvio. **Non è un problema di durata del token**, ed è la
stessa cosa che risponde il supporto di Render.

La correzione è dare **a entrambi i servizi un dominio custom sotto lo stesso
dominio registrabile**, ad esempio `app.example.com` (statico) e
`api.example.com` (API). Diventano same-site e `lax` funziona. Passi:

1. Render → servizio → **Settings** → **Custom Domains** → aggiungi
   `app.example.com` al site e `api.example.com` all'API, e crea i CNAME che
   Render indica.
2. Aggiorna in `render.yaml` (o nel pannello) i valori che dipendono dagli URL:
   - `steward-api` → `CORS_ORIGINS=https://app.example.com`,
     `URL_FRONTEND=https://app.example.com`,
     `URL_API=https://api.example.com`;
   - `stewardmanagementsystem` → `VITE_API_URL=https://api.example.com/api`.
   `VITE_API_URL` finisce nel pacchetto: cambiarlo richiede un nuovo deploy.
3. `COOKIE_DOMAIN` resta vuoto e `COOKIE_SAME_SITE=lax`: con i custom domain il
   cookie è host-only e viene inviato correttamente, senza `SameSite=None`.
   `SameSite=None` va evitato: Safari e iOS bloccano i cookie di terze parti,
   quindi la PWA mobile resterebbe rotta.

### MongoDB Atlas

1. Cluster M0 gratuito su [MongoDB Atlas](https://cloud.mongodb.com), regione
   vicina a quella del servizio Render.
2. **Database Access** → `Allow access from anywhere`. Gli IP di Render non sono
   statici e cambiano a ogni deploy: non si può autorizzare un intervallo.
3. **Database** → `Add database user`, con una password generata.
4. **Connect** → copia la stringa SRV nella variabile `MONGODB_URI` del servizio
   `steward-api`:

   ```
   mongodb+srv://<utente>:<password>@<cluster>.mongodb.net/steward?retryWrites=true&w=majority
   ```

   La password va codificata in forma URL: `@` diventa `%40`, `/` `%2F`, `:` `%3A`,
   `#` `%23`. Una password non codificata tronca la stringa e l'errore è
   fuorviante.

### Variabili da inserire a mano

Nel pannello di Render, su `steward-api`: `MONGODB_URI`, `BREVO_API_KEY` e
`BREVO_MITTENTE_EMAIL`. Le ultime due si possono omettere: senza chiave
l'applicazione funziona ma non spedisce email.

Gli altri valori sono già nel blueprint. I due segreti JWT vengono generati da
Render (`generateValue`) perché il server si rifiuta di avviare in produzione con
quelli di sviluppo.

### Prima esecuzione

Atlas parte vuoto: c'è solo il superadmin del seed, se lo si esegue.
`npm run seed -- --reset` va lanciato in locale prima del primo deploy, non su
Render.

```bash
npm run seed -- --reset   # in locale, con MONGODB_URI che punta a Atlas
```

### Cosa cambia sul piano free

L'istanza free di Render è adatta a una prova o a un uso saltuario, non a un
servizio che deve rispondere in orario. Le limitazioni che si vedono:

**Si addormenta dopo 15 minuti** e ci mette circa un minuto a risvegliarsi. Il
frontend è un sito statico, quindi si apre subito; la prima chiamata all'API può
però mettere fino a un minuto. Per questo il server ha timeout di connessione a
MongoDB di 60 secondi in produzione: con i 10 secondi iniziali l'avvio finiva
in crash loop finché Atlas non si svegliava.

**750 ore di istanza al mese per workspace**, e un mese ne ha 744. Per questo il
blueprint **non dichiara un health check**: una richiesta periodica è traffico in
ingresso e tiene l'istanza sveglia consumando tutte le ore disponibili. Se in
futuro serve un monitor esterno, il ping va dato con intervalli superiori ai 15
minuti, o Render sospenderà i servizi fino al mese successivo.

**Niente disco persistente e una sola istanza.** Il disco non serve più da quando
gli allegati sono in MongoDB; l'unica istanza basta finché il carico è basso.

**0.1 CPU e 512 MB di memoria.** Il login impiega circa un secondo perché
bcrypt gira con 12 round: è il costo della sicurezza delle password e si paga una
volta sola per accesso. Se le richieste crescessero, il collo di bottiglia
diventerebbe questo, non il database.

**Blocchi le porte SMTP 25, 465 e 587 in uscita.** Per questo l'invio delle
email passa da Brevo su HTTPS e non da un server SMTP.

**Il cluster Atlas M0 gratuito si addormenta a sua volta** dopo qualche minuto
inattivo, e la prima query successiva è lenta. A catena, la prima richiesta
dopo una pausa lunga può attendere più di un minuto.

Il salto di piano, quando servirà, è `starter` sull'API: toglie l'addormentamento
e il tetto delle ore.

## Comandi

| Comando                  | Effetto                                      |
| ------------------------ | -------------------------------------------- |
| `npm run dev`            | API e frontend in parallelo                  |
| `npm run build`          | build di produzione                          |
| `npm run seed`           | popola i dati dimostrativi                   |
| `npm run seed -- --reset`| svuota e ripopola                            |
| `npm run start`          | avvia la API compilata                       |
| `npm run icone`          | rigenera le icone PWA (workspace `client`)   |
| `npm run reset:produzione`| azzera il database di produzione, vedi `docs/reset-produzione.md` |
| `npm run migra:contratti` | sposta la capacità contrattuale dalle unità ai condomìni |

## Configurazione

Le variabili sono validate all'avvio da `server/src/config/index.ts`: un valore
mancante o incoerente fa fallire l'avvio con un messaggio esplicito.

| Variabile              | Default                                | Note                                        |
| ---------------------- | -------------------------------------- | ------------------------------------------- |
| `PORT`                 | 4000                                   | porta dell'API                              |
| `MONGODB_URI`          | `mongodb://127.0.0.1:27017/condomini`  | connessione al database                     |
| `MONGODB_URI_PRODUZIONE`| vuota                                  | cluster di produzione, solo per `reset:produzione` |
| `JWT_ACCESS_SECRET`    | segreto di sviluppo                    | **da cambiare in produzione**               |
| `JWT_REFRESH_SECRET`   | segreto di sviluppo                    | **da cambiare e diverso dal primo**         |
| `JWT_ACCESS_TTL`       | 15m                                    | durata del token di accesso                |
| `JWT_REFRESH_TTL`      | 7d                                     | durata del refresh token                   |
| `COOKIE_SECURE`        | false                                  | `true` dietro HTTPS                         |
| `CORS_ORIGINS`         | `http://localhost:5173`                | origini ammesse, separate da virgola        |
| `URL_FRONTEND`         | `http://localhost:5173`                | base per il link di conferma nell'email     |
| `BREVO_API_KEY`        | vuota                                  | senza, le email non partono                  |
| `BREVO_MITTENTE_EMAIL` | mittente predefinito                   | deve essere verificato su Brevo              |
| `VITE_API_URL`         | `/api`                                 | lato client                                 |
| `SEED_SUPERADMIN_EMAIL`| `superadmin@condomini.local`           | account di piattaforma creato dal seed      |
| `SEED_ASSISTENTE_EMAIL`| `assistente@example.com`               | assistente con permessi delegati            |
| `SUPERADMIN_PASSWORD`   | vuota                                  | password per `reset:produzione`, solo `.env` locale |

In produzione il server rifiuta di avviarsi se i segreti JWT sono quelli di
sviluppo o se coincidono tra loro.

## Sicurezza

- Token di accesso tenuto solo in memoria nel browser, mai in `localStorage`
- Refresh token in cookie `httpOnly`, con percorso limitato a `/api/auth`
- Cambio password e revoca sessioni tramite `tokenVersion`
- Autorizzazioni per ruolo, per ambito delegato e per condominio su ogni rotta
- Il condòmino vede solo i propri dati e non può sfogliare le unità dello stabile
- Allegati limitati a 10 MB e a un allowlist di MIME

## Verifica dei ruoli

Con API e frontend attivi:

```bash
pwsh scripts/verifica-ruoli.ps1                # profili, contratti, assistenti
pwsh scripts/verifica-permessi.ps1            # matrice di accesso per ruolo
pwsh scripts/verifica-bilancio.ps1            # voci una alla volta, consuntivo, modelli
pwsh scripts/verifica-conferma-email.ps1      # conferma degli indirizzi
pwsh scripts/verifica-frontend-condomino.ps1  # il condòmino conserva i propri dati
```

## Documentazione tecnica

In `docs/`:

- `AGENTS.md`: convenzioni del codice e regole del dominio. Da leggere prima di
  modificare qualsiasi cosa;
- `reset-produzione.md`: come azzerare il database di produzione;
- `TODO.md`: le cose da realizzare, ordinate per urgenza;
- `CHANGELOG.md`: cosa è cambiato e perché.