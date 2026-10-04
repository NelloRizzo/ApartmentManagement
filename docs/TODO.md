# Idee da fare

Solo cose **da realizzare**, ordinate per urgenza. Quello che è già stato fatto,
con le ragioni delle scelte, sta in `CHANGELOG.md`.

## Come si usa

- **Il proprietario** aggiunge un'idea in fondo, con l'urgenza che ritiene
  giusta. Non serve che sia chiara né giusta: serve che sia là.
- **L'agente**, prima di proporre un intervento, legge questo file e controlla se
  riguarda ciò che sta per toccare. Se sì, chiede quale dei punti aperti
  affrontare, invece di indovinare l'ordine.
- **Quando un punto è realizzato** va in `CHANGELOG.md`, non qui: qui dentro
  rimane solo ciò che manca.

Urgenza: **Alta** = blocca il lavoro o è un buco di sicurezza; **Media** =
funzionalità che si nota mancante; **Bassa** = rifinitura.

---

## Alta

### Le scritture delle comunicazioni non chiedono il permesso

`POST /`, `PATCH /:id`, `POST /:id/invia`, `POST /:id/risposte` e `DELETE /:id` in
`comunicazione.routes.ts` passano solo per `controllaServizio`: manca
`requirePermesso('comunicazioni:scrivere')`, che le letture hanno già nella
forma di `requirePermessoLettura`. Un assistente delegato che può solo registrare
versamenti può quindi scrivere e cancellare comunicazioni ai condòmini.

### Delega per condominio: compiti distribuiti

Oggi un assistente ha un elenco di permessi unico per tutti i condomìni
(`User.permessi`) e l'elenco dei condomìni in `Condominio.assistenti`: non si può
dire "su questo stabile tutto, su quello solo i versamenti".

Serve una delega per condominio, con tre casi: tutti i condomìni dell'amministratore
(anche quelli futuri), un elenco preciso, o nessuno. Da decidere se una persona
può avere più elenchi diversi: con il modello attuale `permessi: null` vuol dire
accesso pieno, quindi "pieno qui e limitato lì" non è esprimibile. Il punto di
riferimento sono `requirePermesso` e `requirePermessoLettura` in
`middleware/auth.ts`, che già ricevono `req.params.condominioId` e possono
quindi risolvere il giusto elenco.

### Associazioni modificabili

Le unità già a database devono poter essere riassociate a un condominio diverso,
così un immobile esistente non resta inutilizzabile. Da decidere cosa ostacola
lo spostamento: i millesimi assegnati (spostarli cambierebbe la somma di due
tabelle), gli iscritti collegati, i versamenti registrati. Serve anche decidere se
lo spostamento vale solo per le unità o anche per iscritti, assemblee e bilanci.

## Media

### Privacy policy per ruolo

Serve un'informativa distinta per chi usa l'applicazione, perché il titolare del
trattamento cambia:

- **condòmini**: il titolare è l'amministratore di condominio, che tratta i dati
  delle unità e delle quote per conto del condominio; Gestione Condomini agisce
  da responsabile del trattamento. Dati raccolti, finalità, base giuridica,
  conservazione, diritti dell'interessato e come esercitarli.
- **amministratori di condominio**: il titolare è l'amministratore di
  piattaforma, che tratta i dati del team e degli amministratori. Da valutare
  anche l'informativa per l'amministratore di piattaforma.
- Da decidere: firma del consenso o presa visione, se serve un registro dei
  consensi, e dove pubblicarla (in app, sul sito, entrambi).

### Operazioni CRUD mancanti nella UI

L'API espone il CRUD completo di ogni dominio, la UI solo una parte:

- **condomini**: mancano modifica e cancellazione (`PATCH` e `DELETE` esistono);
- **assemblee**: mancano modifica, cancellazione, cambio stato e ricalcolo
  millesimi;
- **verbali**: mancano approvazione e cancellazione;
- **bilanci**: mancano creazione, modifica, cancellazione e approvazione (esiste
  solo la gestione delle voci e il consuntivo);
- **versamenti**: mancano modifica e cancellazione;
- **comunicazioni**: mancano modifica e cancellazione.

### Un contratto può essere stipulato con costo zero

`creaContrattoSchema` accetta `costo: 0` e il form ha `min={0}`: svuotando il
campo, `Number('')` manda 0 e la richiesta passa. In produzione i due contratti
esistenti hanno `costo: 0` e una rata da 0. Serve una decisione: rifiutare lo
zero, o distinguerlo da un campo vuoto.

## Bassa

### Storico delle revisioni della tabella millesimali

`GET /tabella-millesimi/revisioni` esiste e non è mostrato da nessuna parte.

### Allineare il nome nelle email

Oggetto e firma dei modelli email dicono ancora "Steward", mentre la UI dice
"Gestione Condomini".

### Tenere allineati blueprint e pannello Render

`BREVO_API_KEY`, `BREVO_MITTENTE_EMAIL` e `MONGODB_URI` sono `sync: false`: il
blueprint non le valorizza e il pannello le tiene. Ogni modifica futura va
annunciata da qualche parte, altrimenti si perde il sincronismo e ci si
ritrova con un mittente sbagliato in produzione.