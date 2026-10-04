# Idee da fare

PRIORITA ALTA
- Campi sconosciuti scartati in silenzio
  - Zod rimuove le chiavi non dichiarate: un `PATCH /versamenti/:id` con `unita` o `periodo` risponde 200 e lascia i valori come erano
  - l'interfaccia mostra già quei due campi come immutabili, quindi non è un bug visibile; resta però una risposta che sembra aver applicato la modifica
  - da decidere: schema `strict` come su `PATCH /contratti/:id`, oppure `passthrough` con un avviso
- Associazioni modificabili ⏸ rimandato
  - le unità già a database devono poter essere riassociate a un condominio diverso, oggi `condominio` è immutabile
  - decidere cosa ostacola lo spostamento: i millesimi assegnati cambierebbero la somma di due tabelle, gli iscritti collegati, i versamenti registrati
  - se lo spostamento è consentito va fatto in una transazione e con il ricalcolo delle due tabelle, altrimenti il vincolo "sommano 1000" si rompe in silenzio
- Delega per condominio: compiti distribuiti ⏸ rimandato
  - oggi un assistente ha un elenco di permessi unico per tutti i condomìni (`User.permessi`) più l'elenco in `Condominio.assistenti`: non si può dire "su questo stabile tutto, su quello solo i versamenti"
  - "pieno qui e limitato lì" non è esprimibile: `permessi: null` significa accesso pieno, quindi servono elenchi multipli o togliere il `null` e trattare "tutti i permessi" come elenco completo
  - `requirePermesso` e `requirePermessoLettura` ricevono già `req.params.condominioId` e possono risolvere l'elenco giusto, ma ogni rotta sotto `/condomini/:condominioId` va controllata una per una

PRIORITA MEDIA
- Test automatici sulla logica delle quote e del verbale
  - `npm test` copre oggi solo i permessi, che sono l'area a rischio più alto
  - `quoteVersamenti.service.ts` (riparto del residuo sui centesimi, nuda proprietà, regime) e `verbale.service.ts` (quorum ordinaria e straordinaria, millesimi rappresentati, delibere con segnaposto) sono la seconda area a rischio alto e non hanno test
  - `scripts/verifica-bilancio.ps1` e `verifica-crud-verbali.ps1` coprono il percorso via API, ma non i casi limite del calcolo
- Gestione del consuntivo per anno nella UI
  - il problema reale è il selettore degli anni: offre solo `anno -2 … anno +1`, quindi un condominio con bilanici più vecchi non li raggiunge
  - la pagina descriveva il consuntivo come "dell'anno che lo precede", ma il modello è preventivo e consuntivo **dello stesso anno** (`creaConsuntivo` copia `anno: preventivo.anno`): la frase era semplicemente sbagliata ed è stata corretta
  - rifare un anno è possibile in tre passi (revoca approvazione → elimina → genera), non è un blocco: è una mancanza di indicazione nella UI
- Privacy policy per ruolo ⏸ rimandato
  - serve un'informativa distinta per chi usa l'applicazione, perché il titolare del trattamento cambia
  - condòmini: il titolare è l'amministratore di condominio, che tratta i dati delle unità e delle quote per conto del condominio; Gestione Condomini agisce da responsabile del trattamento
  - amministratori di condominio: il titolare è l'amministratore di piattaforma, che tratta i dati del team e degli amministratori
  - da decidere: firma del consenso o presa visione, se serve un registro dei consensi, e dove pubblicarla
  - l'esportazione dei dati propri non è esposta: `mieDati` in `comunicazione.controller.ts` raccoglie comunicazioni, legami e registro operazioni di un utente ma nessuna rotta la chiama, quindi oggi l'interessato non può scaricarli

PRIORITA BASSA
- alle diverse voci di bilancio, delle assemblee, dei verbali e ai messaggi deve essere possibile allegare dei documenti: ogni documento ha un "oggetto" (obbligatorio), una "descrizione" (facoltativa), una "fonte" (facoltativa), un riferimento (facoltativo), e ovviamente un contenuto (in byte) oltre che un formato (mimetype). gli allegati saranno salvati nel database (upload in campi blob)
- Attività: bacheca del team amministrativo
  - Il dominio si chiama **attività**, non "todo": `TODO.md` è la lista delle cose da fare di chi scrive il codice, e con due "todo" in giro tra sei mesi non si saprebbe di quale si sta parlando
  - Va su `/staff/attivita`, l'unico perimetro fuori da `/condomini/:id`, perché l'attività è del team e non di uno stabile. Lì il team esiste già: `User.delegatoDa` lega ogni assistente a chi l'ha delegato e `requireRole('admin')` ne governa la creazione
  - Destinatari: più assistenti contemporaneamente, al limite tutti quelli del team. **Elenco id esplicito**, mai "elenco vuoto significa tutti": è la trappola di `permessi: null`, dove `null` è pieno e `[]` è vuoto
  - Chi può fare cosa: solo il proprietario cancella, l'assegnatario può solo marcare "fatto". È un'asimmetria **sul documento**, non sul ruolo, quindi nessuno dei tre guard la esprime: il controllo va nel service (`se il proprietario non sono io, no`)
  - **Non serve un ambito in `AMBITI`**: l'accesso nasce dalla relazione di assegnazione, non da un permesso. La bacheca la vede l'amministratore delegante, perché il team è il suo; l'assistente vede solo le attività a lui assegnate
  - I completati restano visibili con aspetto diverso e spariscono solo su eliminazione esplicita
  - Thread: ogni attività può generare un thread con altre voci dello stesso tipo. Essendo `parent` su se stesso, serve un controllo di profondità per non costruire un ciclo
  - Ogni attività ha data di inizio e data di fine
  - Bacheca a card: cliccando la card il contenuto della bacheca viene sostituito dal thread
  - Un'attività in un thread può essere **milestone**: il figlio ha le proprie date, il padre le vede ma non le governa
  - Cascata delle proroghe ⏸ rimandata
    - la proroga di una milestone deve prorogare anche l'attività di livello superiore, in cascata
    - in v1 non esiste, e va bene: le date prima si stabilizzano, poi si propaga. Quando si farà, serviranno prevenzione dei cicli, ordine delle scritture definito e comportamento deciso quando un figlio viene eliminato o spostato sotto un altro padre