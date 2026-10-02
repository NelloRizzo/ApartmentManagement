import { Schema, model, type Model } from 'mongoose';
import { baseSchema, models as mongooseModels, type ObjectId } from './base.js';
import { METODI_PAGAMENTO, type MetodoPagamento } from '../types/domain.js';

export const STATI_RATE = ['da_pagare', 'pagato', 'annullato'] as const;
export type StatoRata = (typeof STATI_RATE)[number];

/** Una rata del canone periodico. Viene generata all'emissione del contratto. */
const pagamentoSchema = baseSchema(
  {
    contratto: { type: Schema.Types.ObjectId, ref: 'Contratto', required: true, index: true },
    progressivo: { type: Number, required: true, min: 1 },
    scadenza: { type: Date, required: true, index: true },
    importo: { type: Number, required: true, min: 0 },
    stato: { type: String, enum: STATI_RATE, default: 'da_pagare', index: true },

    dataPagamento: { type: Date },
    metodo: { type: String, enum: METODI_PAGAMENTO, default: 'bonifico' },
    identificativoTransazione: { type: String, trim: true, maxlength: 200 },
    quietanza: { type: String, trim: true, maxlength: 200 },

    note: { type: String, trim: true, maxlength: 2000 },
    registratoDa: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { collection: 'pagamentiContratto' },
);

pagamentoSchema.index({ contratto: 1, progressivo: 1 }, { unique: true });

export interface PagamentoContrattoDoc {
  _id: ObjectId;
  contratto: ObjectId;
  progressivo: number;
  scadenza: Date;
  importo: number;
  stato: StatoRata;
  dataPagamento?: Date;
  metodo: MetodoPagamento;
  identificativoTransazione?: string;
  quietanza?: string;
  note?: string;
  registratoDa?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type PagamentoContrattoModel = Model<PagamentoContrattoDoc>;
export const PagamentoContratto: PagamentoContrattoModel =
  (mongooseModels.PagamentoContratto as PagamentoContrattoModel) ??
  model<PagamentoContrattoDoc, PagamentoContrattoModel>('PagamentoContratto', pagamentoSchema);