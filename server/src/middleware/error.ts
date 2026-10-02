import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import multer from 'multer';
import { config } from '../config/index.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Rota non trovata: ${req.method} ${req.originalUrl}` },
  });
};

interface MongooseCastError extends Error {
  path?: string;
  kind?: string;
  value?: unknown;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Errore interno del server';
  let details: unknown;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    message = 'Dati non validi';
    details = err.flatten();
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
    message = 'Dati non validi';
    details = Object.fromEntries(
      Object.entries(err.errors).map(([field, e]) => [field, e.message]),
    );
  } else if (err instanceof mongoose.Error.CastError) {
    const castErr = err as MongooseCastError;
    statusCode = 400;
    code = 'INVALID_ID';
    message = `Valore non valido per il campo "${castErr.path}"`;
  } else if (err instanceof mongoose.Error.DocumentNotFoundError) {
    statusCode = 404;
    code = 'NOT_FOUND';
    message = 'Risorsa non trovata';
  } else if (err instanceof mongoose.Error.MongooseServerSelectionError) {
    statusCode = 503;
    code = 'DB_UNAVAILABLE';
    message = 'Database non raggiungibile';
  } else if (err instanceof multer.MulterError) {
    statusCode = 400;
    code = 'UPLOAD_ERROR';
    message = err.message;
  } else if (err instanceof SyntaxError && 'body' in err) {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Corpo della richiesta JSON non valido';
  }

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} -> ${statusCode}`, err);
    if (!config.isProd) details = { stack: (err as Error)?.stack };
  }

  res.status(statusCode).json({
    success: false,
    error: { code, message, ...(details ? { details } : {}) },
  });
};
