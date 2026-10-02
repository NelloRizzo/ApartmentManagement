import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';

const jsonMessage = { code: 'RATE_LIMITED', message: 'Troppe richieste, riprova più tardi.' };

export const apiLimiter: RequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isProd ? 600 : 10_000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: jsonMessage },
});

export const authLimiter: RequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isProd ? 10 : 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, error: { code: 'LOGIN_RATE_LIMITED', message: 'Troppi tentativi di accesso.' } },
});
