import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import { baseSchema, models as mongooseModels, type ObjectId } from './base.js';

export const STATI_CONTRATTO = ['bozza', 'attivo', 'sospeso', 'scaduto', 'cessato'] as const;
export type StatoContratto = (typeof STATI_CONTRATTO)[number];

export const PERIODICITA = ['mensile', 'trimestrale', 'semestrale', 'annuale'] as const;
export type Periodicita = (typeof PERIODICITA)[number];

/** Mesi coperti da una scadenza, per il calcolo delle rate. */
export const MESI_PER_PERIODICITA: Record<Periodicita, number> = {
  mensile: 1,
  trimestrale: 3,
  semestrale: 6,
  annuale: 12,
};

const storicoSchema = new Schema(
  {
    data: { type: Date, default: Date.now },
    azione: { type: String, required: true },
    da: { type: String },
    a: { type: String },
    nota: { type: String, trim: true },
    operatore: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false },
);

/**
 * Contratto di fornitura del servizio tra l'amministratore di piattaforma e
 * un amministratore di condominio.
 *
 * `unitaMassime` è la capacità contrattuale: l'amministratore non può
 * amministrare più unità immobiliari di quelle pattuite, in nessun condominio.
 */
const contrattoSchema = baseSchema(
  {
    codice: { type: String, required: true, unique: true, uppercase: true, trim: true },
    amministratore: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    stato: { type: String, enum: STATI_CONTRATTO, default: 'bozza', index: true },

    /** Capacità contrattuale in unità immobiliari. */
    unitaMassime: { type: Number, required: true, min: 1 },
    /** Costo per ogni periodo di fatturazione. */
    costo: { type: Number, required: true, min: 0 },
    periodicita: { type: String, enum: PERIODICITA, default: 'annuale' },
    /** Durata complessiva in mesi, dalla data di inizio. */
    durataMesi: { type: Number, required: true, min: 1 },

    dataInizio: { type: Date, required: true },
    dataScadenza: { type: Date, required: true, index: true },

    /** Mesi aggiunti a ogni proroga. */
    mesiProroga: { type: Number, default: 12, min: 1 },
    rinnovoAutomatico: { type: Boolean, default: false },

    note: { type: String, trim: true, maxlength: 4000 },
    creatoDa: { type: Schema.Types.ObjectId, ref: 'User' },

    sospesoIl: { type: Date },
    sospesoMotivo: { type: String, trim: true, maxlength: 1000 },
    cessatoIl: { type: Date },
    cessatoMotivo: { type: String, trim: true, maxlength: 1000 },

    storico: [storicoSchema],
  },
  { collection: 'contratti' },
);

contrattoSchema.index({ amministratore: 1, stato: 1 });
contrattoSchema.index({ amministratore: 1, dataScadenza: -1 });

export interface VoceStorico {
  data: Date;
  azione: string;
  da?: string;
  a?: string;
  nota?: string;
  operatore?: ObjectId;
}

export interface ContrattoDoc {
  _id: ObjectId;
  codice: string;
  amministratore: ObjectId;
  stato: StatoContratto;
  unitaMassime: number;
  costo: number;
  periodicita: Periodicita;
  durataMesi: number;
  dataInizio: Date;
  dataScadenza: Date;
  mesiProroga: number;
  rinnovoAutomatico: boolean;
  note?: string;
  creatoDa?: ObjectId;
  sospesoIl?: Date;
  sospesoMotivo?: string;
  cessatoIl?: Date;
  cessatoMotivo?: string;
  storico: VoceStorico[];
  createdAt: Date;
  updatedAt: Date;
}

export type ContrattoModel = Model<ContrattoDoc>;
export type ContrattoDocumento = HydratedDocument<ContrattoDoc>;
export const Contratto: ContrattoModel =
  (mongooseModels.Contratto as ContrattoModel) ??
  model<ContrattoDoc, ContrattoModel>('Contratto', contrattoSchema);