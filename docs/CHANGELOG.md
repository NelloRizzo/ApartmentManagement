# Registro delle modifiche

Cosa è cambiato e **perché**. Le cose ancora da fare stanno in `TODO.md`.

## 2026-10-05

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
