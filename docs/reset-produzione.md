# Azzerare il database di produzione

`npm run reset:produzione` cancella tutto il contenuto del database e ricrea un
solo account, l'amministratore di piattaforma (`superadmin`). Serve per ripartire
da zero su un'installazione vera, o per ripulire dati di prova finiti per
errore in produzione.

Il sorgente è `server/src/scripts/reset-produzione.ts`.

## Cosa sparisce e cosa resta

Sparisce tutto: condomini, unità, quote millesimali, assemblee, verbali, bilanci,
versamenti, contratti, comunicazioni, allegati e anche il registro delle
operazioni (`auditLog`).

Resta un solo documento: l'utente `superadmin`, con `emailConfermato: true` e
accesso pieno. È l'unico modo per ottenere quel ruolo, perché nessuna rotta
promuove un utente esistente: senza questo passaggio il database sarebbe
irraggiungibile.

Tutte le sessioni degli account precedenti smettono di funzionare subito.
`requireAuth` rilegge l'utente dal database a ogni richiesta, quindi risponde 401
senza aspettare la scadenza dei token.

## Dove si esegue e contro cosa

**In locale, mai dal servizio Render.** Il comando azzera davvero e un deploy che
lo esegue per sbaglio non lascia una seconda occasione per annullare.

La destinazione è `MONGODB_URI_PRODUZIONE`, **non** `MONGODB_URI`. Nel `.env`
locale `MONGODB_URI` è il Mongo di sviluppo con i dati demo, e un comando che
cancella un database non deve poterci arrivare per inerzia: se
`MONGODB_URI_PRODUZIONE` manca, lo script non parte e non ha un piano B.

La stringa di connessione è quella del cluster di produzione: Render →
`steward-api` → Environment → `MONGODB_URI`. Copiarla così com'è nel `.env`
locale:

```
MONGODB_URI_PRODUZIONE=mongodb+srv://utente:password@cluster.xxxxx.mongodb.net/steward
```

In alternativa, per una sola esecuzione, in PowerShell:

```powershell
$env:MONGODB_URI_PRODUZIONE='mongodb+srv://utente:password@cluster.xxxxx.mongodb.net/steward'
```

La variabile d'ambiente ha la precedenza sul `.env`: `dotenv` non sovrascrive
quello che è già impostato.

Anche se la stringa è quella giusta, lo script rifiuta `localhost` e
`127.0.0.1`: la stringa viene copiata a mano e una volta sola che ci finisce
l'URI locale, quella è la difesa che ferma il colpo.

## La password del superadmin

Si risolve in quest'ordine:

1. il primo parametro del comando;
2. la variabile `SUPERADMIN_PASSWORD`, che sta nel `.env` locale e non finisce
   nel repository (il `.env` è in `.gitignore`);
3. `SEED_SUPERADMIN_PASSWORD`, il cui default è `SuperAdmin123!`, la password del
   README.

**In produzione usare la 2.** La prima scelta è comoda in una prova, ma finisce
nella cronologia della shell; la seconda è già il posto giusto.

Nel `.env` locale:

```
SUPERADMIN_PASSWORD=UnaPasswordLungaEAOriginale
```

La password non può iniziare con `-`, altrimenti viene letta come un flag.
Deve avere almeno 10 caratteri: è lo stesso limite di
`SEED_SUPERADMIN_PASSWORD`, e un limite più basso renderebbe la creazione
dell'account incoerente con la validazione.

### Perché esiste la variabile d'ambiente

Su Windows `npm run` passa gli argomenti attraverso `cmd.exe`, che mangia alcuni
caratteri. Verificato: `Super&Admin` arriva allo script come `Super`, e `Cosa`
viene eseguito come comando a sé. Con `&`, `|`, `<`, `>`, `^`, `"` o `%` la
password va quindi in `SUPERADMIN_PASSWORD`. Il carattere `!` non dà problemi.

## I due passaggi

Prima il piano, che non modifica nulla e serve a controllare quale database sta
per essere colpito:

```powershell
npm run reset:produzione
```

Poi l'esecuzione:

```powershell
npm run reset:produzione -- --yes
```

`--yes` è obbligatorio. Senza, il comando esce dopo aver stampato il piano.
L'output mostra l'host e il database di destinazione, il numero di documenti per
collezione e l'account che verrà ricreato.

Volendo cambiare la password senza passare dall'ambiente:

```powershell
npm run reset:produzione -- MiaPasswordLunga --yes
```

## Backup prima di farlo

Su Atlas l'operazione è irreversibile: non c'è punto di ripristino. Con
[l'MongoDB Database Tools](https://www.mongodb.com/docs/database-tools/mongodump/)
in locale:

```powershell
mongodump --uri="$env:MONGODB_URI_PRODUZIONE" --out="logs/dump-$(Get-Date -Format yyyyMMdd-HHmm)"
```

La cartella `logs/` è in `.gitignore`: i dump non devono finire nel repository.

## Se qualcosa va storto

Lo script non riesce a tornare indietro, ma non è atomico in senso stretto: se
`dropDatabase` va a buon fine e la creazione del superadmin fallisce, il
database è vuoto e senza accesso. In quel caso il recupero è rilanciare il
comando: l'operazione è pensata per essere ripetibile, e rifarla da zero è
l'unica strada.

## Note

- Le collezioni vengono rimosse **una a una**, non con `dropDatabase`: su Atlas
  quest'ultimo richiede il ruolo `dbOwner`, mentre `dropCollection` è consentito
  dal `readWriteAnyDatabase` con cui l'utente del cluster viene creato. È la stessa
  via di `npm run seed -- --reset`, e chiedere al database un permesso più ampio
  per ottenere lo stesso risultato non vale la pena.
- Lo script ricrea gli indici con `syncIndexes`, perché in produzione non
  partono da soli (`autoIndex` è disattivato per non indicizzare a ogni avvio
  dell'istanza).
- La password non viene scritta nel log, a differenza del seed: chi esegue il
  comando se la sa già.
- Su Atlas il cluster si addormenta dopo qualche minuto di inattività: la prima
  operazione dopo una pausa lunga può mettere fino a un minuto.
- Se il cluster è condiviso con altri progetti, la stringa di connessione dà
  accesso a **tutti** i database: `MONGODB_URI_PRODUZIONE` è una credenziale
  potente, va tenuta nel `.env` locale e non nel repository.
