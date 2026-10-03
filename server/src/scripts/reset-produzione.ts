/**
 * Svuota il database di produzione e ricrea l'amministratore di piattaforma.
 *
 *   npm run reset:produzione -- <password> --yes
 *
 * Sparisce tutto: condomini, unità, quote millesimali, assemblee, verbali,
 * bilanci, versamenti, contratti, comunicazioni, allegati e anche il registro
 * delle operazioni. Sopravvive una sola cosa, ricreata in fondo: il superadmin,
 * che è l'unico modo per ottenere quel ruolo (non esiste una rotta che promuova
 * un utente esistente). *
 * La password si risolve in quest'ordine: il primo parametro, la variabile
 * `SUPERADMIN_PASSWORD` (nel `.env` locale) e infine `SEED_SUPERADMIN_PASSWORD`,
 * il cui default è la password del README (`SuperAdmin123!`). Il parametro non
 * può iniziare con `-`, altrimenti viene letto come un flag.
 *
 * La variabile d'ambiente serve per le password con `&`, `|`, `<`, `>`, `^` o
 * `"`: su Windows `npm run` passa gli argomenti attraverso `cmd.exe`, che li
 * tronca o li mangia. Verificato con `Super&Admin`: la password arriverebbe
 * all'applicazione come `Super` e il resto verrebbe eseguito come comando.
 *
 * `--yes` è obbligatorio: senza, il comando stampa il piano di quello che
 * farebbe e non tocca niente. Il nome del comando è già la conferma, quindi non
 * serve anche un prompt interattivo e lo script resta utilizzabile in scripting.
 *
 * Va eseguito in locale, non dal servizio Render: `--yes` azzera davvero e un
 * deploy che lo fa per sbaglio non lascia una seconda occasione per annullare.
 *
 * La destinazione è `MONGODB_URI_PRODUZIONE`, non `MONGODB_URI`: nel `.env`
 * locale quella è il Mongo di sviluppo, e un comando che cancella un database non
 * deve poterci arrivare per inerzia. Se la variabile manca lo script non parte,
 * senza piano B.
 */
import mongoose from 'mongoose';
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
 * La URI finisce nel log di un'operazione distruttiva: va detto dove si sta per
 * operare, ma la password di Atlas no.
 */
function mascheraUri(uri: string): string {
  const [, resto] = uri.split('://');
  return (resto ?? uri).split('@').pop() ?? uri;
}

/**
 * Seconda barriera contro il database di sviluppo.
 *
 * `MONGODB_URI_PRODUZIONE` dovrebbe già escluderlo, ma la stringa viene
 * copiata a mano: una sola volta che ci finisce dentro l'URI locale, questa
 * difesa è quella che ferma il colpo.
 */
function èLocale(uri: string): boolean {
  return /localhost|127\.0\.0\.1|::1/.test(uri);
}

/**
 * Il cluster da azzerare, o l'errore che spiega come dichiararlo.
 *
 * Non ha un valore di ripiego: tornare a `MONGODB_URI` significherebbe che il
 * comando funziona anche quando nessuno ha pensato alla produzione, che è
 * proprio il caso in cui non deve funzionare.
 */
function uriProduzione(): string {
  const uri = config.mongodbUriProduzione;
  if (!uri) {
    throw new Error(
      'MONGODB_URI_PRODUZIONE non dichiarata: questo comando azzera il database di ' +
        'produzione e non sa quale sia. Copiare la stringa di connessione del cluster da ' +
        'Render → steward-api → Environment → MONGODB_URI nel .env locale, come ' +
        'MONGODB_URI_PRODUZIONE. MONGODB_URI non viene usata di proposito: nel .env ' +
        'locale è il Mongo di sviluppo.',
    );
  }
  if (èLocale(uri)) {
    throw new Error(
      `MONGODB_URI_PRODUZIONE punta a un database locale (${mascheraUri(uri)}). ` +
        'Questo script azzera il database di produzione: i dati di sviluppo si ricreano ' +
        'con `npm run seed` e non si toccano.',
    );
  }
  return uri;
}

async function contaDocumenti(nome: string): Promise<number> {
  try {
    return await mongoose.connection.db!.collection(nome).estimatedDocumentCount();
  } catch {
    // La collezione può sparire fra la lista e il conteggio: non è un motivo
    // per interrompere un'operazione che quella collezione l'avrebbe rimossa
    // comunque.
    return 0;
  }
}

/**
 * Stampa il piano e restituisce le collezioni che verranno rimosse.
 *
 * Il piano si stampa anche quando l'operazione è confermata: serve a controllare
 * quale database sta per essere colpito prima che il colpo arrivi.
 */
async function piano(uri: string): Promise<string[]> {
  // L'elenco viene preso dal database con `listCollections`, non con
  // `connection.collections()`: quest'ultimo conosce solo i modelli già registrati
  // nel processo, quindi nasconderebbe proprio alcune collezioni da cancellare,
  // che è quello che qui serve vedere.
  const elencate = await mongoose.connection.db!.listCollections({}, { nameOnly: true }).toArray();
  const nomi = elencate.map((c) => c.name).filter((n) => !n.startsWith('system.'));

  logger.info(`Database di destinazione: ${mascheraUri(uri)}`);
  logger.info('Contenuto attuale:');
  for (const nome of nomi) {
    logger.info(`  ${nome.padEnd(22)} ${await contaDocumenti(nome)} documenti`);
  }
  logger.info('Verrà ricreato solo:');
  logger.info(`  ${config.seed.superadminEmail} (superadmin)`);
  return nomi;
}

async function reset(uri: string, password: string): Promise<void> {
  const nomi = await piano(uri);
  const db = mongoose.connection.db!;

  // Le collezioni si rimuovono una a una, non con `dropDatabase`: su Atlas
  // quest'ultimo richiede il ruolo `dbOwner`, mentre `dropCollection` è
  // consentito dal `readWriteAnyDatabase` con cui l'utente del cluster viene
  // creato. È la stessa via di `seed --reset`, e chiedere al database un
  // permesso più ampio per ottenere lo stesso risultato non vale la pena.
  for (const nome of nomi) {
    await db.dropCollection(nome);
  }
  logger.info(`Database svuotato: ${nomi.length} collezioni rimosse`);

  // Le collezioni rimosse portano via anche i loro indici, quindi vanno
  // ricreati: in produzione non partono da soli (`autoIndex` è disattivato per non
  // indicizzare a ogni avvio dell'istanza).
  await mongoose.syncIndexes();

  // `permessi: null` è l'accesso pieno, non "nessun permesso": il superadmin non
  // è soggetto a deleghe. L'indirizzo è già confermato perché l'ha scelto chi
  // amministra la piattaforma, quindi l'avviso di conferma sarebbe solo rumore.
  await User.create({
    email: config.seed.superadminEmail,
    password: await User.hashPassword(password),
    nome: 'Super',
    cognome: 'Amministratore',
    role: 'superadmin',
    permessi: null,
    attivo: true,
    emailConfermato: true,
  });

  logger.info('Amministratore di piattaforma ricreato');
  logger.info(`  ${config.seed.superadminEmail}`);
  logger.info('  Le sessioni degli account precedenti non valgono più: senza utente in');
  logger.info('  database `requireAuth` risponde 401, non serve attendere i token.');
}

async function main(): Promise<void> {
  const argomenti = process.argv.slice(2);
  const confermato = argomenti.some((a) => a === '--yes' || a === '-y');
  const passwordInserita = argomenti.find((a) => !a.startsWith('-'));

  // La password viene validata qui e non dalla configurazione, perché arriva
  // dagli argomenti: senza questo controllo `SuperAdmin1` passerebbe e
  // l'amministratore di piattaforma avrebbe una password indebbole.
  const scelta = passwordSchema.safeParse(
    passwordInserita ?? config.superadminPassword ?? config.seed.superadminPassword,
  );
  if (!scelta.success) {
    throw new Error(
      `Password del superadmin non valida: ${scelta.error.issues[0]?.message ?? 'formato non riconosciuto'}`,
    );
  }

  const uri = uriProduzione();
  await connectDatabase(uri);

  if (!confermato) {
    await piano(uri);
    logger.info('Nessuna modifica: il piano qui sopra è quello che verrà eseguito.');
    logger.info('Ripeti con --yes per procedere davvero.');
    return;
  }

  await reset(uri, scelta.data);
}

main()
  .then(() => disconnectDatabase())
  .then(() => process.exit(0))
  .catch(async (err) => {
    logger.error('Reset non eseguito', err);
    await disconnectDatabase().catch(() => undefined);
    process.exit(1);
  });