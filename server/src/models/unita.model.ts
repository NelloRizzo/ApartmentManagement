import { Schema, model, type Model } from 'mongoose';
import { baseSchema, models, type ObjectId } from './base.js';
import { TIPI_UNITA, type TipoUnita } from '../types/domain.js';
import type { CondominioDoc } from './condominio.model.js';
import type { UserDoc } from './user.model.js';

const unitaSchema = baseSchema(
  {
    condominio: { type: Schema.Types.ObjectId, ref: 'Condominio', required: true, index: true },
    codice: { type: String, required: [true, 'Codice unità obbligatorio'], trim: true },
    piano: { type: Number, default: 0 },
    numero: { type: String, trim: true },
    tipo: { type: String, enum: TIPI_UNITA, default: 'appartamento' },
    metratura: { type: Number, min: 0 },
    vani: { type: Number, min: 0 },
    /** Descrizione libera utile per il verbale: "app. 3 piano con box". */
    descrizione: { type: String, trim: true },
    /** Se true l'unità è considerata nella tabella millesimale. */
    attiva: { type: Boolean, default: true },
    note: { type: String, trim: true, maxlength: 2000 },
  },
  { collection: 'unita' },
);

unitaSchema.index({ condominio: 1, codice: 1 }, { unique: true });
unitaSchema.index({ condominio: 1, attiva: 1 });

export interface UnitaDoc {
  _id: ObjectId;
  condominio: CondominioDoc['_id'];
  codice: string;
  piano: number;
  numero?: string;
  tipo: TipoUnita;
  metratura?: number;
  vani?: number;
  descrizione?: string;
  attiva: boolean;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type UnitaModel = Model<UnitaDoc>;
export const Unita: UnitaModel = (models.Unita as UnitaModel) ?? model<UnitaDoc>('Unita', unitaSchema);

/** Forma di `unita` dopo un `populate` con i soli campi di riepilogo. */
export interface UnitaRiepilogo {
  _id: ObjectId;
  codice: string;
  piano: number;
  tipo: TipoUnita;
  metratura?: number;
  vani?: number;
}

export type CondominoRef = UserDoc['_id'];
