import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { config } from './config/index.js';
import routes from './routes/index.js';
import allegatoRoutes from './routes/allegato.routes.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

export function createApp(): express.Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Le richieste senza Origin (curl, app native, health check) sono ammesse.
        if (!origin) return callback(null, true);
        if (config.corsOrigins.includes(origin) || config.corsOrigins.includes('*')) {
          return callback(null, true);
        }
        callback(new Error(`Origine non consentita dal CORS: ${origin}`));
      },
      credentials: true,
    }),
  );

  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(morgan(config.isProd ? 'combined' : 'dev'));

  // Gli allegati stanno in MongoDB, non sul disco: non c'è più
  // `express.static` su `server/uploads`. Sono serviti fuori da `/api` perché
  // l'URL è quello finito nel documento e porta già la firma di accesso:
  // `<img src>` non può inviare l'intestazione `Authorization`.
  app.use('/allegati', allegatoRoutes);
  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
