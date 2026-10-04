/**
 * Sposta la capacità contrattuale dalle unità immobiliari ai condomìni.
 *
 *   npm run migra:contratti            # mostra cosa farebbe, non modifica nulla
 *   npm run migra:contratti -- --yes   # esegue
 *
 * I contratti sono stati creati con `unitaMassime`, un numero di unità
 * immobiliari. La capacità è ora contata in condomìni e il campo si chiama
 * `condominiMassimi`: senza questo passaggio ogni contratto vecchio resterebbe
 * senza il campo obbligatorio e la API risponderebbe errore di validazione.
 *
 * La conversione non può essere aritmetica: "20 unità immobiliari" non
 * equivalgono a un numero di condomìni. Si sceglie il numero di condomìni che
 * l'amministratore amministra già, con un minimo di 1. Così nessuno resta
 * scoperto: un amministratore con tre stabili non si ritrova un contratto che
 * ne copre uno solo e lo blocca. La capacità così ottenuta è un punto di
 * partenza, non una scelta contrattuale: va poi regolata dall'amministratore di
 * piattaforma con la proroga (`POST /contratti/:id/proroga`).
 *
 * Va eseguito una volta sola, dopo il deploy che introduce il campo nuovo e
 * prima di usarlo. Sul database di produzione si lancia in locale, con
 * `MONGODB_URI` che punta al cluster: vedi `docs/reset-produzione.md` per la
 * stessa impostazione.
 */
import mongoose from 'mongoose';
import { config } from '../config/index.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { Condominio } from '../models/index.js';

/** Un contratto senza il campo nuovo non viene toccato: è già migrato. */
interface DaMigrare {
  _id: mongoose.Types.ObjectId;
  codice: string;
  amministratore: mongoose.Types.ObjectId;
  unitaMassime?: number;
}

function mascheraUri(uri: string): string {
  const [, resto] = uri.split('://');
  return (resto ?? uri).split('@').pop() ?? uri;
}

async function raccogli(): Promise<DaMigrare[]> {
  // `contratti` è il nome della collezione: si legge con il driver, non con il
  // modello, perché il modello ora dichiara `condominiMassimi` come obbligatorio
  // e un documento vecchio non passerebbe la validazione in fase di lettura.
  return (await mongoose.connection.db!
    .collection('contratti')
    .find(
      { unitaMassime: { $exists: true } },
      { projection: { codice: 1, amministratore: 1, unitaMassime: 1 } },
    )
    .toArray()) as DaMigrare[];
}

async function main(): Promise<void> {
  const confermato = process.argv.includes('--yes') || process.argv.includes('-y');

  await connectDatabase();
  const daMigrare = await raccogli();

  logger.info(`Database: ${mascheraUri(config.mongodbUri)}`);
  logger.info(`Contratti con il vecchio campo unitaMassime: ${daMigrare.length}`);

  if (daMigrare.length === 0) {
    logger.info('Niente da migrare.');
    return;
  }

  // Il conteggio dei condomìni per amministratore si calcola una volta sola: il
  // default del server tira una query per ogni documento.
  const conteggi = new Map<string, number>();
  for (const c of await Condominio.find({}).select('amministratore').lean()) {
    const k = String(c.amministratore);
    conteggi.set(k, (conteggi.get(k) ?? 0) + 1);
  }

  const piani: { documento: DaMigrare; condominiMassimi: number }[] = [];
  for (const documento of daMigrare) {
    const amministra = conteggi.get(String(documento.amministratore)) ?? 0;
    piani.push({ documento, condominiMassimi: Math.max(1, amministra) });
  }

  for (const piano of piani) {
    logger.info(
      `  ${piano.documento.codice}: ${piano.documento.unitaMassime} unità immobiliari -> ` +
        `${piano.condominiMassimi} condomìni (ne amministra ${conteggi.get(String(piano.documento.amministratore)) ?? 0})`,
    );
  }

  if (!confermato) {
    logger.info('Nessuna modifica: il piano qui sopra è quello che verrà eseguito.');
    logger.info('Ripeti con --yes per procedere.');
    return;
  }

  const coll = mongoose.connection.db!.collection('contratti');
  for (const piano of piani) {
    await coll.updateOne(
      { _id: piano.documento._id },
      {
        $set: { condominiMassimi: piano.condominiMassimi },
        // Il vecchio campo va rimosso: tenerlo farebbe pensare che ancora
        // determini la capacità, e un lettore futuro ci farebbe conto.
        $unset: { unitaMassime: '' },
      },
    );
  }

  logger.info(`Migrazione completata: ${piani.length} contratti aggiornati`);
}

main()
  .then(() => disconnectDatabase())
  .then(() => process.exit(0))
  .catch(async (err) => {
    logger.error('Migrazione non completata', err);
    await disconnectDatabase().catch(() => undefined);
    process.exit(1);
  });
