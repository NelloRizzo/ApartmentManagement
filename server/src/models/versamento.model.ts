import { Schema, model, type Model } from 'mongoose';
import { baseSchema, models, type ObjectId } from './base.js';
import { METODI_PAGAMENTO, type MetodoPagamento } from '../types/domain.js';
import type { CondominioDoc } from './condominio.model.js';
import type { UnitaDoc } from './unita.model.js';
import type { UserDoc } from './user.model.js';

const versamentoSchema = baseSchema(
  {
    condominio: { type: Schema.Types.ObjectId, ref: 'Condominio', required: true, index: true },
    unita: { type: Schema.Types.ObjectId, ref: 'Unita', required: true, index: true },
    condomino: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    periodo: {
      anno: { type: Number, required: true, min: 2000, max: 2100 },
      mese: { type: Number, required: true, min: 1, max: 12 },
    },
    importo: { type: Number, required: [true, 'Importo obbligatorio'] },
    dataVersamento: { type: Date, required: true, index: true },
    dataValuta: { type: Date },
    metodo: { type: String, enum: METODI_PAGAMENTO, default: 'bonifico' },
    causale: { type: String, trim: true },
    identificativoTransazione: { type: String, trim: true },
/**
 * Allegato (quietanza, ricevuta).
 *
 * Un versamento ha al massimo un allegato, e comunque si tiene l'id: il file sta
 * in `Allegato` con i suoi metadati, e l'URL firmato si genera a ogni lettura.
 */
allegato: { type: Schema.Types.ObjectId, ref: 'Allegato' },
    note: { type: String, trim: true, maxlength: 2000 },
    registratoDa: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { collection: 'versamenti' },
);

versamentoSchema.index({ condominio: 1, 'periodo.anno': 1, 'periodo.mese': 1 });
versamentoSchema.index({ condominio: 1, unita: 1, dataVersamento: -1 });

export interface VersamentoDoc {
  _id: ObjectId;
  condominio: CondominioDoc['_id'];
  unita: UnitaDoc['_id'];
  condomino?: UserDoc['_id'];
  periodo: { anno: number; mese: number };
  importo: number;
  dataVersamento: Date;
  dataValuta?: Date;
  metodo: MetodoPagamento;
  causale?: string;
  identificativoTransazione?: string;
  allegato?: ObjectId;
  note?: string;
  registratoDa?: UserDoc['_id'];
  createdAt: Date;
  updatedAt: Date;
}

export type VersamentoModel = Model<VersamentoDoc>;
export const Versamento: VersamentoModel =
  (models.Versamento as VersamentoModel) ?? model<VersamentoDoc>('Versamento', versamentoSchema);
