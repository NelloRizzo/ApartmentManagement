import { Schema, model, type Model } from 'mongoose';
import { baseSchema, models, type ObjectId } from './base.js';
import { RIPARTIZIONI, type Ripartizione } from '../types/domain.js';
import type { CondominioDoc } from './condominio.model.js';
import type { UnitaDoc } from './unita.model.js';

/**
 * Un documento per coppia (unita, ripartizione) e per revisione.
 * Le revisioni chiuse conservano `validTo`, così lo storico resta consultabile
 * mentre la tabella attiva si ottiene filtrando per revisione corrente.
 */
const quotaMillesimaleSchema = baseSchema(
  {
    condominio: { type: Schema.Types.ObjectId, ref: 'Condominio', required: true, index: true },
    unita: { type: Schema.Types.ObjectId, ref: 'Unita', required: true, index: true },
    ripartizione: {
      type: String,
      enum: RIPARTIZIONI,
      required: true,
      default: 'diritto',
    },
    /** Quota espressa in millesimi. La somma per ripartizione deve fare 1000. */
    valore: { type: Number, required: true, min: 0, max: 1000 },
    revisione: { type: Number, required: true, min: 1 },
    validFrom: { type: Date, required: true, default: Date.now },
    /** null = ancora in vigore. */
    validTo: { type: Date, default: null },
    delibera: { type: String, trim: true },
    dataDelibera: { type: Date },
    note: { type: String, trim: true, maxlength: 2000 },
  },
  { collection: 'quoteMillesimali' },
);

quotaMillesimaleSchema.index(
  { unita: 1, ripartizione: 1, revisione: 1 },
  { unique: true },
);
quotaMillesimaleSchema.index({ condominio: 1, ripartizione: 1, revisione: 1 });
quotaMillesimaleSchema.index({ condominio: 1, ripartizione: 1, validTo: 1 });

export interface QuotaMillesimaleDoc {
  _id: ObjectId;
  condominio: CondominioDoc['_id'];
  unita: UnitaDoc['_id'];
  ripartizione: Ripartizione;
  valore: number;
  revisione: number;
  validFrom: Date;
  validTo: Date | null;
  delibera?: string;
  dataDelibera?: Date;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type QuotaMillesimaleModel = Model<QuotaMillesimaleDoc>;
export const QuotaMillesimale: QuotaMillesimaleModel =
  (models.QuotaMillesimale as QuotaMillesimaleModel) ??
  model<QuotaMillesimaleDoc>('QuotaMillesimale', quotaMillesimaleSchema);
