# Idee da fare

Qui finisce tutto quello che viene in mente ma non è ancora stato deciso. Il
proprietario del repository annota le idee, gli agenti le leggono prima di
proporre un intervento.

## Come si usa

- **Il proprietario** aggiunge un'idea in fondo, una riga o due, quando gli
  viene in mente. Non serve che sia chiara né giusta: serve che sia là.
- **L'agente**, all'inizio di un intervento, legge questo file e controlla se
  qualcosa riguarda ciò che sta per toccare. Se sì, chiede quale delle idee
  fare e con quale priorità, invece di indovinare.
- **Quando un'idea è stata realizzata**, si sposta in "Realizzate" con
  l'impegno che la riguarda, così non viene riproposta.

Le idee non sono ordinate per priorità: la priorità la dà il proprietario al
momento. L'ordine delle sezioni è quello in cui sono state annotate.

## Idee

### Privacy policy per ruolo

Serve un'informativa privacy distinta per chi usa l'applicazione, perché il
titolare del trattamento cambia a seconda del ruolo:

- **condòmini**: il titolare è l'amministratore di condominio, che tratta i
  dati delle unità e delle quote per conto del condominio; Gestione Condomini
  agisce da responsabile del trattamento. Informativa su dati raccolti
  (nome, contatti, quote, presenze, verbali), finalità, base giuridica,
  conservazione, diritti dell'interessato e come esercitarli.
- **amministratori di condominio**: il titolare è l'amministratore di
  piattaforma, che tratta i dati del team e degli amministratori. Da valutare
  anche l'informativa per l'amministratore di piattaforma stesso.
- Le due informative vanno pubblicate in app (pagina o PDF) e accettate al primo
  accesso, con data di versione. Da decidere: firma del consenso o semplice
  presa visione, e se serve un registro dei consensi.

Da decidere anche dove pubblicarla: dentro l'applicazione, sul sito, o entrambi.

### Operazioni CRUD mancanti nella UI

L'API espone il CRUD completo di ogni dominio, ma la UI copre solo una parte.
Da completare, in ordine di impatto:

- **condomini**: mancano modifica e cancellazione (esistono `PATCH /condomini/:id`
  e `DELETE /condomini/:id`).
- **assemblee**: mancano modifica, cancellazione e cambio stato
  (`PATCH /:id`, `DELETE /:id`, `POST /:id/stato`). Manca anche
  `POST /:id/millesimi/ricalcola`.
- **verbali**: mancano approvazione (`POST /:id/approva`) e cancellazione.
- **bilanci**: manca la creazione del bilancio (`POST /bilanci`), la modifica
  (`PATCH /bilanci/:id`), la cancellazione e l'approvazione. Esiste solo la
  gestione delle voci e il consuntivo.
- **versamenti**: mancano modifica e cancellazione.
- **comunicazioni**: mancano modifica e cancellazione.
- **tabella millesimali**: non viene mostrato lo storico delle revisioni
  (`GET /tabella-millesimi/revisioni`), che l'API espone.

### Permessi

- Le rotte di scrittura delle comunicazioni non chiedono
  `comunicazioni:scrivere`: `POST`, `PATCH`, `POST /:id/invia`, `POST /:id/risposte`
  e `DELETE` passano solo per `controllaServizio`. Un assistente delegato che
  può solo registrare versamenti può quindi scrivere e cancellare comunicazioni.
  Le letture usano già `requirePermessoLettura`.
- Verificare che ogni altra rotta di scrittura chieda il permesso di ambito
  corrispondente: è già così per unita, iscritti, tabella, assemblee, verbali,
  bilanci, versamenti e amministrazione.

### Altro

- Le email contengono ancora il nome "Steward" (oggetto e firma), mentre la UI
  dice "Gestione Condomini": decidere se allineare anche i modelli email.
- Il mittente delle email è cambiato in `render.yaml`, ma su Render va impostato
  a mano: ogni modifica futura va annotata da qualche parte, altrimenti si
  perde il sincronismo tra blueprint e pannello.

## Realizzate

- 2026-10-03: pulizia del database di produzione con ricreazione del
  superadmin, `npm run reset:produzione` (`docs/reset-produzione.md`).
- 2026-10-03: pagina "I miei condomini" con creazione del condominio, che
  prima non aveva una schermata: senza, un amministratore nuovo non poteva
  creare lo stabile e quindi neppure le unità immobiliari.
- 2026-10-03: cambio password nella pagina profilo (l'API esisteva già da
  tempo, non era raggiungibile dalla UI).
- 2026-10-03: titolo dell'applicazione cambiato da "Steward" a
  "Gestione Condomini".
- 2026-10-03: la capacità contrattuale è contata in condomìni (`condominiMassimi`)
  invece che in unità immobiliari, e si consuma sulla creazione del condominio.
  I contratti esistenti si spostano con `npm run migra:contratti`.
- 2026-10-03: il superadmin può modificare costo, periodicità, mesi di proroga,
  rinnovo automatico, capacità e note di un contratto (`PATCH /contratti/:id`).
  Ogni modifica finisce nello storico con il valore precedente, e le voci
  mostrano anche chi ha operato.
