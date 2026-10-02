import type { Request } from 'express';
import { AuditLog } from '../models/auditLog.model.js';
import { logger } from '../utils/logger.js';

export interface AuditEntry {
  condominio?: string;
  attore?: string;
  azione: string;
  entita: string;
  entitaId?: string;
  dettagli?: unknown;
  req?: Request;
}

export async function auditLog(entry: AuditEntry): Promise<void> {
  try {
    await AuditLog.create({
      condominio: entry.condominio,
      attore: entry.attore,
      azione: entry.azione,
      entita: entry.entita,
      entitaId: entry.entitaId,
      dettagli: entry.dettagli,
      ip: entry.req?.ip,
      userAgent: entry.req?.headers['user-agent'],
    });
  } catch (err) {
    // L'audit non deve mai far fallire la richiesta principale.
    logger.warn('Audit log non registrato', err);
  }
}
