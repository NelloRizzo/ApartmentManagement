import { Schema, model, type Model } from 'mongoose';
import { baseSchema, models, type ObjectId } from './base.js';
import type { AssembleaDoc } from './assemblea.model.js';
import type { CondominioDoc } from './condominio.model.js';
import type { UserDoc } from './user.model.js';

const verbaleSchema = baseSchema(
  {
    condominio: { type: Schema.Types.ObjectId, ref: 'Condominio', required: true, index: true },
    assemblea: { type: Schema.Types.ObjectId, ref: 'Assemblea', required: true },
    /** Progressivo del verbale, indipendente dal numero assemblea. */
    numero: { type: Number, required: true, min: 1 },
    data: { type: Date, required: true },
    testo: { type: String, default: '' },
    /** Snapshot dei dati al momento della generazione, per non rigenerare diversamente. */
    snapshot: {
      millesimiTotali: { type: Number, default: 0 },
      millesimiPresenti: { type: Number, default: 0 },
      presenze: {
        numeroCondomini: { type: Number, default: 0 },
        numeroDeleghe: { type: Number, default: 0 },
      },
      punti: {
        type: [Schema.Types.Mixed],
        default: [],
      },
    },
    generatoDa: { type: Schema.Types.ObjectId, ref: 'User' },
    generatoIl: { type: Date, default: Date.now },
    /** true dopo che l'amministratore ha modificato il testo a mano. */
    modificatoManualmente: { type: Boolean, default: false },
    approvato: { type: Boolean, default: false },
    approvatoIl: { type: Date },
    approvatoDa: { type: Schema.Types.ObjectId, ref: 'User' },
    allegati: [
      {
        nome: { type: String, required: true },
        url: { type: String, required: true },
        tipo: { type: String, trim: true },
        size: { type: Number },
      },
    ],
  },
  { collection: 'verbali' },
);

verbaleSchema.index({ assemblea: 1 }, { unique: true });
verbaleSchema.index({ condominio: 1, numero: 1 }, { unique: true });

export interface VerbaleDoc {
  _id: ObjectId;
  condominio: CondominioDoc['_id'];
  assemblea: AssembleaDoc['_id'];
  numero: number;
  data: Date;
  testo: string;
  snapshot: {
    millesimiTotali: number;
    millesimiPresenti: number;
    presenze: { numeroCondomini: number; numeroDeleghe: number };
    punti: unknown[];
  };
  generatoDa?: UserDoc['_id'];
  generatoIl: Date;
  modificatoManualmente: boolean;
  approvato: boolean;
  approvatoIl?: Date;
  approvatoDa?: UserDoc['_id'];
  allegati: { nome: string; url: string; tipo?: string; size?: number }[];
  createdAt: Date;
  updatedAt: Date;
}

export type VerbaleModel = Model<VerbaleDoc>;
export const Verbale: VerbaleModel =
  (models.Verbale as VerbaleModel) ?? model<VerbaleDoc>('Verbale', verbaleSchema);
