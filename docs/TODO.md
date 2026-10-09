# Idee da fare

_Le voci di primo livello sono numerate e la numerazione è continua: per parlarne
basta il numero. Una voce realizzata si cancella e la sua ragione va nel
`CHANGELOG.md`, come per i bug in `bugs.md`. L'unica eccezione è
`IMPLEMENTAZIONI FUTURE`, le cui voci non si numerano._

PRIORITA BASSA
- 4. Storico delle quote millesimali non consultabile
  - **il testo non promette più niente**: la pagina dice che la revisione precedente "resta conservata", che è vero. Prima diceva "consultabile nello storico" e non lo era
  - la conservazione c'è: `nuovaRevisione` chiude la revisione precedente con `validTo` e inserisce la nuova con `revisione + 1`, e la tabella attiva si ottiene filtrando per revisione corrente
  - manca solo la parte che mostra le revisioni chiuse, cioè la consultabilità
  - va deciso cosa mostrare: la tabella completa di ogni revisione, o solo le variazioni rispetto alla precedente. La seconda è più utile per capire chi ha cambiato che cosa, e costa di più

IMPLEMENTAZIONI FUTURE
_(voci rimandate e idee messe da parte, da riprendere quando si ha tempo: in
questa sezione le voci non si numerano, per parlarne basta il titolo)_
- Guida in pdf (download da dashboard) per l'utilizzo per l'amministratore di condominio e per un utente condòmino
- Privacy policy per ruolo
  - serve un'informativa distinta per chi usa l'applicazione, perché il titolare del trattamento cambia
  - condòmini: il titolare è l'amministratore di condominio, che tratta i dati delle unità e delle quote per conto del condominio; Gestione Condomini agisce da responsabile del trattamento
  - amministratori di condominio: il titolare è l'amministratore di piattaforma, che tratta i dati del team e degli amministratori
  - da decidere: firma del consenso o presa visione, se serve un registro dei consensi, e dove pubblicarla
  - l'esportazione dei dati propri non è esposta: `mieDati` in `comunicazione.controller.ts` raccoglie comunicazioni, legami e registro operazioni di un utente ma nessuna rotta la chiama, quindi oggi l'interessato non può scaricarli
- Test automatici sulla logica delle quote e del verbale
  - `npm test` copre oggi solo i permessi, che sono l'area a rischio più alto
  - `quoteVersamenti.service.ts` (riparto del residuo sui centesimi, nuda proprietà, regime) e `verbale.service.ts` (quorum ordinaria e straordinaria, millesimi rappresentati, delibere con segnaposto) sono la seconda area a rischio alto e non hanno test
  - `scripts/verifica-bilancio.ps1` e `verifica-crud-verbali.ps1` coprono il percorso via API, ma non i casi limite del calcolo
- Tradurre in inglese tutto il codice che non è interfaccia
  - identificatori, modelli, strutture dati, variabili, nomi di funzione, nomi dei file, backend e frontend; nell'interfaccia restano in inglese solo i nomi delle rotte
  - i messaggi di errore inviati dal server restano in italiano
