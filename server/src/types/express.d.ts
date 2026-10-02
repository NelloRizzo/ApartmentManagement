import type { JwtUserPayload } from '../types/domain.js';

declare global {
   
  namespace Express {
    interface Request {
      /** Populated by `requireAuth`. */
      user?: JwtUserPayload;
    }
  }
}

export {};
