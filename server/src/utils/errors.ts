export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  readonly isOperational = true;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }
}

export const badRequest = (m: string, details?: unknown) => new AppError(m, 400, 'BAD_REQUEST', details);
export const unauthorized = (m = 'Autenticazione richiesta') => new AppError(m, 401, 'UNAUTHORIZED');
export const forbidden = (m = 'Accesso non autorizzato') => new AppError(m, 403, 'FORBIDDEN');
export const notFound = (m = 'Risorsa non trovata') => new AppError(m, 404, 'NOT_FOUND');
export const conflict = (m: string, details?: unknown) => new AppError(m, 409, 'CONFLICT', details);
export const unprocessable = (m: string, details?: unknown) =>
  new AppError(m, 422, 'UNPROCESSABLE_ENTITY', details);
