/**
 * Cambia la password dell'amministratore di piattaforma del seed, e nient'altro.
 *
 *   npm run reset:password-superadmin -- <password> --yes
 *
 * `reset:produzione` azzera il database per riottenere un superadmin; questo
 * script fa la sola cosa che serve in emergenza quando la password è persa:
 * riscrive l'hash di `SEED_SUPERADMIN_EMAIL` e incrementa `tokenVersion`, così
 * le sessioni aperte cadono subito. Nessun altro account, nessuna collezione,
 * nessun dato viene toccato.
 *
 * L'account non è scegliibile: è `SEED_SUPERADMIN_EMAIL`, quello che il seed e
 * `reset:produzione` creano. Un `--email` esplicito avrebbe introdotto l'errore
 * che questo comando non deve permettere — cambiare la password di un
 * superadmin diverso da quello che si vuole recuperare.
 *
 * La password si risolve in quest'ordine: il primo parametro, poi la variabile
 * `SUPERADMIN_PASSWORD` (nel `.env` locale). Non ha un default: un comando che
 * tocca la password di produzione non la sceglie da solo. La variabile serve per
 * le password con `&`, `|`, `<`, `>`, `^` o `"`: su Windows `npm run` passa gli
 * argomenti attraverso `cmd.exe`, che li tronca o li mangia. Il parametro non può
 * iniziare con `-`, altrimenti viene letto come un flag.
 *
 * `--yes` è obbligatorio: senza, il comando stampa il piano e non si connette
 * nemmeno. La destinazione è `MONGODB_URI_PRODUZIONE`, non `MONGODB_URI`: nel
 * `.env` locale quella è il Mongo di sviluppo, e un comando che cambia una
 * password non deve poterci arrivare per inerzia. Se la variabile manca lo
 * script non parte, senza piano B; `localhost` è rifiutato.
 *
 * Come verificarlo in locale, dove `localhost` è rifiutato: lanciarlo su un Mongo
 * che si chiama altrimenti, cioè dentro la rete di compose con l'host `mongo`
 * (`mongodb://mongo:27017/...`): la guardia passa e il colpo arriva sul database
 * di sviluppo.
 */
import { z } from 'zod';
import { config } from '../config/index.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { User } from '../models/index.js';

/** Come `SEED_SUPERADMIN_PASSWORD` in `config/index.ts`: vale il limite più corto. */
const passwordSchema = z.string().min(10, 'la password deve avere almeno 10 caratteri');

/**
 * Host e database della URI, senza le credenziali.
 *
 * La URI finisce nel log: va detto dove si sta per operare, ma la password del
 * cluster no.
 */
function mascheraUri(uri: string): string {
  const [, resto] = uri.split('://');
  return (resto ?? uri).split('@').pop() ?? uri;
}

/**
 * Seconda barriera contro il database di sviluppo.
 *
 * `MONGODB_URI_PRODUZIONE` dovrebbe già escluderlo, ma la stringa viene copiata
 * a mano: una sola volta che ci finisce dentro l'URI locale, questa difesa è
 * quella che ferma il colpo.
 */
function èLocale(uri: string): boolean {
  return /localhost|127\.0\.0\.1|::1/.test(uri);
}

/**
 * Il cluster su cui operare, o l'errore che spiega come dichiararlo.
 *
 * Non ha un valore di ripiego: tornare a `MONGODB_URI` significherebbe che il
 * comando funziona anche quando nessuno ha pensato alla produzione, che è
 * proprio il caso in cui non deve funzionare.
 */
function uriProduzione(): string {
  const uri = config.mongodbUriProduzione;
  if (!uri) {
    throw new Error(
      'MONGODB_URI_PRODUZIONE non dichiarata: questo comando cambia la password ' +
        "dell'amministratore di piattaforma in produzione e non sa dove. Copiare la " +
        'stringa di connessione del cluster da Render → steward-api → Environment → ' +
        'MONGODB_URI nel .env locale, come MONGODB_URI_PRODUZIONE. MONGODB_URI non ' +
        'viene usata di proposito: nel .env locale è il Mongo di sviluppo.',
    );
  }
  if (èLocale(uri)) {
    throw new Error(
      `MONGODB_URI_PRODUZIONE punta a un database locale (${mascheraUri(uri)}). ` +
        'Questo script cambia la password in produzione: i dati di sviluppo si ' +
        'ricreano con `npm run seed` e non si toccano.',
    );
  }
  return uri;
}

/**
 * Il piano, stampato anche quando si procede.
 *
 * Si stampa prima di connettersi: quello che verrà fatto non dipende dal
 * contenuto del database, quindi si può leggere — e rifiutare — anche senza
 * toccarlo. È il senso di `--yes`: prima la dichiarazione, poi il colpo.
 */
function piano(uri: string): void {
  logger.info(`Database di destinazione: ${mascheraUri(uri)}`);
  logger.info(`Account: ${config.seed.superadminEmail} (superadmin)`);
  logger.info('Verrà cambiato: la password (hash nuovo) e tokenVersion (+1, così le sessioni aperte cadono)');
  logger.info('Restano intatti: tutti gli altri account e ogni altro dato');
}

async function reimposta(password: string): Promise<void> {
  // `+password`: il campo è `select: false`, ma qui serve per riscriverlo.
  const utente = await User.findOne({ email: config.seed.superadminEmail }).select('+password');
  if (!utente) {
    throw new Error(
      `Nessun utente con email ${config.seed.superadminEmail}: questo comando cambia la ` +
        "password dell'amministratore di piattaforma creato dal seed o da reset:produzione.",
    );
  }
  if (utente.role !== 'superadmin') {
    throw new Error(
      `L'utente ${config.seed.superadminEmail} ha ruolo ${utente.role}, non superadmin: ` +
        'questo comando è pensato per il solo amministratore di piattaforma.',
    );
  }

  utente.password = await User.hashPassword(password);
  // Le sessioni già aperte cadono subito: senza questo la password vecchia
  // continuerebbe a valere fino al logout, come in `reimpostaPasswordAmministratore`.
  utente.tokenVersion += 1;
  await utente.save();

  logger.info("Password dell'amministratore di piattaforma cambiata");
  logger.info(`  ${config.seed.superadminEmail}`);
  logger.info('  Le sessioni già aperte non valgono più.');
}

async function main(): Promise<void> {
  const argomenti = process.argv.slice(2);
  const confermato = argomenti.some((a) => a === '--yes' || a === '-y');
  const passwordInserita = argomenti.find((a) => !a.startsWith('-'));

  const sorgente = passwordInserita ?? config.superadminPassword;
  if (sorgente === undefined) {
    throw new Error(
      'Nessuna password: passala come primo parametro oppure dichiara ' +
        'SUPERADMIN_PASSWORD nel .env locale (serve per i caratteri che `npm run` ' +
        'tronca su Windows passando da cmd.exe).',
    );
  }
  // La password viene validata qui e non dalla configurazione, perché arriva
  // dagli argomenti: senza questo controllo una password corta passerebbe.
  const scelta = passwordSchema.safeParse(sorgente);
  if (!scelta.success) {
    throw new Error(
      `Password del superadmin non valida: ${scelta.error.issues[0]?.message ?? 'formato non riconosciuto'}`,
    );
  }

  const uri = uriProduzione();
  piano(uri);

  if (!confermato) {
    logger.info('Nessuna modifica: il piano qui sopra è quello che verrà eseguito.');
    logger.info('Ripeti con --yes per procedere davvero.');
    return;
  }

  await connectDatabase(uri);
  await reimposta(scelta.data);
}

main()
  .then(() => disconnectDatabase())
  .then(() => process.exit(0))
  .catch(async (err) => {
    logger.error('Password non cambiata', err);
    await disconnectDatabase().catch(() => undefined);
    process.exit(1);
  });
