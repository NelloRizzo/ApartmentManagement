# Idee da fare

_Le voci di primo livello sono numerate e la numerazione è continua: per parlarne
basta il numero. Una voce realizzata si cancella e la sua ragione va nel
`CHANGELOG.md`, come per i bug in `bugs.md`._

PRIORITA ALTA
_(voci spostate da `bugs.md`, la coda dei difetti trovati navigando: qui non si
più persa, ma non le abbiamo ancora risolte)_
- 7. In convocazione i condòmini vedono il testo della delibera
  - un'assemblea convocata non dovrebbe mostrare ai condòmini il testo di una delibera, visto che la delibera non è stata ancora approvata in stato "Convocazione"
  - in uno stato diverso, "In corso" o "Conclusa" la delibera può essere presentata
- 8. Caratteri strani prima del titolo degli allegati
  - controllare i titoli degli allegati, perché in un caso compaiono caratteri strani prima del titolo
  - non è stato determinato in quale pagina né su quale file
- 9. Etichetta del punto collegato a un bilancio da rivedere
  - verificare se ha senso l'etichetta "Punto collegato a un bilancio: gli importi indicati con «€ …» saranno sostituiti dalle cifre definitive del documento quando il verbale viene generato."
  - il funzionamento è quello: `{totale}` e `{totaleMensile}` vengono risolti in `deliberaRisolta` alla generazione, quindi è la formulazione a essere da valutare
- 11. `verifica-allegati` sezione 12 manda i campi sbagliati
  - quando non trova una bozza con un punto all'ordine del giorno e ne crea una, manda `dataInizio` invece di `data` e non manda `luogo`, quindi il server risponde 400 con "Invalid date" e "Required"
  - fallisce solo subito dopo un seed, quando l'unica assemblea esistente è conclusa

PRIORITA MEDIA
- 1. Privacy policy per ruolo ⏸ rimandato
  - serve un'informativa distinta per chi usa l'applicazione, perché il titolare del trattamento cambia
  - condòmini: il titolare è l'amministratore di condominio, che tratta i dati delle unità e delle quote per conto del condominio; Gestione Condomini agisce da responsabile del trattamento
  - amministratori di condominio: il titolare è l'amministratore di piattaforma, che tratta i dati del team e degli amministratori
  - da decidere: firma del consenso o presa visione, se serve un registro dei consensi, e dove pubblicarla
  - l'esportazione dei dati propri non è esposta: `mieDati` in `comunicazione.controller.ts` raccoglie comunicazioni, legami e registro operazioni di un utente ma nessuna rotta la chiama, quindi oggi l'interessato non può scaricarli
- 5. Script di emergenza per la password del superadmin in produzione
  - oggi l'unica via per rientrare è `npm run reset:produzione`, che **azzera il database**: perdere la password dell'unico superadmin significa perdere condomini, unità, quote, verbali, bilanci, contratti, comunicazioni e anche il registro delle operazioni
  - il buco resta aperto anche dopo il reset degli amministratori: `POST /staff/amministratori/:id/reimposta-password` è riservato al superadmin e sul proprio account risponde 400, e non esiste un recupero self-service
  - **cosa deve fare**: cambiare **solo** la password del superadmin indicato, senza toccare il resto, con le stesse difese di `reset-produzione.ts`: `MONGODB_URI_PRODUZIONE` e non `MONGODB_URI`, `localhost` rifiutato, `--yes` obbligatorio
  - **deciso: la password arriva solo dal primo parametro o da `SUPERADMIN_PASSWORD`**. Non va generata e inviata per email: se la casella è persa l'email non arriva, e il caso che giustifica lo script è proprio quello. `SUPERADMIN_PASSWORD` serve perché su Windows `npm run` tronca gli argomenti con `&`, `|`, `<`, `>`, `^` e `"` passando da `cmd.exe`
  - **da decidere: quale account**. Con un solo superadmin basta `config.seed.superadminEmail`; se in produzione ce ne fossero più serve `--email` esplicito. Cambiare la password sbagliata è l'errore che questo script non deve permettere, quindi il default silenzioso va valutato con criterio
  - **da decidere: come verificarlo**, perché rifiuta `localhost` e in locale non si può esercitare. La via che resta è lanciarlo nella rete di compose, dove il Mongo si chiama `mongo`: la guardia passa e il colpo arriva sul database di sviluppo
  - `tokenVersion` va incrementato, come in `reimpostaPasswordAmministratore`: senza, le sessioni già aperte resterebbero valide e la password vecchia continuerebbe a funzionare fino al logout
- 6. I permessi si sistemano uno alla volta
  - oggi un assistente ha un elenco di permessi unico per tutti i condomìni (`User.permessi`) più l'elenco in `Condominio.assistenti`: non si può dire "su questo stabile tutto, su quello solo i versamenti"
  - "pieno qui e limitato lì" non è esprimibile: `permessi: null` significa accesso pieno, quindi servono elenchi multipli o togliere il `null` e trattare "tutti i permessi" come elenco completo
  - `requirePermesso` e `requirePermessoLettura` ricevono già `req.params.condominioId` e possono risolvere l'elenco giusto, ma ogni rotta sotto `/condomini/:condominioId` va controllata una per una
  - la delega a un assistente è ancora tutto o niente (`creaAssistente` lo aggiunge a tutti gli stabili dell'amministrante): la voce "Delegare un assistente a un solo condominio" è stata tolta dalla coda senza essere realizzata
  - **permessi e guardie su cui siamo passati**, da aggiornare a ogni intervento che ne tocca uno:
    - 2026-10-07 — posizioni del superadmin in `profiloCompleto` (`auth.controller.ts`): `/auth/me` non gli restituisce più i condomìni come posizioni, perché il superadmin non amministra nessuno stabile
    - 2026-10-07 — `RichiediAmministratore` (client): esclude anche il superadmin, che nelle pagine di condominio vedeva stabili non suoi

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
