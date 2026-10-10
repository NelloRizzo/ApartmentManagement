import express from 'express';
import path from 'node:path';
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

  // In produzione il frontend è servito da questo stesso servizio. È ciò che
  // rende **same-origin** il cookie di refresh: frontend e API sullo stesso
  // host, quindi `SameSite=Lax` viene inviato e la sessione si rinnova fra un
  // avvio e l'altro (vedi README, «Cookie di sessione e dominio»). In sviluppo
  // il SPA lo serve Vite sulla 5173 e questi file non esistono.
  if (config.isProd) {
    const clientDir = path.join(config.rootDir, 'client', 'dist');
    app.use(express.static(clientDir, { index: false }));
    app.get('*', (req, res, next) => {
      // Solo le navigazioni del SPA ricadono su `index.html`. Le chiamate API e
      // i file mancanti devono continuare a rispondere 404, non con la pagina:
      // per questo si guarda l'`Accept` (una navigazione chiede `text/html`, un
      // asset no), invece di `req.accepts('html')`, che accetterebbe anche `*/*`.
      if (req.path.startsWith('/api') || req.path.startsWith('/allegati')) return next();
      if (!req.accepts('html') || !(req.get('accept') ?? '').includes('text/html')) return next();
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
