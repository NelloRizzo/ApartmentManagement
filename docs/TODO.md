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
- Delegare un assistente a un solo condominio
  - oggi la delega è tutto o niente: `creaAssistente` fa `Condominio.updateMany({ amministratore: delegante }, { $addToSet: { assistenti } })`, quindi l'assistente entra in **tutti** gli stabili dell'amministratore in un colpo solo, e `revocaAssistente` lo esce da tutti
  - non è un'incoerenza fra `User.delegatoDa` e `Condominio.assistenti`: i due campi si muovono insieme nello stesso codice e non possono divergere. È una scelta, non un difetto
  - se si vuole la delega per stabile servono due schermate: scegliere i condomini in creazione, e toglierne qualcuno senza revocare tutto
  - l'aggiunta di un assistente a un condominio **non** passa da `PATCH /condomini/:id`: gli unici scrittori di `Condominio.assistenti` sono la creazione e la revoca della delega
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
- Lo storico delle quote millesimali non è consultabile, ma il messaggio lo promette
  - la pagina della tabella dice "Salvando, la revisione precedente resta consultabile nello storico", e non c'è nessuno storico: segnalato in `bugs.md`
  - intanto il testo va cambiato, perché un messaggio che promette uno storico che non c'è è peggio di uno che non lo nomina
  - i dati ci sono già: `QuotaMillesimale` ha `revisione`, `validFrom` e `validTo`, e la tabella attiva si ottiene filtrando per revisione corrente. Manca solo la parte che mostra le revisioni chiuse
  - va deciso cosa mostrare: la tabella completa di ogni revisione, o solo le variazioni rispetto alla precedente. La seconda è più utile per capire chi ha cambiato che cosa, e costa di più
- Cascata delle proroghe fra attività ⏸ rimandato
  - la proroga di una milestone deve prorogare anche l'attività di livello superiore, in cascata: oggi ogni attività ha le sue date e il padre le vede senza governarle
  - va fatto quando le date sono stabili, e richiede prevenzione dei cicli, ordine delle scritture definito e comportamento deciso quando una voce viene eliminata o spostata sotto un altro padre
  - la bacheca è in `/c/attivita`, le regole in `docs/AGENTS.md` sotto "Bacheca delle attività"
- Scadenze in bacheca: sezione delle scadute e filtro per periodo
  - le attività con `dataFine` passata e non ancora fatte vanno in un gruppo in cima alla bacheca, distinguibile dalle altre, con il conteggio: oggi l'ordinamento le mette già prime ma senza separarle da quelle che scadono oggi
  - e serve un filtro per periodo ("in scadenza questa settimana"), che oggi non c'è: si filtra solo per stato (da fare, completate, tutte)
  - il gruppo delle scadute non può stare nel server senza una seconda query: la paginazione taglia a `limit`, quindi se le scadute sono più di una pagina le altre restano fuori dal gruppo. Va deciso se accettare il gruppo solo a pagina 1 o se rispondere con un envelope dedicato
  - il colore di una scadenza va **derivato**, non memorizzato: una card "scaduta" memorizzata resterebbe rosso domani. E se l'attività ha già un colore scelto dal proprietario, il rosso non deve sostituirlo: meglio un badge, perché `colore` è un accento e non uno sfondo (vedi `docs/AGENTS.md`)