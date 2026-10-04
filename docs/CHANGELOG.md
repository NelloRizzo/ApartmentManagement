# Registro delle modifiche

Cosa è cambiato e **perché**. Le cose ancora da fare stanno in `TODO.md`.

## 2026-10-04

### Capacità contrattuale contata in condomìni

`Contratto.unitaMassime` è diventato `condominiMassimi` e il consumo della
capacità si è spostato dalla creazione delle unità alla creazione del condominio
(`verificaCapacitaPerUnita` e `contaUnitaNuove` sono spariti, ora c'è
`verificaCapacitaPerCondominio` su `POST /condomini`).

La ragione della scelta: la capacità contrattuale è un numero di stabili
amministrati, non di immobili. Il nome segue la regola del dominio: `condòmino`
è il partecipante, `condomìni` è il plurale di condominio. Negli identificatori di
codice l'accento non è possibile, quindi sono senza accento.

La conversione dei contratti esistenti non è aritmetica ("20 unità" non
equivalgono a un numero di condomìni): `npm run migra:contratti` prende quanti
condomìni l'amministratore amministra già, con minimo 1, così nessuno resta con
un contratto che copre meno di ciò che già gestisce. Lo script usa il database
locale di default e `--produzione` per il cluster, che altrimenti avrebbe
migrato il database sbagliato mentre sembrava quello giusto.

**Da ricordare in produzione**: il deploy deve passare **prima** della migrazione.
Nel mezzo, `condominiMassimi` manca e la API risponde errore di validazione.

I due contratti di produzione sono stati migrati: 20 e 200 unità sono diventati 1
condominio ciascuno, perché nessuno dei due amministratori ha ancora uno stabile.

### Cancellazione del condominio: controllate tutte le dipendenze

`DELETE /condomini/:id` controllava solo unità e assemblee. Otto collezioni
portano `condominio`: senza il controllo, cancellando uno stabile con un bilancio
o degli iscritti quei documenti restavano orfani, irraggiungibili da ogni rotta
perché tutte passano da `requireCondominioAccess`. Ora il messaggio nomina
cosa blocca ("3 unità immobiliari, 1 bilancio") e suggerisce la disattivazione.
`AuditLog` è escluso di proposito: è storia, non un documento vivo.

## 2026-10-03

### Modifica dei contratti, con storico strutturato

`PATCH /contratti/:id`, riservata al superadmin, su costo, periodicità, mesi di
proroga, rinnovo automatico, capacità e note. Lo schema è `strict`: `dataScadenza`,
`stato` e `amministratore` non sono dichiarati e la richiesta risponde 400,
perché una data ignorata in silenzio sembrerebbe cambiata. Le date restano alla
proroga e lo stato ha transizioni proprie.

Lo storico del contratto esisteva già ma registrava solo testo libero. Ora ogni
voce porta `modifiche: [{ campo, da, a }]` con i nomi dei campi in italiano, e la
proroga registra le sue (capacità e scadenza): senza, il cambiamento più
importante di una proroga restava invisibile. `GET /contratti/:id` risolve anche
il nome dell'operatore, che era salvato ma mai mostrato.

Bug incontrato durante la verifica: la proroga leggeva la scadenza precedente
dopo averla aggiornata, quindi "da" e "a" risultavano uguali. Ora è letta prima
dell'assegnazione.

### Pagina "I miei condomini"

Non esisteva una schermata per creare un condominio: `POST /condomini` era
raggiungibile solo dall'API. Un amministratore nuovo non poteva creare lo stabile
e quindi neppure le unità immobiliari, e non c'era nemmeno un'uscita: il
Panorama diceva solo "seleziona un condominio" e `RichiediCondominio` rimandava
al Panorama stesso. La nuova pagina elenca i propri condomìni e li crea; il
selettore in testata si aggiorna con `ricarica()` perché il profilo è l'unica
fonte da cui la UI conosce le posizioni.

L'API non può creare un condominio per conto di un altro amministratore:
assegna `amministratore: utente.sub`.

### Cambio password nel profilo

`POST /auth/cambia-password` esisteva da tempo e non era raggiungibile dalla UI.
Cambiandola il server invalida ogni sessione, quindi il form chiude la sessione
locale e rimanda all'accesso. I controlli su lunghezza e conferma sono replicate
prima della richiesta: mandare una richiesta per un errore già visibile fa
perdere un giro e mostra l'errore lontano dal campo.

### Titolo dell'applicazione

"Steward" è diventato "Gestione Condomini" in titolo del documento, intestazione,
marchio, schermata di accesso e manifest della PWA. Sotto l'icona della home il
`short_name` è "Condomini" perché i sistemi mobili troncano un nome di 18
caratteri.

### Correzione degli id dei collaboratori

`/staff/amministratori` passa da `riepilogoCollaboratore`, che espone l'id in
`id`. La pagina dei contratti lo leggeva come `_id`: l'<option> restava senza
valore, il browser usava il testo come valore e la POST mandava
"Super Amministratore (email)" al posto di un id, con risposta 422 "ObjectId non
valido". Il bug era invisibile perché gli script di verifica chiamano l'API
direttamente e non passano dai form.

### Amministratore di piattaforma: gestione del database di produzione

`npm run reset:produzione` azzera il database e ricrea il superadmin, che è
l'unico modo per ottenerlo su un database vuoto. Tre difese, tutte volute: la
connessione arriva da `MONGODB_URI_PRODUZIONE` e non da `MONGODB_URI` (che nel
`.env` locale è il Mongo di sviluppo), `localhost` viene rifiutato comunque, e
`--yes` è obbligatorio. Senza quest'ultimo il comando stampa il piano e non tocca
niente.

Le collezioni sono rimosse **una a una**, non con `dropDatabase`: su Atlas
quest'ultimo richiede il ruolo `dbOwner`, mentre `dropCollection` è consentito dal
`readWriteAnyDatabase` con cui l'utente del cluster viene creato. Chiedere al
database un permesso più ampio per ottenere lo stesso risultato non vale la pena.

Il file `.env` non poteva essere letto da `docker compose`: la prima riga era un
commento `//`, che il parser di Docker non tollera. Ora è `#`, e il flusso di
verifica documentato funziona.

### Email: mittente e nome

Il mittente è passato a `stewardmanagementsystem@gmail.com`, l'unico mittente
verificato dell'account Brevo, e il nome a "Gestione Condomini - Steward
Management System". Il nome non richiede verifica su Brevo, finisce solo
nell'intestazione: cambiato in `render.yaml` e verificato con un invio di prova,
che è stato accettato.

Due problemi si sono sovrapposti e hanno reso la diagnosi difficile: la chiave
sbagliata su Render faceva fallire ogni invio con un 401 prima di raggiungere
Brevo, quindi non c'era nulla da loggare; e il mittente `noreply@condomini.local`
non era tra quelli verificati, quindi veniva respinto.

`BREVO_MITTENTE_EMAIL` resta `sync: false` nel blueprint: va impostata a mano nel
pannello di Render.

### Documentazione spostata in `docs/`

`AGENTS.md`, il manuale dello script di reset e questo registro vivono in `docs/`
invece che in root e nel README.

## Note d'ambiente

- **Il cluster Atlas è condiviso** con altri progetti (healthbridge,
  street-food-events, altri): chi ha quella stringa di connessione legge e modifica
  tutti i database. Per un servizio vero la copia giusta è quella di un cluster
  dedicato.
- **L'istanza free di Render si addormenta** dopo 15 minuti e ci mette circa un
  minuto a svegliarsi. La prima chiamata dopo una pausa lunga può mettere fino a
  un minuto, anche perché il cluster M0 si addormenta a sua volta.
- **Le credenziali di produzione sono passate in questa sessione** e sono finite
  nel log del terminale: se quella sessione viene condivisa, conviene ruotare la
  password del cluster.