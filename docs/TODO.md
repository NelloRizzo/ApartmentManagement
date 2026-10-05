# Idee da fare

_Le voci di primo livello sono numerate e la numerazione è continua: per parlarne
basta il numero._

PRIORITA MEDIA
- 1. Privacy policy per ruolo ⏸ rimandato
  - serve un'informativa distinta per chi usa l'applicazione, perché il titolare del trattamento cambia
  - condòmini: il titolare è l'amministratore di condominio, che tratta i dati delle unità e delle quote per conto del condominio; Gestione Condomini agisce da responsabile del trattamento
  - amministratori di condominio: il titolare è l'amministratore di piattaforma, che tratta i dati del team e degli amministratori
  - da decidere: firma del consenso o presa visione, se serve un registro dei consensi, e dove pubblicarla
  - l'esportazione dei dati propri non è esposta: `mieDati` in `comunicazione.controller.ts` raccoglie comunicazioni, legami e registro operazioni di un utente ma nessuna rotta la chiama, quindi oggi l'interessato non può scaricarli

PRIORITA BASSA
- 2. Campi sconosciuti scartati in silenzio
  - Zod rimuove le chiavi non dichiarate: un `PATCH /versamenti/:id` con `unita` o `periodo` risponde 200 e lascia i valori come erano, verificato
  - l'interfaccia mostra già quei due campi come immutabili, quindi non è un bug visibile; resta però una risposta che sembra aver applicato la modifica
  - **non fare una passata su tutti i domini**: aggiungere `strict` allo schema quando un dominio dà fastidio, non prima. I condomini sono già `strict` in creazione e modifica
  - `strict()` compare 3 volte su circa una decina di schemi di modifica; `versamentoUpdateSchema` e `bilancioUpdateSchema` usano `.omit()` e sono i candidati più probabili
- 3. Test automatici sulla logica delle quote e del verbale ⏸ rimandato
  - `npm test` copre oggi solo i permessi, che sono l'area a rischio più alto
  - `quoteVersamenti.service.ts` (riparto del residuo sui centesimi, nuda proprietà, regime) e `verbale.service.ts` (quorum ordinaria e straordinaria, millesimi rappresentati, delibere con segnaposto) sono la seconda area a rischio alto e non hanno test
  - `scripts/verifica-bilancio.ps1` e `verifica-crud-verbali.ps1` coprono il percorso via API, ma non i casi limite del calcolo
- 4. Storico delle quote millesimali non consultabile
  - **il testo non promette più niente**: la pagina dice che la revisione precedente "resta conservata", che è vero. Prima diceva "consultabile nello storico" e non lo era
  - la conservazione c'è: `nuovaRevisione` chiude la revisione precedente con `validTo` e inserisce la nuova con `revisione + 1`, e la tabella attiva si ottiene filtrando per revisione corrente
  - manca solo la parte che mostra le revisioni chiuse, cioè la consultabilità
  - va deciso cosa mostrare: la tabella completa di ogni revisione, o solo le variazioni rispetto alla precedente. La seconda è più utile per capire chi ha cambiato che cosa, e costa di più
