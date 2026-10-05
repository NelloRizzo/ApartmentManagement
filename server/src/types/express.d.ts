import type { JwtUserPayload } from '../types/domain.js';
import type { MetaAllegati } from '../middleware/upload.js';

declare global {
  namespace Express {
    interface Request {
      /** Populated by `requireAuth`. */
      user?: JwtUserPayload;
      /**
       * Populated by `leggiMetaAllegati`.
       *
       * Va raccolto prima di `validate`, che sostituisce `req.body` con il
       * risultato di Zod e scarta le chiavi non dichiarate.
       */
      allegatiMeta?: MetaAllegati;
    }
  }
}

export {};
