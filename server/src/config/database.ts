import mongoose from 'mongoose';
import { config } from './index.js';
import { logger } from '../utils/logger.js';

let connected = false;

export async function connectDatabase(uri: string = config.mongodbUri): Promise<typeof mongoose> {
  if (connected) return mongoose;

  mongoose.set('strictQuery', true);

  // Nota: non si abilita `sanitizeFilter`. In Mongoose 8 è incompatibile con
  // gli operatori come `$in` (li avvolge in `$eq` e il cast fallisce), e non
  // aggiunge sicurezza reale: ogni valore che arriva dal client è validato dagli
  // schemi Zod in `validators/`, che accettano solo ObjectId a 24 cifre esadecimali,
  // numeri, booleani e stringhe. Gli oggetti di query sono costruiti nel codice.
  mongoose.set('strictPopulate', true);

  await mongoose.connect(uri, {
    /*
     * Tolleranze larghe, pensate per un servizio gratuito che si addormenta.
     *
     * Al riavvio l'istanza riparte e anche il cluster Atlas può essere
     * addormentato: la selezione del server può metterci decine di secondi. Con
     * 10 secondi l'avvio andava in crash, Render riavviava il processo e il
     * crash loop proseguiva finché Atlas non si svegliava da solo.
     */
    serverSelectionTimeoutMS: config.isProd ? 60_000 : 10_000,
    connectTimeoutMS: config.isProd ? 60_000 : 10_000,
    // Il free tier ha 0.1 CPU: un pool più ampio consumerebbe memoria senza
    // reale beneficio, dato che le richieste sono poche e sequenziali.
    maxPoolSize: config.isProd ? 5 : 20,
    // Gli indici si creano una volta sola. In produzione non si ricreano a ogni
    // avvio: su un processore lento è lavoro sprecato a ogni risveglio.
    autoIndex: !config.isProd,
  });

  connected = true;
  logger.info('MongoDB connesso');

  mongoose.connection.on('error', (err) => logger.error('Errore MongoDB', err));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnesso'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB riconnesso'));

  return mongoose;
}

export async function disconnectDatabase(): Promise<void> {
  if (!connected) return;
  await mongoose.disconnect();
  connected = false;
  logger.info('MongoDB disconnesso');
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
