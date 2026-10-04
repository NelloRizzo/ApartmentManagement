/**
 * Rimozione di un condominio di prova, comprese le quote millesimali.
 *
 *   npm run --workspace server exec tsx src/scripts/purge-condominio.ts <id>
 *
 * Le API rifiutano la cancellazione se l'unità ha quote in vigore, e la guardia
 * conta le unità anche se disattivate: un condominio creato da una verifica
 * interrotta resta quindi bloccato per sempre. Questo script esiste per lo
 * scenario dei test locali, non come strumento di uso corrente.
 */
import mongoose from 'mongoose';
import { config } from '../config/index.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { Condominio, QuotaMillesimale, Unita } from '../models/index.js';

const id = process.argv[2];

async function main() {
  if (!id || !mongoose.isValidObjectId(id)) {
    throw new Error('serve un ObjectId di condominio come argomento');
  }
  await connectDatabase(config.mongodbUri);

  const condominioId = new mongoose.Types.ObjectId(id);
  const documento = await Condominio.findById(condominioId).lean();
  if (!documento) {
    logger.warn(`nessun condominio con id ${id}`);
    return;
  }

  const quote = await QuotaMillesimale.deleteMany({ condominio: condominioId });
  const unita = await Unita.deleteMany({ condominio: condominioId });
  const risultato = await Condominio.deleteOne({ _id: condominioId });

  logger.info(
    `rimosso «${'nome' in documento ? documento.nome : id}»: ${risultato.deletedCount} condominio, ${unita.deletedCount} unita, ${quote.deletedCount} quote`,
  );
}

main()
  .catch((errore) => {
    logger.error(`purge fallita: ${errore instanceof Error ? errore.message : String(errore)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
