import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { badRequest } from '../utils/errors.js';

type Source = 'body' | 'query' | 'params';

const sources: Record<Source, 'body' | 'query' | 'params'> = {
  body: 'body',
  query: 'query',
  params: 'params',
};

/** Validates and *replaces* the request section with the parsed (coerced) value. */
export const validate =
  <T extends z.ZodTypeAny>(schema: T, source: Source = 'body'): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req[sources[source]]);
    if (!result.success) {
      return next(badRequest('Dati non validi', result.error.flatten()));
    }
    if (source === 'query') {
      Object.defineProperty(req, 'query', { value: result.data, writable: true, configurable: true });
    } else if (source === 'params') {
      Object.defineProperty(req, 'params', { value: result.data, writable: true, configurable: true });
    } else {
      req.body = result.data;
    }
    next();
  };

/** Like `validate` but passes the parsed value to the handler via res.locals. */
export const validateInto =
  <T extends z.ZodTypeAny>(schema: T, source: Source = 'body'): RequestHandler =>
  (req, res, next) => {
    const result = schema.safeParse(req[sources[source]]);
    if (!result.success) {
      return next(badRequest('Dati non validi', result.error.flatten()));
    }
    res.locals[source] = result.data;
    next();
  };
