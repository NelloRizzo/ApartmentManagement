import { Schema, model, type Model } from 'mongoose';
import { baseSchema, models, type ObjectId } from './base.js';
import type { CondominioDoc } from './condominio.model.js';
import type { UserDoc } from './user.model.js';

/** Traccia delle azioni rilevanti, per audit e per il GDPR (diritto di accesso). */
const auditLogSchema = baseSchema(
  {
    condominio: { type: Schema.Types.ObjectId, ref: 'Condominio', index: true },
    attore: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    azione: { type: String, required: true, trim: true },
    entita: { type: String, required: true, trim: true },
    entitaId: { type: Schema.Types.ObjectId },
    dettagli: { type: Schema.Types.Mixed },
    ip: { type: String, trim: true },
    userAgent: { type: String, trim: true },
  },
  { collection: 'auditLogs' },
);

auditLogSchema.index({ condominio: 1, createdAt: -1 });
auditLogSchema.index({ entita: 1, entitaId: 1 });

export interface AuditLogDoc {
  _id: ObjectId;
  condominio?: CondominioDoc['_id'];
  attore?: UserDoc['_id'];
  azione: string;
  entita: string;
  entitaId?: ObjectId;
  dettagli?: unknown;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AuditLogModel = Model<AuditLogDoc>;
export const AuditLog: AuditLogModel =
  (models.AuditLog as AuditLogModel) ?? model<AuditLogDoc>('AuditLog', auditLogSchema);
