import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { logger } from './utils/logger.js';

async function bootstrap(): Promise<void> {
  await connectDatabase();

  const app = createApp();
  const server = createServer(app);

  server.listen(config.port, () => {
    logger.info(`API Steward in ascolto su http://localhost:${config.port}`);
    logger.info(`Ambiente: ${config.env}`);
  });

  const shutdown = (segnale: string) => {
    logger.info(`${segnale} ricevuto, chiusura in corso...`);
    server.close(() => {
      void disconnectDatabase().finally(() => process.exit(0));
    });
    setTimeout(() => {
      logger.error('Chiusura forzata dopo timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', reason);
  });
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', err);
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  logger.error('Avvio fallito', err);
  process.exit(1);
});
