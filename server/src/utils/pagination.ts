import type { Request } from 'express';
import { z } from 'zod';
import { badRequest } from './errors.js';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  sort: z.string().trim().max(40).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
  attivo: z.coerce.boolean().optional(),
  attiva: z.coerce.boolean().optional(),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;

/**
 * Estrae i campi di paginazione da una query **già validata**.
 *
 * Non va usato `paginationSchema.safeParse(req.query)` sulle rotte che hanno un
 * proprio schema di lista: Zod elimina le chiavi non dichiarate, quindi i
 * filtri specifici (stato, anno, bandiera…) verrebbero persi prima di arrivare
 * al controller. Qui si legge solo ciò che serve, lasciando intatti gli altri
 * campi presenti in `query`.
 */
export function paginazioneDa<T extends Record<string, unknown>>(
  query: T,
  ordinamentoPredefinito = 'createdAt',
): { page: number; limit: number; sort: string; order: 'asc' | 'desc' } {
  const parsed = paginationSchema
    .pick({ page: true, limit: true, sort: true, order: true })
    .safeParse(query);

  if (!parsed.success) throw badRequest('Parametri di paginazione non validi', parsed.error.flatten());
  return { ...parsed.data, sort: parsed.data.sort ?? ordinamentoPredefinito };
}

/** Validazione autonoma: da usare solo su rotte senza uno schema di lista dedicato. */
export function getPagination(req: Request): PaginationQuery {
  const parsed = paginationSchema.safeParse(req.query);
  if (!parsed.success) throw badRequest('Parametri di paginazione non validi', parsed.error.flatten());
  return parsed.data;
}

export function getObjectId(value: string, field = 'id'): string {
  if (!/^[0-9a-fA-F]{24}$/.test(value)) {
    throw badRequest(`Valore non valido per il campo ${field}: atteso un ObjectId a 24 cifre esadecimali`);
  }
  return value;
}

/** Filtro di testo sicuro: escape dei metacaratteri di RegExp. */
export function regexDaTesto(testo: string): RegExp {
  return new RegExp(testo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}
