import type { Response } from 'express';

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export function paginated<T>(res: Response, data: T, totale: number, page: number, limit: number): Response {
  const totalPages = limit > 0 ? Math.ceil(totale / limit) : 0;
  const meta: PageMeta = {
    page,
    limit,
    total: totale,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
  return res.json({ success: true, data, meta });
}

export const ok = <T>(res: Response, data: T, status = 200): Response => res.status(status).json({ success: true, data });

export const created = <T>(res: Response, data: T): Response =>
  res.status(201).json({ success: true, data });

export const noContent = (res: Response): Response => res.status(204).send();
