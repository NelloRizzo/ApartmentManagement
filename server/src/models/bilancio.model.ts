import { Schema, model, type Model } from 'mongoose';
import { baseSchema, models, type ObjectId } from './base.js';
import type { CondominioDoc } from './condominio.model.js';
import {
  CATEGORIE_BILANCIO,
  RIPARTIZIONI_BILANCIO,
  TIPI_BILANCIO,
  type CategoriaBilancio,
  type RipartizioneBilancio,
  type TipoBilancio,
} from '../types/domain.js';

/** Fattura o movimento che compone una voce di spesa. */
export interface DettaglioSpesa {
  _id?: ObjectId;
  fornitore?: string;
  fattura?: string;
  data?: Date;
  importo?: number;
  pagato?: boolean;
}

const voceSchema = new Schema(
  {
    categoria: { type: String, enum: CATEGORIE_BILANCIO, required: true, default: 'altro' },
    descrizione: { type: String, required: true, trim: true },
    /** Importo annuo: previsto nel preventivo, realizzato nel consuntivo. */
    importo: { type: Number, required: true, min: 0 },
    /**
     * Importo del preventivo cui la voce si riferisce.
     *
     * Vale solo nel consuntivo, dove consente di mostrare lo scostamento senza
     * dover tenere aperto il preventivo a ogni lettura.
     */
    previsto: { type: Number, min: 0 },
    /** Quota di spesa da ripartire sui millesimi di diritto. */
    ripartizione: { type: String, enum: RIPARTIZIONI_BILANCIO, default: 'diritto' },
    /** Se valorizzato il valore per i millesimi (es. €/mq) e non la quota assoluta. */
    valorePerMillesimo: { type: Number, min: 0 },
    voci: [
      {
        fornitore: { type: String, trim: true },
        fattura: { type: String, trim: true },
        data: Date,
        importo: { type: Number, min: 0 },
        pagato: { type: Boolean, default: false },
      },
    ],
    /**
     * Allegati della voce: la quietanza, la fattura, il preventivo del
     * fornitore.
     *
     * Stanno **sulla voce**, non sul bilancio: è la voce che è una spesa con un
     * fornitore, e un documento allegato al bilancio intero non saprebbe a quale
     * delle sue righe appartenere. Solo l'id: i metadati e l'URL firmato si
     * leggono da `Allegato` a ogni richiesta.
     */
    allegati: [{ type: Schema.Types.ObjectId, ref: 'Allegato' }],
  },
  { _id: true },
);

const bilancioSchema = baseSchema(
  {
    condominio: { type: Schema.Types.ObjectId, ref: 'Condominio', required: true, index: true },
    anno: { type: Number, required: true, min: 2000, max: 2100 },
    tipo: { type: String, enum: TIPI_BILANCIO, default: 'preventivo' },
    descrizione: { type: String, trim: true },
    voci: [voceSchema],
    totale: { type: Number, default: 0, min: 0 },
    /** Totale che il preventivo dello stesso anno prevedeva: riempie il consuntivo. */
    totalePrevisto: { type: Number, min: 0 },
    /** Bilancio preventivo da cui è stato generato questo consuntivo. */
    daBilancio: { type: Schema.Types.ObjectId, ref: 'Bilancio' },
    deliberaAssemblea: { type: Schema.Types.ObjectId, ref: 'Assemblea' },
    approvato: { type: Boolean, default: false },
    note: { type: String, trim: true, maxlength: 4000 },
  },
  { collection: 'bilancci' },
);

bilancioSchema.index({ condominio: 1, anno: 1, tipo: 1 }, { unique: true });

export interface VoceBilancio {
  _id: ObjectId;
  categoria: CategoriaBilancio;
  descrizione: string;
  importo: number;
  previsto?: number;
  ripartizione: RipartizioneBilancio;
  valorePerMillesimo?: number;
  voci: DettaglioSpesa[];
}

export interface BilancioDoc {
  _id: ObjectId;
  condominio: CondominioDoc['_id'];
  anno: number;
  tipo: TipoBilancio;
  descrizione?: string;
  voci: VoceBilancio[];
  totale: number;
  totalePrevisto?: number;
  daBilancio?: ObjectId;
  deliberaAssemblea?: ObjectId;
  approvato: boolean;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type BilancioModel = Model<BilancioDoc>;
export const Bilancio: BilancioModel =
  (models.Bilancio as BilancioModel) ?? model<BilancioDoc>('Bilancio', bilancioSchema);
