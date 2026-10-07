# Registro delle modifiche

Cosa è cambiato e **perché**. Le cose ancora da fare stanno in `TODO.md`.

## 2026-10-07

### Nel verbale non compariva mai "presente tramite delega a …"

Dal `bugs.md`: "nel verbale non compare mai la riga 'presente tramite delega a …':
`verbale.service.ts` cerca chi è stato delegato con `User.find`, ma `delegaA` punta
a un `Condomino`".

**Un riferimento letto sulla collezione sbagliata.** `Presenza.delegaA` è un
`ref: 'Condomino'`: lo dichiara il modello, così lo manda il selettore del foglio
presenze ("Delega a …" fra i condòmini), così lo scrive il seed quando compila le
presenze dell'assemblea dimostrativa. Il servizio costruiva la mappa dei
delegatari con `User.find({ _id: { $in: targets } })`: gli id dei legami non
trovavano nessuno in `User`, `u` restava `undefined` e la riga veniva saltata. Le
deleghe invece apparivano, perché `numeroDeleghe` conta semplicemente le presenze
con `delegaA` e la riga in apertura ("di cui 1 per delega") dipende solo da quel
conteggio: per questo il testo sembrava coerente, il numero c'era e il nome no.

**Ora si cerca in `Condomino`** e il nome arriva dal suo `utente` popolato, senza
filtro su `attivo`: il delegatario resta tale anche se oggi non è più iscritto allo
stabile, e perderne il nome significherebbe di nuovo saltare la riga.

Le cinque voci restanti di `bugs.md` sono finite in `TODO.md` sotto PRIORITA ALTA
(7-11), con conferma: nessuna dipende da questa modifica.

Verifiche: sezione 11 di `verifica-crud-assemblee.ps1`, otto controlli — presenze
con delega salvate, il conteggio in apertura, il nome del delegatario nella riga,
e la riga che sparisce quando la delega viene tolta. Suite a 196 controlli verdi su
7 script su 9, 239 se i due script fermi tornassero a passare: `verifica-millesimi`
e `verifica-allegati` falliscono per i difetti 10 e 11 di `TODO.md`, che non
dipendono da qui. Typecheck, lint e 30 test.

### Il superadmin non ha più posizioni nei condomini: spariscono i "Condomìni amministrati"

Dal `bugs.md`: "un superadmin nella propria dashboard vede i condomìni amministrati
(in realtà tutti i condomìni): questo non ha senso perché l'amministratore di
piattaforma non amministra condomìni. non basta eliminare la sezione ma controllare
come mai il superadmin possa vedere i condomìni come propri".

**Il profilo li mandava tutti.** `profiloCompleto` aveva un ramo per il superadmin
che faceva `Condominio.find()` senza filtri: ogni stabile del database finiva fra le
sue posizioni con `ruolo: 'osservatore'`, e il client, vedendo posizioni, apriva la
sezione del profilo intitolandola "Condomìni amministrati". Il difetto non era
nell'etichetta ma nel dato: al superadmin veniva presentato come suo ciò che non
era suo, e ogni altra pagina che si affida a `utente.condomini` partiva da lì.

**Ora non riceve posizioni.** È l'amministratore a ricavare i propri stabili da
`Condominio.find({ amministratore, assistenti })`, il portiere dai propri servizi e
il condòmino dai legami in `Condomino`: il superadmin non rientra in nessuno dei tre
perché non amministra nessuno stabile. Resta solo ciò che possiede davvero come
persona (un'unità comprata arriva da un legame `Condomino`, con il suo regime e la
sua quota). Con `condomini: []` la sezione del profilo sparisce da sola — un elenco
vuoto sotto "Condomìni amministrati" sarebbe un altro difetto —, il gruppo
"Condominio" della navigazione non compare perché `amministra` vale `false`, il
selettore non serve più ed è stato ridotto alla sua condizione vera
(`condomini.length > 1`), e l'indice iniziale porta comunque a `/p`.

**Le pagine di condominio gli dicono che non sono sue.** `RichiediAmministratore`
reindirizza il superadmin a `/p`: altrimenti digitando l'URL avrebbe visto
"Gli stabili che gestisci" con tutti gli stabili, cioè lo stesso difetto spostato in
un'altra pagina. `RichiediCondominio`, che per gli altri ruoli propone "Crea il tuo
primo condominio", per lui spiega che la sua sezione è la Piattaforma: proporgli la
creazione lo avrebbe mandato in una pagina che poi gli viene negata. Sono scelte di
interfaccia: **le API restano quelle di prima**, `requireCondominioAccess` lo lascia
entrare in ogni condominio esistente e i test lo coprono ("lascia entrare il
superadmin in un condominio esistente"); cambia solo ciò che l'interfaccia gli
presenta come proprio.

Il ruolo `osservatore` e la sua etichetta "Accesso di piattaforma" sono stati
rimossi: non li produce più nessuno. Corretti anche i commenti che sostenevano il
contrario, nel client e in `AGENTS.md` ("le rotte di condominio rispondono 403 al
superadmin"): è vero per la bacheca, che `/staff/attivita` rifiuta davvero, non per
i condomini.

Verifiche: typecheck, lint, 30 test. `npm run verifica` a 174 controlli verdi su 7
script su 9; `verifica-millesimi` e `verifica-allegati` falliscono **anche senza
questa modifica** (verificato staccando le modifiche): il primo non trova capacità
contrattuale libera su un seed appena fatto (contratto a 2 e 2 occupati), il secondo
manda una creazione di assemblea con il campo `dataInizio` in luogo di `data` e
senza `luogo`. Sono in coda, non dipendono da qui.

### Il segretario si indica mentre l'assemblea si sta svolgendo

Dal `new_tasks.md`: "in un'assemblea, al momento, non posso indicare il nome del
segretario".

**Il server lo sa già, mancava il modo di dirglielo.** `Assemblea.segretario` è un
riferimento a `User` dal primo commit, `assembleaUpdateSchema` lo accetta e
`verbale.service.ts` lo riporta due volte nel testo: "Funge da segretario …" in
apertura e il nome nella riga di firma. L'unica cosa che non esisteva era la riga
in cui scriverlo: da nessuna parte dell'interfaccia si poteva toccare quel campo,
e il verbale cadeva sempre nella formula generica, "il condomino designato
dall'assemblea".

**Si indica in sede, non alla convocazione.** Chi redige l'atto si decide mentre
l'assemblea sta svolgendosi, quindi il selettore sta nella sezione Gestione
assemblea ed è attivo finché `readonly` è falso, cioè fino a `conclusa`: il
server rifiuta ogni `PATCH` su un'assemblea conclusa e la UI non propone nemmeno
il controllo. Il valore si salva alla scelta, come una presenza, perché è una sola
informazione e non un elenco da rimettere a posto insieme; un salvataggio che
fallisce riporta il selettore sul valore del server invece di lasciarlo su una
designazione mai avvenuta.

**I candidati sono chi può davvero esserlo.** L'amministratore — che presiede ma
non compare mai fra i condòmini, e senza il suo campo nel dettaglio
`dettaglio-verbale` non avrebbe potuto indicare se stesso —, l'utente che sta
scrivendo, e i condòmini dello stabile. Un segretario già designato che oggi non
sta più nello stabile resta nell'elenco con il nome in anagrafica, perché un
selettore con un valore fuori dalle opzioni mostra una scelta che non esiste.

**Corretto per strada `utenteId`.** `dettaglio-verbale` scrisceva
`String(c.utente)` su un campo popolato: il client riceveva la stringa
"[object Object]". Nessuno lo leggeva prima, quindi il difetto era invisibile; il
selettore ne ha bisogno per designare quella persona.

Verifiche: sezione 10 di `verifica-crud-assemblee.ps1`, quattordici controlli —
il PATCH durante lo svolgimento, il 403 del condòmino, il campo restituito
popolato con id e nome, il nome nei due punti del testo in cui il segretario
compare, e la formula generica quando la designazione viene tolta. Il verbale si
legge in anteprima, che non persiste nulla: concludere l'assemblea per
generarlo l'avrebbe lasciata nel database, dove non si può più eliminare. Suite a
188 controlli verdi su 7 script su 9: `verifica-millesimi` e `verifica-allegati`
continuano a fallire per i due difetti passati a `TODO.md` (voci 10 e 11).

### Il condòmino vede le assemblee convocate, con il badge che le segnala

Dal `new_tasks.md`: "quando un'assemblea viene convocata, i condòmini dovrebbero
vedere in un'apposita sezione Assemblee l'odg e poter visionare gli allegati. un
badge nella sezione Assemblea indica che è stata convocata un'assemblea".

**La sezione esisteva ma era vietata al condòmino.** Le rotte `c/assemblee` e
`c/assemblee/:id` stavano sotto `RichiediAmministratore` e la voce di
navigazione aveva `permesso: 'assemblee:leggere'`, che per un condòmino vale
`false` in `puo()` — cioè la voce non sarebbe **mai** comparsa, non perché il
server la rifiutasse ma perché il client la filtrava prima. Le guardie di
lettura, al contrario, lasciano passare chi non è admin: il confine era già nel
controller, e la guardia di rotta lo duplicava in modo sbagliato. Ora le due
rotte non hanno guardia di ruolo, la voce non ha `permesso` (come "Le mie quote"
e "Verbali") e il server continua a decidere cosa arriva.

**Il dettaglio arrivava spezzettato.** Il condòmino apriva la pagina con
`GET /dettaglio-verbale`, rotta di scrittura (`requirePermesso`) che quindi gli
rispondeva 403: la pagina restava vuota. Ora chi non scrive legge da `GET
/:id`, che per il condòmino toglie presenze, votazioni, elenco condòmini e
transizioni e risponde `solaLettura: true`. Il campo non è un filtro sul
client: i campi mancanti restano mancanti e la pagina deve poter dire perché,
nascondendo il foglio presenze (che altrimenti apparirebbe come "0/0" e come un
invito a modificare), le statistiche che di quel foglio dipendono e ogni
pulsante di salvataggio. Stessa logica in elenco, dove `list` toglie presenze e
votazioni ma lascia `numeroPresenti` e millesimi, che sono il riepilogo che
l'assemblea pubblica. Il verbale, se esiste, resta leggibile: è il documento che
il condòmino va a cercare.

**Il badge conta una cosa sola, per utente.** `GET /assemblee/da-vedere` conta
le assemblee `convocata`/`in_corso` in cui il condòmino ha una riga di presenza
e che non ha ancora aperto, con `odgVistoDa` (array per utente, come `lettaDa`
sulle comunicazioni: se guardasse `stato`, la prima lettura lo azzererebbe per
tutti). `conclusa` non conta: dopo l'assemblea il documento che conta è il
verbale. La stessa regola della lista, non un secondo calcolo: due filtri che
partono da domande diverse divergono, e il badge deve contare le stesse cose che
l'elenco mostra. `POST /odg-visto` segna la lettura aprendo la convocazione, e
il contatore non è critico: se la chiamata fallisce l'ODG si è aperto lo stesso.
Il tipo del badge in `VoceNavigazione` è passato da `boolean` a
`'nonLette' | 'daVedere'`, perché una voce dichiara quale dei due contatori
legge invece di leggere sempre quello delle comunicazioni.

**La convocazione ora scrive i convocati.** Punto che ho fatto decidere, perché
cambia il dominio: `presenze` non veniva popolata alla convocazione, e sia la
lista sia il badge cercano il condòmino dentro quelle righe
(`presenze elemMatch`). Senza righe la convocazione sarebbe restata invisibile
a chi doveva vederla **finché l'amministratore non salvava il foglio
presenze**, che di norma succede durante l'assemblea: il badge non sarebbe mai
partito nella situazione normale. `completaConvocati` aggiunge una riga
`presente: false` per ogni iscritto attivo mancante quando lo stato diventa
visibile (`convocata`, `in_corso`, `conclusa`), per `changeState` e per la
`PATCH` che cambia stato. Aggiunge solo i mancanti: un foglio già compilato in
bozza resta com'è, e per l'amministratore non cambia nulla, perché il foglio di
presenze l'interfaccia lo costruisce comunque dall'elenco dei condòmini.

La lista del condòmino, `getOne` e `assicuraVisibileAlCondomino` usano adesso la
costante `STATI_VISIBILI` del service: visibilità ed elenco dei convocati devono
dire la stessa cosa, e divergerebbero al primo stato aggiunto.

Verifiche: sezione 9 di `verifica-crud-assemblee.ps1` (sedici controlli: i
convocati scritti alla convocata, il badge che sale e che scende dopo
`odg-visto`, la ripetizione che non muove il conteggio, zero per
l'amministratore, e la risposta al condòmino tutta in sola lettura con
`dettaglio-verbale` che risponde 403). Suite a 34 controlli, totale
`npm run verifica` a 219, più typecheck, lint e 30 test.

## 2026-10-06

### Il superadmin può modificare un amministratore e reimpostarne la password

L'API aveva già `PATCH /staff/amministratori/:id` e il reinvio della conferma,
ma **l'interfaccia non li usava**: la pagina Amministratori mostrava le schede e
un solo modulo, quello di creazione. Un nome sbagliato o un numero di telefono
sbagliato si correggervano solo dal database.

Ora la scheda è un pulsante che apre il modulo di modifica: nome, cognome,
telefono e accesso consentito, con l'email mostrata come dato di sola lettura
perché non è modificabile dall'interfaccia. Il pulsante "Reimposta password" sta
**dentro il dialog**, non sulla scheda: la scheda è essa stessa un pulsante, e
annidarne un secondo produrrebbe HTML non valido e un click ambiguo. Per lo
stesso motivo il reinvio della conferma è passato dal corpo della scheda al
dialog, dove c'è spazio per spiegare a chi va fatta cosa.

La password non la sceglie il superadmin e non viene mostrata a nessuno:
`passwordTemporanea` la genera e arriva solo nell'email di conferma, insieme al
link che riapre il ciclo di verifica dell'indirizzo. Il pulsante non esiste per
l'account corrente, perché il proprio accesso si cambia dal profilo: qui la
nuova password tornerebbe per email a chi sta già dentro.

**Se l'email non parte, la password non cambia.** Il controller salva la nuova
password, invia e, se `inviaEmail` fallisce, rimette a posto password
precedente, `tokenVersion` e `emailConfermatoIl`, poi risponde 503 spiegando che
niente è stato toccato. Senza quel ripristino l'amministratore resterebbe con
una password che non conosce e che nessuno ha ricevuto: un account bloccato
senza via d'uscita, perché il pulsante si può premere di nuovo ma la email
continuerebbe a non partire. Il caso è verificato in
`verifica-conferma-email.ps1`, che prova anche i due casi negativi (l'admin e
l'utente non possono, il superadmin non può sul proprio account).

Nello stesso giro `AGENTS.md` ha una sezione nuova, "Non lasciare processi
appesi": `npm run dev` avviato in background e dimenticato occupa le porte,
`tsx watch` si riavvia a ogni file salvato e chi guida il progetto deve killinglo
a mano. Più il motivo per cui le verifiche usano `Invoke-RestMethod` e non
`Invoke-WebRequest`.

### Il pallino delle non lette contava anche i messaggi che non si vedevano

Dal `bugs.md`: "come condòmino dopo aver letto un messaggio e inviata anche una
risposta, il messaggio scompare da Posta in Arrivo ma resta il badge (1)". Non è
un difetto solo, e non è il fatto che il messaggio esca dalla posta in arrivo:
quello è voluto, è `risposta` a dichiararlo. Sono due difetti che insieme danno
il sintomo.

**Il contatore contava cose che la lista non mostrava.** `contaNonLette` escludeva
solo le bozze, mentre "Posta in arrivo" accetta `inviata` e `letta`: un avviso a cui
si risponde passa a `risposta` e sparisce dalla lista, ma restava contato. Per
marco.rossi il badge diceva **61** e la lista ne mostrava 33: 49 delle 61 erano
messaggi già risposti, visibili da nessuna parte. Ora il contatore ammette gli
stessi stati della lista, e la divergenza è a zero: badge 7, tutte e 7 in lista.

**La segnatura di lettura non partiva per gli avvisi collettivi.** In
`PaginaComunicazioni` la chiamata a `/letti` era condizionata a `destinatario`
presente, ma gli avvisi dell'amministratore hanno `destinatari` e non
`destinatario`: delle 7 comunicazioni che il badge segnalava e che erano in
lista, **7 erano broadcast e nessuna aveva un destinatario singolo**. Il
condòmino le apriva e il pallino non scendeva mai. La condizione guardava anche
`stato`, che è un campo unico della comunicazione: dopo che l'aveva aperta
qualcun altro diceva 'letta' anche per chi non l'aveva ancora letta, quindi il
secondo lettore non partiva ugualmente. Ora si segna tutto quello che non ho
scritto io e che sta ancora in posta in arrivo, `risposta` escluso per non
riportarlo dentro.

Verifiche: 25 controlli su `verifica-permesso-comunicazioni.ps1`, quattro nuovi
sui due casi, più typecheck, lint e 30 test.

### In bacheca: la casella "affidate a me" non poteva filtrare niente, e il bordo si spegneva al passaggio del puntatore

Due cose dalla coda delle idee, entrambe sulla stessa pagina.

**La casella era uselesse per chi la vedeva.** Gli assegnatari sono validati
contro il team del proprietario, quindi un amministratore non può trovarsi fra
quelli delle proprie attività: `soloAssegnate` gli filtrava sempre a vuoto, e con
una lista vuota sembrava un errore. Ora compare solo a chi può davvero essere un
assegnatario, cioè un assistente.

**Su hover la linea di colore diventava grigia.** `border-color` è una scorciatoia
che ridefinisce tutti e quattro i bordi, quindi la regola di `.bacheca-card:hover`
si mangiava anche il bordo sinistro colorato di `.bacheca-card-colore`, proprio
nel momento in cui la card è in evidenza. Su hover il bordo prende ora il colore
scelto per l'attività.

Dal `new_tasks.md` il cambio di email da parte dell'utente è passato in
`TODO.md` con le domande da decidere prima di scrivere codice: non è un lavoro ma
una scelta, e finché non si decide chi verifica la nuova casella e che fine fa
l'indirizzo vecchio nei contratti e nel registro operazioni, la voce è un
promemoria. Anche lo script di emergenza per la password del superadmin è passato
in `TODO.md`: l'unica via oggi è `reset:produzione`, che azzera il database, e la
voce porta con sé le tre decisioni ancora aperte e quella già presa, cioè che la
password arrivi solo da argv o variabile e non via email. `new_tasks.md` resta
vuota.

### L'utente può cambiare il proprio indirizzo email, e il cambio aspetta la conferma

La voce 5 del `TODO.md`, che era una domanda e non un lavoro.

**Le implicazioni sui dati precedenti si sono rivelate quasi nulle, e la ragione
era nel codice**: l'unico indirizzo in chiaro è `User.email`. Contratti,
comunicazioni e attività tengono tutti un `ref` a `User`, quindi le cose già
scritte non si muovono e continuano a mostrare l'indirizzo attuale. L'altra
traccia è `AuditLog.dettagli.email`, e quella **non va toccata**: è la prova di
quale indirizzo era in quel momento.

**Il problema vero era un altro, e non l'avevo scritto nella voce.** Il login è per
indirizzo email e nessuno poteva cambiarlo: `aggiornaAmministratore` accetta nome,
cognome, telefono, `attivo` e `permessi`, non `email`, e il superadmin non è
soggetto a nessuno. Quindi un indirizzo sbagliato non era un disagio ma un blocco,
e l'unica salita era il database a mano.

Per questo **il cambio non è immediato**: il nuovo indirizzo sta in
`User.emailInAttesa` e diventa quello dell'account solo quando il token inviato a
quella casella viene usato. Salvare subito avrebbe significato che una cifra
sbagliata tiene fuori l'utente e che nessuno può correggerla al posto suo. Il
vecchio indirizzo resta valido, quindi **uno sbaglio non costa niente** e la strada
funziona anche per il superadmin, che non ha nessuno sopra di sé.

**L'avviso alla casella precedente è la difesa vera.** Va all'indirizzo che si sta
perdendo, non a quello nuovo: se il cambio l'ha fatto qualcuno con una sessione in
mano, l'unica casella che può accorgersene è proprio quella che sta per
scomparire. È il secondo modello in `email.service.ts`, che ne aveva uno solo; il
token è creato dal controller e non dentro il servizio, perché il cambio e l'avviso
devono parlare dello stesso link.

**La password viene richiesta** perché chi ha una sessione in mano non deve poter
dirottare anche il recupero dell'account. Il cambio è rifiutato a un account non
confermato: ha già una conferma in corso, e accavallarle lascerebbe due token per
un solo hash, con un link che muore senza essere letto. C'è anche l'annulla, che
svuota attesa e hash insieme: senza, chi ha sbagliato a digitare resterebbe davanti
a un avviso che non può togliere, e il link annullato potrebbe completare il cambio.

Al momento dello scambio **non si tocca `tokenVersion`**: l'indirizzo non è una
credenziale di sessione e l'account non ha mai perso validità, quindi non c'è
ragione di far uscire chi ci sta lavorando.

Verifiche: `verifica-conferma-email.ps1` con tredici righe nuove, cinque sui rifiuti
(password, email malformata, stesso indirizzo, indirizzo occupato, account non
confermato) e il percorso completo fino all'annulla. Il ramo di scambio è stato
provato a parte, forzando l'hash di un token noto: la conferma scambia, il login
col vecchio indirizzo fallisce, il token consumato non si riusa e un link scaduto
non completa nulla. Più typecheck, lint, build del client e 30 test.

### La pagina dei bilanci andava in crash aprendo un bilancio senza allegati

Segnalato dal `bugs.md` con la console: `TypeError: Cannot read properties of
undefined (reading 'length')` in `PaginaBilanci`, su una voce di bilancio. Non
era un problema di produzione: era un difetto che il database di sviluppo non
mostrava, perché il seed scrive `allegati: []` esplicitamente.

La causa è la combinazione di due cose che sembrano innocue. `lean()` **non applica
i default dello schema**: una voce che non ha mai avuto un allegato arriva con il
campo assente, non con un elenco vuoto. E `espandiAnnidati` aveva un ritorno
anticipato `if (raccolti.length === 0) return documenti`, che è **il caso più
frequente**, perché quasi nessuna voce ha allegati: proprio lì il campo non veniva
normalizzato. Il frontend legge `v.allegati.length` e andava in crash.

La normalizzazione avviene ora anche senza query. Il punto è che **è lei che
garantisce la forma dell'oggetto**, non il fatto che siano arrivati dei file: la
forma non deve dipendere dal contenuto.

Lo stesso difetto era sull'assemblea, dove i punti all'ordine del giorno leggono
`punto.allegati.length` nello stesso identico modo e passano dalla stessa
funzione. Lì i punti avevano già `allegati` perché il seed lo scrive, quindi il
crash era possibile solo sui dati senza quel campo.

Verifiche: due controlli in `verifica-crud-bilanci.ps1` che leggono il campo sulla
voce appena creata, che è il caso che non ne ha. Riprodotto **prima** della
correzione con un bilancio le cui voci non avevano mai avuto allegati: `allegati`
ASSENTE su tutte e 7, dopo la correzione `presente(0)` su tutte e 7. Suite del
bilancio a 27 controlli, più typecheck e lint.

### L'allegato del punto all'ordine del giorno c'era, e non si vedeva

Dal `new_tasks.md`: "i punti all'ordine del giorno dovrebbero prevedere la
possibilità di caricare degli allegati". **La possibilità c'era già**, dal 29
settembre, e quindi la voce era superata. Ma segnalando che mancava il controllo
qualcuno ha guardato e non l'ha trovato: la domanda era giusta anche se la risposta
sulla funzionalità no.

Il pulsante era un graffino `btn-fantasma`, cioè il testo più tenue
dell'interfaccia, in una riga di un punto all'ordine del giorno piena di numeri e
campi. Passava in mezzo a quattro input di votazione, sotto l'etichetta grigia
"Materiale del punto". Chi non lo scorgeva concludeva che la funzione non
esistesse, e la segnalazione tornava ogni volta.

Ora è un bottone **con testo** — "Allega file", "Allega altro (2)" — come
`AllegatiSezione` usa per verbale e comunicazione, e l'etichetta è una vera
etichetta di campo e non testo grigio. L'icona resta solo dentro il bottone
dell'interfaccia, dove un'icona sola non dice nulla e il numero accanto è il
conteggio.

**Il punto non ha un `_id` proprio** (`puntoOrdineSchema` è `{ _id: false }`), si
indica col numero d'ordine: per questo l'allegato si carica dall'assemblea aperta e
**non** dal form di creazione, dove l'assemblea non ha ancora un id. Non è un
limite da colmare, è la conseguenza di come sono fatti i punti.

**Nessuna verifica copriva la rotta.** `verifica-allegati.ps1` passava voce di
bilancio, verbale e comunicazione, mai il punto: la rotta esisteva e nessuno la
provava, quindi un difetto sarebbe arrivato in produzione senza che niente lo
notasse. Ora c'è la sezione 13: caricamento, metadati, download con firma, 403
all'assistente e rimozione. La creazione dell'assemblea di prova è stata scritta
per non lasciare residui: se non c'è una bozza con un punto e senza verbale, se ne
crea una e la segna per la pulizia finale.

Verifiche: 33 controlli tutti verdi, più typecheck, lint e build del client.

## 2026-10-05

### La tabella millesimale non promette più uno storico che non c'è

Il messaggio sotto la tabella diceva: "Salvando, la revisione precedente resta
consultabile nello storico". **Non c'è nessuno storico nell'interfaccia**, e non
c'è nemmeno una rotta che lo restituisca.

Ora dice che la revisione precedente **resta conservata**, che è la verità:
`nuovaRevisione` chiude la precedente con `validTo` e inserisce la nuova con
`revisione + 1`. Conservata e consultabile sono due cose diverse, e il testo ora
non promette la seconda.

Nello stesso giro ho riletto `TODO.md` e tolto quattro voci con la tua scelta:
spostare un'unità in un altro condominio, la deliga per condominio e
l'assistente a un solo condominio (che erano la stessa voce due volte, a due
priorità diverse), e il selettore degli anni nei bilanci.

Il punto sulla bacheca è stato riaperto per verificare quanto mancasse, e **non
mancava niente**: la scadenza superata è già derivata da `dataFine` e non
completata, l'etichetta passa da "Entro il" a "Scaduta il" e il bordo della card
diventa rosso. Nessun codice cambiato, quindi nessuna modifica da registrare qui.

### `pila-N` non dava nessuno spazio, in 76 punti del frontend

`.pila-1` fino a `.pila-6` impostavano **solo** `gap`, mentre `display: flex` e
`flex-direction: column` stavano su `.pila`, una classe che nessuno scriveva:
`className="scheda-corpo pila-4"` non contiene `pila`. L'elemento restava un block e
`gap` su un block non fa nulla.

Non si vedeva come un problema di spaziatura, ma come "manca un margine sopra" in
punti che sembravano non avere niente in comune: il modulo di un nuovo assistente, la
pagina di un contratto, la tabella millesimale, la bacheca. **Sessantasei
occorrenze in ventisette file** avevano la classe con lo spazio che non arrivava.

Ora il `display: flex` è su `pila-1..6` oltre che su `.pila`: la classe sta in
piedi da sola. Le quattro `.margine-sopra` che erano state messe a mano come
tappo dentro un contenitore `pila-*` sono state tolte, perché adesso farebbero
spazio doppio.

### La stessa classe, in tre punti senza `riga`

`riga-tra` è un `justify-content: space-between` e funziona **solo su un elemento
flex**. Tre scavalchi su elementi che non lo erano, quindi la spazione non si
vedeva: il bottone "Allega file" negli allegati, il bottone del materiale del punto
in una assemblea, e una classe del tutto morta con uno stile inline ridondante
nella pagina dei versamenti. La regola non è "serve `riga`" ma "l'elemento deve
essere flex": `.voce riga-tra` va bene anche senza `riga`, perché `.voce` è già
flex.

### Nella tabella millesimale il campo era più a sinistra del titolo

Le intestazioni hanno `className="num"`, quindi sono allineate a destra, ma il campo
è un `<input>` a larghezza fissa dentro una cella allineata a destra: le cifre
finivano `padding` e bordo più indietro rispetto al titolo sopra, e sembrava che il
titolo fosse a destra e il campo a sinistra.

Ora il simbolo dei millesimi sta **dopo** il campo e non dentro: dentro, l'utente
potrebbe digitarlo e il campo è un `number` che rifiuterebbe la lettera senza
spiegare perché. Resta con `aria-hidden`, perché l'`aria-label` del campo dice già di
che quota si tratta e un simbolo ripetuto su ogni riga non aggiungerebbe nulla a chi
lo ascolta.

### "Legge" si poteva disattivare con "Scrive" attivo

`haPermesso` **deriva** la lettura dalla scrittura, quindi togliere la casella non
toglieva niente al collega: lasciava una casella spuntata che diceva il contrario di
quanto concesso, e si salvava uno stato che il backend già considerava equivalente.
La casella "Legge" ora è disabilitata quando "Scrive" è attivo, invece di ignorare il
clic in silenzio.

### `bugs.md` e `new_tasks.md` escono dal repository

Entrambi sono in `.gitignore` e non sono più tracciati. Sono le due code di lavoro di
chi guida il progetto e, per costruzione, sono transitorie: un bug viene risolto o
spostato in `TODO.md`, un'idea viene discussa e poi entra in `TODO.md` o muore. Se
finissero nella storia sembrerebbero decisioni prese, e non lo sono.

Sono state svuotate: le quattro idee di `new_tasks.md` sono realizzate o spostate in
`TODO.md`, e i quattro bug di `bugs.md` sono risolti tranne lo storico delle quote
millesimali, che ora ha una voce in `TODO.md` con le due decisioni ancora da prendere.

### Un amministratore poteva leggere i messaggi di qualunque condominio

Il condominio non arrivava mai alla query, e in due punti diversi.

`comunicazioneListQuery` **non dichiara `condominio`**, quindi `validate` lo scartava
come chiave non dichiarata: il controller leggeva `req.query.condominio`, trovava
sempre `undefined`, e la lista **non filtrava nulla**. Per un amministratore o un
portiere il filtro di visibilità è vuoto, quindi la pagina "Messaggi" elencava i
messaggi di **tutti gli stabili del database**, mescolati. Il client non mandava
quel parametro, quindi non era un problema di come si chiamava: semplicemente il
filtro non esisteva.

`assicuraAccesso` peggio: **restituiva subito** per admin e portieri, quindi il
messaggio singolo non veniva nemmeno guardato. Conoscendo l'id di una
comunicazione, qualsiasi amministratore poteva aprirne il contenuto e il thread
intero, di uno stabile che non amministra. Verificato dal vivo prima di correggere.

Il perimetro ora è **il condominio della rotta**, che ha già superato
`requireCondominioAccess`: il controller passa `req.params.condominioId` e non legge
più il condominio dalla query, che è il posto da cui il `validate` lo cancellava.
Uno stabilio diverso risponde **404**, non 403, perché confermare che il messaggio
esiste rivelerebbe che in quel condominio è stata Mandata una comunicazione.

Il superadmin continua a poter leggere ogni stabile: è una scelta precedente e
voluta, registrata in `requireCondominioAccess`. La mappa dei ruoli è la stessa di
`filtroCondomini` e di `requireCondominioAccess`: superadmin tutto, amministratore
e assistenti i propri stabili, portiere quelli che serve, condòmino i suoi.

### Un condòmino non poteva aprire il messaggio che aveva scritto lui

`getOne` fa `populate` su mittente e destinatario, `segnaLetta` e `update` no.
Confrontando il campo popolato si ottiene `"[object Object]"`, quindi il controllo di
partecipazione **falliva sempre**: chi scriveva all'amministratore riceveva un 403
aprendo la propria richiesta. All'amministratore non diceva niente, perché per lui
quel controllo non esiste: il bug si nascondeva dietro il fatto che il percorso
interessato è quello del condòmino.

`idDi` ora accetta sia un id sia un documento popolato, così il controllo non
dipende da come è stata costruita la query.


### Il codice del condominio non si sceglie più, si genera

Era un campo di testo libero che nessuno sapeva spiegare: obbligatorio, univoco,
maiuscolo, e nessun formato. Compariva nei contratti e nelle comunicazioni, dove
il nome non basta perché due stabili possono omonimi.

Ora lo genera il server: le prime cifre vengono dal nome e il resto è un suffisso
casuale, quindi `Residenza Aurora` dà `RESIDENCEAUR-1A2B3C`. Il campo non è più
compilabile e nel form di modifica è mostrato come testo con la nota che è
autogenerato.

**Non è modificabile**, e per questo `condominioCreateSchema` e
`condominioUpdateSchema` sono `strict`: mandare `codice` in creazione o in
modifica è un `400` esplicito. Senza `strict` la `PATCH` verrebbe ignorata in
silenzio e sembrerebbe una modifica riuscita, che è la stessa ragione per cui
`aggiornaContrattoSchema` è `strict`.

### Il condòmino sceglie su quale condominio lavorare

Il selettore in testata compariva solo a chi **amministrava** almeno uno stabile,
e un condòmino non amministra mai nulla: chi è iscritto a due stabili non poteva
scegliere quale guardare. La condizione ora è "ha più di uno stabile fra cui
scegliere", con la sola eccezione del superadmin che non ne amministra nessuno,
perché i suoi stabili sono quelli che vede senza amministrarli e le rotte gli
rispondono 403.

La situazione non è teorica: l'iscrizione cerca l'utente per email e, se esiste, lo
aggancia. Scrivendo in uno stabile la email di un iscritto di un altro, l'utente
finisce in entrambi e i due amministratori non vengono a saperlo.

### Nell'intestazione c'è scritto su quale condominio si lavora

Il nome da solo sembrava il titolo della pagina: ora l'amministratore di
condominio e il condòmino leggono `Condominio attivo: Residenza Aurora`. Al
superadmin si mostra `Dashboard`, perché la sua casa è la piattaforma e il nome
dello stabile è già nella barra di selezione.

Le due copie del selettore, una nella barra laterale e una nella barra stretta,
avevano ognuna la propria condizione e il proprio commento: ora ne condividono una.

### Le due voci sulla scadenza delle attività diventano una

In `TODO.md` c'erano "le scadute in una sezione separata" e "i filtri per
scadenza", che sono lo stesso asse. Sono una voce sola, con le due decisioni che
restano da prendere: il gruppo delle scadute non può stare nel server senza una
seconda query, perché la paginazione taglia a `limit`; e il rosso va derivato dalla
data e non memorizzato, perché una card memorizzata resterebbe scaduta per sempre.


### In dashboard c'erano due sezioni "Account"

Segnalato in `bugs.md` navigando come superadmin: la barra laterale mostrava **due
gruppi intitolati "Account"**, uno con il profilo e uno con "Il mio contratto". Il
secondo era anche inutile, perché il superadmin non è soggetto a un contratto: la
voce portava a una pagina che non ha nulla di suo.

Ora `gruppoAccount` mette profilo e contratto nella **stessa** sezione e riceve
`mostraContratto`: per il superadmin la voce non viene aggiunta. Le due sezioni
non possono più separarsi, perché il titolo è uno solo e basta un parametro.

Nella stessa segnalazione: la voce si chiama "Messaggi" e non "Messaggi agli
admin", perché nella piattaforma non esiste un mittente con cui contrapporre un
"agli admin".

### Allegati: finalmente funzionanti, e con i metadati

Gli allegati esistevano da tempo ma **non funzionavano**, su nessun dominio.
Quattro difetti, tutti verificati prima di scrivere una riga:

- **I file caricati venivano scartati.** Le rotte accettavano `multipart` ma
  `toAllegati` era chiamata solo dall'endpoint a parte: creare una comunicazione con
  un file rispondeva `200` con `"allegati": []`, senza errore né avviso.
- **Il link del file moriva dopo 24 ore.** L'URL firmato veniva scritto dentro il
  documento che lo referenziava, e la firma non si rinnovava: ogni documento con un
  allegato più vecchio di un giorno aveva un link morto. `rinnovaUrl` esisteva e non
  era chiamata da nessuna parte.
- **Il ciclo del TTL non eseguiva mai un corpo**, perché girava su un elenco
  sempre vuoto.
- **Non esisteva caricamento dal client**: `api.upload` era definito e non usato.

Ora il documento che ospita un file tiene **solo l'id**: i metadati si leggono da
`Allegato` a ogni richiesta e l'URL viene firmato di fresco. È la conseguenza
diretta del fatto che la firma scade.

Ogni documento ha `oggetto` obbligatorio, e `descrizione`, `fonte` e `riferimento`
facoltativi. `oggetto` è obbligatorio perché il nome del file lo dice il mittente,
non chi legge, e finisce in "documento (1).pdf".

**Dove stanno gli allegati**: sulla **voce** di bilancio (la fattura e la quietanza
di quella spesa), sul **punto all'ordine del giorno** (la relazione di quella
deliberazione), sul verbale, sul versamento (uno solo: la quietanza) e sulla
comunicazione. L'elenco a livello di assemblea è stato tolto: dopo questa scelta non
avrebbe riempito niente.

Come per i bilanci approvati, un verbale approvato e un'assemblea conclusa non
accettano allegati: dopo la ratifica aggiungere un documento sarebbe cambiarne il
contenuto.

Quattro bug emersi scrivendo il dominio e le verifiche:

- **I metadati degli allegati venivano scartati dalla validazione.** `validate`
  *sostituisce* `req.body` con il risultato di Zod, che elimina le chiavi non
  dichiarate: `allegatiOggetto` spariva prima che il controller lo leggesse e ogni
  file prendeva per oggetto il titolo della comunicazione. Risolto con
  `leggiMetaAllegati`, che li raccoglie **prima** della validazione.
- **Lo spread di un documento Mongoose** funziona con `populate` ma `create()`
  espone anche `$__` e `activePaths`, finiti in una risposta JSON. Ora si usa
  `toObject()`.
- **Con un file non si poteva salvare una comunicazione in bozza**: multer legge
  tutti i campi come stringhe, quindi `salvaComeBozza: 'true'` non passava un
  `z.boolean()`. Introdotto `flagCorpo`, che accetta anche la stringa come
  `flagQuery` per le query.
- **Togliere il campo `allegati` dall'assemblea ha rotto `GET /assemblee/:id`**: il
  controller faceva `populate('allegati')` su un percorso inesistente, e con
  `strictPopulate` attivo questo **fa fallire la rotta** invece di tornare `[]`
  silenziosamente. Il compilatore era tranquillo.


### Il pallino dei messaggi contava le cose sbagliate

Il pallino su "Messaggi" c'era già, e funzionava: `GET
/condomini/:id/comunicazioni/non-lette` alimentava il contatore e la barra lo
disegnava. Contava però **le cose sbagliate**, per tre motivi indipendenti.

**Guardava `stato`, che è un campo unico della comunicazione.** `segnaLetta` lo
porta a `'letta'` per tutti: bastava che l'amministratore aprisse un avviso perché
il pallino del condòmino tornasse a zero senza che lui l'avesse mai visto. Il
campo giusto è `lettaDa`, un array per utente che **esisteva già e non lo usava
nessuna query**.

**Guardava solo `destinatario` e `destinatari`.** Le comunicazioni indirizzate a
un'unità immobiliare hanno il destinatario in `unita`, quindi il contatore era più
basso della lista che l'utente vedeva. Ora parte da `filtroVisibilita`, la stessa
funzione che filtra l'elenco: i due non possono divergere in futuro.

**Non era legato al condominio.** La rotta riceve il condominio dal percorso e lo
validava, ma la query non lo usava: un amministratore con dieci stabili vedeva la
somma di tutti e il pallino non cambiava passando da uno all'altro.

Aggiunto anche l'avviso in Panorama, che è la pagina in cui tutti atterrano dopo
il login: il pallino dice quante sono, l'avviso dice cosa sono.

### La bacheca mostrava la scadenza più lontana

La bacheca ordinava già per `dataFine`, ma `paginationQuery.order` ha default
`'desc'`: si partiva dalla scadenza **più lontana**. In bacheca la domanda è "cosa
scade per primo", quindi `listaAttivitaQuery` ora dichiara il proprio `order: 'asc'`
invece di spostare il default di tutte le liste.

Invertire l'ordore da solo avrebbe fatto emergere un altro difetto: in MongoDB un
campo assente ordina come `null`, che in ordine crescente viene **prima di ogni
data**, e tutte le attività senza scadenza sarebbero salite in cima. La lista ora
passa da un'aggregazione con un campo calcolato (`conScadenza`) che mette sotto le
attività datate e ordina solo dentro ciascun gruppo. I documenti tornano a essere
letti con `find` e `populate`, che non esistono sulle aggregazioni, e vengono
rimessi nell'ordine della paginazione.

### L'indirizzo del condominio si apre su Google Maps

Il condominio ha già un indirizzo obbligatorio, quindi le coordinate erano un
secondo dato da mantenere allineato a un primo che basta: quello che serve è un
link. `PaginaCondomini` manda l'indirizzo a una ricerca di Google Maps in una
scheda nuova.

Un pin salvato a mano avrebbe avuto un vantaggio solo apparente: la ricerca per
indirizzo risolve anche gli indirizzi che Google non conosce, mentre un pin
sbagliato resta sbagliato per sempre e nessuno se ne accorge.

### La verifica della bacheca non ripuliva le proprie attività

`Status` esegue davvero la richiesta e restituisce solo il codice di errore: il
controllo "senza colore il default è nessuno" creava un'attività e non ne
recuperava l'id, quindi **ogni esecuzione lasciava una riga in bacheca**. Al momento
in cui me ne sono accorto erano venticinque, e occupavano la lista come se fossero
lavoro vero.

Nella stessa verifica, `IndexOf` su un id assente restituisce `-1`, e `-1 < 3` è
vero: un controllo di ordinamento che non trova le attività che sta cercando passa
senza controllare niente. L'ho visto succedere per questo motivo, e il controllo
ora verifica prima che le quattro attività di prova siano in bacheca.

## 2026-10-04

### Le card del panorama portano alla sezione indicata

"Unità immobiliari", "Condòmini iscritti", "Assemblee aperte" e "Morosi del mese"
erano numeri su cui non si poteva cliccare. `Statistica` ora accetta una prop `a`:
se c'è, la card è un `<Link>` invece di un `<div>`, senza cambiarne l'aspetto.

Un link e non un `div` con `onClick`: sennò non si raggiunge da tastiera, non si
apre col tasto destro e non ha un destinatario da cui tornare indietro.

Il numero si vede **sempre**, anche a chi non ha il permesso della sezione: è un
dato aggregato e nasconderlo sarebbe togliere un'informazione che l'utente aveva.
Cambia solo la cliccabilità, perché un link verso una sezione vietata farebbe
prendere un 403.

Bug ripreso da `new_tasks.md`.

### Le card della bacheca hanno un colore e un'inclinazione

Il proprietario può scegliere un colore fra sei, che è un accento sul bordo
sinistro della card e non il fondo: se fosse il fondo, il testo dovrebbe essere
leggibile su tutti e sei e la scelta ricadrebbe di nuovo su chi la fa. I colori
non sono liberi, sono sei chiavi che il frontend mappa su token già esistenti in
`_tokens.scss`: un colore scelto a caso porterebbe colori fuori dal tema e in
stampa. `null` significa "nessun colore scelto" e si può togliere.

L'inclinazione è di due gradi, al massimo, ed è **derivata dall'id** e non tirata a
caso a ogni render: un `Math.random` qui farebbe saltare tutte le card a ogni
ricarica, e il difetto sarebbe più fastidioso dell'effetto. Dall'id è anche senza
migrazione e uguale su ogni dispositivo. Sotto il puntatore la card si raddrizza.
In stampa rotazione e ombre spariscono e la griglia passa a blocco: un foglio con
le card storte sembrerebbe un errore di stampa.

### La sezione si chiama Bacheca ed è raggiungibile dal panorama

Rinominata la sezione, la rotta (`/c/bacheca`) e la voce di navigazione, messa
prima in "Amministrazione". Il dominio e l'API restano su `attivita`: l'entità è
un'attività, la pagina è la bacheca che le contiene.

Dal panorama si arriva alla bacheca con una scorciatoia, ed è la prima voce che
non è filtrata per permesso: l'accesso dipende da chi ha ricevuto l'attività, non
da un ambito delegabile. Per questo la scorciatoia è filtrata per ruolo.

### Un pulsante senza margine nella bacheca

`riga-tra` da solo non è un flex: imposta solo `justify-content`, quindi titolo e
pulsante diventavano un blocco e un elemento inline, con il pulsante attaccato al
titolo. In tutto il resto del codice `riga-tra` è sempre preceduto da `riga`.

Bug ripreso da `bugs.md`, che ora non contiene più voci aperte.

### Il codice duplicato di un condominio rispondeva 500

Riusare il codice di un altro condominio violava l'indice univoco e arrivava al
client come `500 INTERNAL_ERROR`, con dentro lo stack di MongoDB. Il motivo è che
`E11000` è sollevato dal driver **sulla scrittura**: non si può impedire la
collisione con una verifica preventiva, perché due richieste contemporanee
passerebbero entrambe quel controllo.

Per questo la traduzione sta nel gestore errori e non in ogni controller: `11000`
diventa un `409` che nomina il campo e il valore, e vale per ogni indice univoco
dell'applicazione, anche per quelli che non si sono ancora toccati. Non si usa
`instanceof` sulla classe del driver, che cambia tra versioni: basta il codice
numerico, che è parte del protocollo.

Lo stack nella risposta era un falso allarme: `error.ts` lo espone solo quando
`config.isProd` è falso.

### Nel profilo un amministratore risultava "Proprietario"

`GET /auth/me` costruiva le posizioni non da un `Condomino` (l'amministratore non
ne ha uno) ma sul posto, con `regime: 'proprietario'` come segnalatore di
"posizione solo operativa". La UI leggeva quel valore e mostrava "Proprietario ·
unità " con un elenco vuoto: raccontava il contrario di quello che è.

Ora `regime` è `null` quando non c'è una posizione di proprietà, e accanto c'è un
campo `ruolo` che dice come l'utente sta in **quel** condominio:
`amministratore`, `assistente`, `servito`, `condomino` o `osservatore`. Il ruolo è
derivato dal confronto con `Condominio.amministratore` e non dal ruolo dell'utente,
perché un admin è amministratore in uno stabile e assistente in un altro.

È emerso anche che al superadmin tutto questo non tornava: vedendo ogni stabile
senza amministrarne nessuno, sarebbe caduto nel ramo "assistente", che è una
delega che non gli è mai stata data. Da qui `osservatore`.

Come effetto collaterale il selettore del condominio in testata non compare più
per un condòmino collegato a più di uno stabile: prima glielo offriva, e poteva
scegliere un condominio non suo.

### Margini mancanti

Segnalati in `bugs.md`: il messaggio "Nessuna voce: il totale è zero" era addossato
al bordo mentre le righe sopra avevano il padding, e i pulsanti a tutta larghezza
che seguono dei campi non avevano margine sopra. `.campo` è una colonna flex senza
`margin-bottom`, quindi il pulsante si incolla all'ultimo campo.

Il pulsante è risolto con una utility `.margine-sopra` invece che con stili
inline sparsi: non va abbinata a `pila-*`, che dà già il suo spazio con `gap`.

### Attività: la bacheca del team, lato UI

La bacheca è in `/c/attivita`, una card per attività in una griglia che su schermo
stretto scende a una colonna. Il filtro è per stato (da fare, completate, tutte)
più l'interruttore "solo quelle affidate a me", che per l'assistente è la vista
naturale.

Cliccando una card il contenuto della bacheca viene **sostituito** dal thread, che
è il comportamento richiesto: il ritorno è un cambiamento di stato e non una
navigazione, quindi non si perde il filtro con cui si era entrati.

Le card completate restano in bacheca con aspetto diverso (fondo verde, titolo
barrato) e spariscono solo su eliminazione esplicita. Una scadenza superata e non
ancora completata mette il bordo della card in rosso: è l'informazione che si cerca
guardando una bacheca.

Sul lato permessi la pagina è sotto `RichiediRuoli(['admin'])` e non sotto un
`RichiediPermesso`, per due ragioni. L'assistente deve arrivarci anche se non ha
`amministrazione:leggere` (l'assistente del seed ha solo `versamenti:*` e non
vedrebbe la pagina), e il superadmin è escluso perché il server gli risponde 403 su
queste rotte.

### Attività: la bacheca del team, lato API

Primo pezzo del dominio `attivita`, montato su `/staff/attivita`. È l'unico
router che non sta sotto `/condomini/:id`, perché l'attività non appartiene a uno
stabile: è un compito che l'amministratore affida ai propri assistenti.

Non c'è un ambito delegabile in `AMBITI` e quindi nessun guard di permesso:
l'accesso nasce dal documento ed è `attivita.service.ts` a stabilirlo. La
distinzione che i tre guard non possono esprimere è fra **chi possiede** e **chi
ha ricevuto**: il proprietario modifica ed elimina, l'assegnatario può solo
segnare "fatto", e nessun altro vedere l'attività.

Tre scelte che vale la pena ricordare.

**Il team è `User.delegatoDa`, non `Condominio.assistenti`.** Il primo campo dice
chi ho creato io, il secondo *dove* qualcuno può operare. Se il team dipendesse
dagli stabili, aggiungere un condominio all'amministratore cambierebbe la
bacheca da sola, e togliere un assistente da uno stabile gli toglierebbe i
compiti. `GET /staff/attivita/team` è stato separato per non far derivare la
scelta dei destinatari da `GET /staff/assistenti`, che legge l'altra fonte.

**"Non visibile" risponde 404 e non 403.** Un 403 confermerebbe a chi non deve
vederla che quell'attività esiste. Il 403 resta per chi la vede ma non può
agire: l'assistente che prova a eliminare riceve 403 con il motivo.

**Il thread è di un solo livello.** Un'attività che ha già un padre non può
diventare padre, altrimenti A → B → A e la risoluzione non termina. La cascata
delle proroghe dalle milestone ai padri è rimandata: propagare una data in su
richiede prevenzione dei cicli e un ordine di scritture, e le date prima si
stabilizzano.

Bug trovati scrivendo il dominio:

- `requireRole('admin')` non distingue l'amministratore dall'assistente, perché
  entrambi hanno `role: 'admin'`. Un assistente avrebbe potuto creare attività
  diventandone proprietario. La creazione ora è verificata su `delegatoDa`
  dell'utente corrente (`assicuraCreatore`), e se un assistente non può creare
  attività non ne è mai proprietario: i controlli "solo il proprietario" delle
  altre rotte escludono da soli ciò che non gli spetta.
- Il predicato di visibilità confrontava id, ma veniva applicato a documenti già
  popolati, dove `proprietario` è un oggetto e `String({})` vale
  `[object Object]`: la regola sarebbe passata sempre falsa. Ora il controller
  riduce il documento ai due id prima di passarlo al service, così la regola
  resta in un posto solo.

### I codici di errore erano invisibili alle verifiche lanciate con `pwsh`

Gli script di verifica estraggono il codice (`CONFLICT`, `FORBIDDEN`,
`BAD_REQUEST`) dal corpo dell'errore con il regex `"code":"(\w+)"`. Funzionava
sotto Windows PowerShell 5.1, dove `ErrorDetails.Message` è il corpo grezzo
compatto, ma non sotto PowerShell 7, dove è una stringa riformattata con spazi:
l'8/8 di `verifica-crud-bilanci.ps1` che si vedeva lanciandolo con `pwsh` non
era un difetto del bilanci.

Il regex ora accetta spazi opzionali e regge con entrambe le shell. La trappola è
documentata in `AGENTS.md`, perché il sintomo (falliscono solo i casi che
confrontano un codice di errore) non dice nulla sulla causa.

### Le conferme: una finestra invece di `window.confirm`

Le eliminazioni chiedevano conferma con `window.confirm`, che è bloccante e non
stilabile: su Android è una riga di testo grigia e non dice nulla su *cosa* sta
per succedere. Tre eliminazioni non chiedevano affatto conferma
(`PaginaIscritti`, `PaginaTeam`, `PaginaUnita`).

`useConferma` in `client/src/components/Conferma.tsx` sostituisce il dialog: la
chiamata resta lineare (`if (!(await chiedi({...}))) return;`) perché l'hook
restituisce una promise, quindi il flusso non si complica di `useState` sparsi
nelle pagine. Il pulsante è rosso e si chiama "Elimina" quando l'azione è
distruttiva, con il testo che dice cosa sparisce ("il verbale n. 4, già
approvato"), e non ci si passa con `Invio`: il focus parte
dall'annullamento. Le due conferme sul costo zero restano neutre, perché
stipulare un contratto gratuito non è una cancellazione.

Nota di composizione: dentro un dialog che è già un `.velo`, la conferma va
renderizzata **dopo** il dialog stesso. `velo` e `.scheda` sono entrambi
`position: fixed` con lo stesso `z-index`, quindi a parità di z-index vince
l'ultimo nell'ordine del DOM: una conferma renderizzata prima finirebbe sotto.
Le pagine che hanno una modale (`PaginaVerbali`, `PaginaContratti`,
`PaginaContrattoDettaglio`, `PaginaIscritti`, `PaginaTeam`, `PaginaUnita`)
hanno `{conferma}` come ultimo figlio del proprio `.velo`.

### Le notifiche in testa alla pagina

I toast comparivano in fondo, sopra la barra di navigazione: su mobile finivano
sopra il pollice e coprivano l'ultima riga di una tabella. Ora sono ancorati in
alto, subito sotto l'intestazione (`--header-h` + `--safe-top`), che è
`sticky`: restano leggibili senza passare sopra il titolo della pagina.

### Comunicazioni: il permesso di scrittura è davvero richiesto

`POST /`, `PATCH /:id`, `POST /:id/invia`, `POST /:id/risposte` e `DELETE /:id`
passavano solo per `controllaServizio`: un assistente delegato sui soli
versamenti poteva scrivere e cancellare comunicazioni ai condòmini.

Il permesso non può essere applicato come sulle altre rotte, perché la stessa
scrittura è legittima per due soggetti diversi: il condòmino scrive
all'amministratore (una `richiesta`, un `reclamo`, una `segnalazione`) e
l'amministratore scrive ai condòmini (un `avviso`, una `convocazione`).
`requirePermesso` avrebbe vietato al condòmino di scrivere, che è il diritto che
l'applicazione gli riconosce, e gli avrebbe lasciato leggere senza poter
rispondere. È nato quindi `requirePermessoOPartecipante`, che controlla solo il
lato amministrativo: il condòmino passa e resta vincolato dal filtro per utente
del controller. `POST /:id/letti` resta aperto a tutti perché è un'azione sul
proprio thread, non una scrittura.

Bug incontrato applicando il permesso: `/:id/letti` rispondeva 404 perché la
rotta era dichiarata sotto il percorso sbagliato. Inoltre il controller leggeva
`req.body.condominioId`, che in una rotta annidata non esiste mai: il
condominio viene da `req.params`, e senza quella correzione il permesso sarebbe
stato valutato sull'elenco sbagliato. La stessa verifica ha mostrato che il
superadmin restava fuori dalle comunicazioni dei condomini che amministra: ora
gli avvisi e le convocazioni li può emettere anche lui.

### Il superadmin non è più escluso dai condomini altrui

`requireCondominioAccess` filtrava per proprietario anche il superadmin, che non
è titolare di nessun stabilo: riceveva 403 su ogni condominio anche se
esistente. Ora per il superadmin basta che lo stabile ci sia, e l'assenza è un
404 vero. Su tutte le altre rotte i filtri per proprietario restano, perché
l'amministratore deve vedere solo i suoi condomini.

### `permessi: null` non è più irreversibile

`aggiornaAmministratoreSchema` accettava solo un elenco di permessi: un amministratore
delegato sui versamenti non poteva più tornare ad accesso pieno, perché non
esisteva il modo di mandare "nessun elenco". Con `null` il controller riporta
l'accesso pieno, che è il significato che il modello dà già a quel valore.

### Il messaggio sulla tabella millesimale non prometteva una tabella inesistente

Il Panorama diceva "La tabella millesimale è valida: la somma dei millesimi di
diritto fa (revisione 0)" in un condominio senza quote. `buildTabella` costruisce
`totale` iterando le quote salvate, quindi senza revisione `totale` è `{}`,
`totaleDiritto` è `undefined` e la chiave sparisce dal JSON; e `valida` diceva
`problemi.length === 0`, che con zero ripartizioni attive è vero. Il messaggio
dichiarava valida una tabella che non esiste.

Ora una tabella senza quote è `valida: false` con lo scarto di 1000 sulla
ripartizione di diritto, il riepilogo espone `ripartizioniAttive` e `problemi`, e
la UI distingue i tre casi: nessuna quota definita, tabella valida con il totale,
scarto da correggere con l'elenco delle ripartizioni. `totaleDiritto` è `0` e non
più `undefined`.

### Operazioni CRUD assenti nella UI

L'API esponeva il CRUD completo di ogni dominio, la UI solo una parte. Aggiunti:

- **condomini**: modifica e cancellazione, con l'errore del server mostrato
  com'è quando la guardia nomina la dipendenza che blocca;
- **verbali**: approvazione, revoca ed eliminazione. Un verbale approvato diventa
  in sola lettura, come vuole il 409 del server;
- **versamenti**: modifica ed eliminazione. Unità e periodo sono mostrati come
  immutabili perché lo sono: il PATCH li ignora e il totale non li riconta;
- **assemblee**: modifica, cambio stato, ricalcolo dei millesimi ed eliminazione.
  Gli stati che il server accetterebbe arrivano nella risposta
  (`transizioniConsentite`), così il selettore non replica la regola delle
  transizioni e non offre mosse che il backend rifiuterebbe;
- **bilanci**: creazione del preventivo, approvazione e revoca, modifica di
  descrizione e note, eliminazione. Anno e tipo non sono editabili: sono la chiave
  del documento.

### `POST /bilanci` non sovrascrive più un bilancio esistente

Se la stessa coppia `anno + tipo` arrivava due volte, il controller sostituiva le
voci con quelle nuove e rispondeva 200: un doppio invio, o un form che riprova,
azzerava le voci registrate. Ora la seconda creazione è un 409 che nomina
l'anno e il tipo. Le voci si correggono una alla volta con le rotte `/voci`, che
esistono già.

### La pagina dei bilanci descriveva il consuntivo al contrario

La descrizione diceva "consuntivo dell'anno che lo precede", ma il modello è
un altro: `creaConsuntivo` copia il preventivo **dello stesso anno**
(`anno: preventivo.anno`), quindi preventivo e consuntivo 2025 convivono ed è
giusto, perché il consuntivo confronta il realizzato con il previsto di quell'anno.
Con quel testo l'utente cercava il consuntivo 2026 tra i documenti del 2025 e non
lo trovava.

Con la verifica è emerso anche che il "non si può rinnovare un consuntivo chiuso"
non era un blocco: `POST /:id/approva` con `approvato: false` revoca senza
guardie, quindi revoca → elimina → genera è percorribile e quei pulsanti sono in
UI. Resta un problema vero, diverso: il selettore offre solo `anno -2 … anno +1`.

### Costo zero nei contratti, con conferma esplicita

`creaContrattoSchema` accetta `costo: 0` e i due contratti in produzione hanno
`costo: 0`: lo zero è ammesso di proposito. Il form accettava però `min={0}` e
mandava `Number('')` = 0 senza dire nulla, così una stipula a zero passava
come qualunque altra. Ora, sia in creazione sia nel passaggio a zero in
modifica, la UI chiede conferma e dice che le rate future saranno a zero fino a
una proroga.

### Test automatici sulla logica dei permessi

`npm test` eseguiva `npm run test --workspace server` che non esisteva: la root
prometteva una suite che non c'era. Ora `server/src/tests/permessi.test.ts`
copre `haPermesso`, `puoEseguire` e i guard dei permessi, 30 casi senza database:
i guard dei permessi dipendono solo da `req.user`, e `requireCondominioAccess` è
verificato sostituendo i metodi `exists` dei modelli.

I casi coprono le implicazioni che un refactoring romperebbe in silenzio:
`scrivere` implica `leggere` e non viceversa, `null` è accesso pieno e `[]` no,
`assemblee` non concede `verbali`, un condòmino non amministrerebbe nemmeno con
un elenco di permessi compilato, e l'esistenza del condominio per il superadmin
è un 404 e non un 403.

`tsconfig.build.json` esclude `src/tests` dalla build: `typecheck` continua a
controllare i test, `dist` non li contiene più.

### Verifiche automatiche degli ambiti

`npm run verifica` esegue in sequenza sette script e riporta il totale: 90
controlli. Ogni script è un test di percorso completo contro l'API in esecuzione,
copre anche i casi negativi (403 del condòmino, 409 della transizione illegale,
409 della creazione duplicata) ed è pensato per essere esteso nello stesso
intervento che tocca i permessi.

Aggiunti `verifica-crud-assemblee.ps1`, `verifica-crud-bilanci.ps1` e
`verifica-millesimi.ps1`. Il primo ha scoperto che la risposta del dettaglio
assemblea non portava le transizioni consentite, che è il dato di cui il
selettore dello stato ha bisogno.

Un condominio creato da una verifica interrotta resta bloccato per sempre: le
API rifiutano di eliminare un'unità che ha quote in vigore e contano anche le
unità disattivate. `npm run purge:condominio -- <id>` rimuove condominio, unità e
quote per gli scenari di test locale.

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
