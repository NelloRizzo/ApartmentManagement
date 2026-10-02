import { Schema, model, type Model } from 'mongoose';
import { baseSchema, models, type ObjectId } from './base.js';
import { REGIMES, type Regime } from '../types/domain.js';
import type { CondominioDoc } from './condominio.model.js';
import type { UnitaDoc } from './unita.model.js';
import type { UserDoc } from './user.model.js';

/**
 * Legame tra un utente e le unità immobiliari di cui è titolare o fruitore.
 * `quota` esprime la quota di proprietà nel caso di comproprietà o nuda proprietà.
 */
const condominoSchema = baseSchema(
  {
    condominio: { type: Schema.Types.ObjectId, ref: 'Condominio', required: true, index: true },
    utente: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    unita: [{ type: Schema.Types.ObjectId, ref: 'Unita', required: true }],
    regime: { type: String, enum: REGIMES, default: 'proprietario' },
    /** Quota di proprietà in percentuale (0-100). Default 100. */
    quota: { type: Number, default: 100, min: 0, max: 100 },
    /** L'utente è il titolare di riferimento per l'unità. */
    primario: { type: Boolean, default: true },
    dataInizio: { type: Date, default: Date.now },
    dataFine: { type: Date, default: null },
    attivo: { type: Boolean, default: true },
    note: { type: String, trim: true, maxlength: 2000 },
  },
  { collection: 'condominati' },
);

condominoSchema.index({ condominio: 1, utente: 1 }, { unique: true });
condominoSchema.index({ utente: 1, attivo: 1 });

export interface CondominoDoc {
  _id: ObjectId;
  condominio: CondominioDoc['_id'];
  utente: UserDoc['_id'];
  unita: UnitaDoc['_id'][];
  regime: Regime;
  quota: number;
  primario: boolean;
  dataInizio: Date;
  dataFine: Date | null;
  attivo: boolean;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CondominoModel = Model<CondominoDoc>;
export const Condomino: CondominoModel =
  (models.Condomino as CondominoModel) ?? model<CondominoDoc>('Condomino', condominoSchema);
