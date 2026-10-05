import { Schema, model, type Model } from 'mongoose';
import { baseSchema, models, type ObjectId } from './base.js';
import {
  STATI_ASSEMBLEA,
  TIPI_ASSEMBLEA,
  type StatoAssemblea,
  type TipoAssemblea,
} from '../types/domain.js';
import type { CondominioDoc } from './condominio.model.js';
import type { UserDoc } from './user.model.js';

/** Presenza di un condomino (o del suo delegato) in assemblea. */
const presenzaSchema = new Schema(
  {
    condomino: { type: Schema.Types.ObjectId, ref: 'Condomino', required: true },
    presente: { type: Boolean, default: false },
    delegaA: { type: Schema.Types.ObjectId, ref: 'Condomino' },
    motivazioneAstenuto: { type: String, trim: true },
    note: { type: String, trim: true },
  },
  { _id: false },
);

const puntoOrdineSchema = new Schema(
  {
    ordine: { type: Number, required: true, min: 1 },
    titolo: { type: String, required: true, trim: true },
    descrizione: { type: String, trim: true },
    /** Testo della delibera. Se valorizzato diventa parte del verbale. */
    delibera: { type: String, trim: true },
    /** Materia riservata all'assemblea straordinaria (art. 1136 c.c.). */
    riservata: { type: Boolean, default: false },
    /**
     * Bilancio cui il punto si riferisce.
     *
     * Consente al verbale di citare le cifre del documento approvato senza
     * doverle ricopiare a mano nella delibera, che altrimenti resterebbe
     * discordante dal bilancio allegato.
     */
    bilancio: { type: Schema.Types.ObjectId, ref: 'Bilancio' },
    /**
     * Materiale del punto: relazione, preventivo, progetto.
     *
     * Sta **sul singolo punto** e non sull'assemblea: ogni punto è una
     * deliberazione a sé, con i propri documenti. Solo l'id: i metadati e l'URL
     * firmato si leggono da `Allegato` a ogni richiesta.
     */
    allegati: [{ type: Schema.Types.ObjectId, ref: 'Allegato' }],
  },
  { _id: false },
);

/** Esito di una singola votazione, riferita al punto con lo stesso `ordine`. */
const votazioneSchema = new Schema(
  {
    ordine: { type: Number, required: true, min: 1 },
    esito: {
      type: String,
      enum: ['approvato', 'respinto', 'rinviato', 'dibattuto'],
      default: null,
    },
    votiFavorevoli: { type: Number, default: 0, min: 0 },
    votiContrari: { type: Number, default: 0, min: 0 },
    astenuti: { type: Number, default: 0, min: 0 },
    /** Se true, nel verbale non si riportano i numeri dei voti. */
    segreta: { type: Boolean, default: false },
    motivoRinvio: { type: String, trim: true },
  },
  { _id: false },
);

const assembleaSchema = baseSchema(
  {
    condominio: { type: Schema.Types.ObjectId, ref: 'Condominio', required: true, index: true },
    numero: { type: Number, required: true, min: 1 },
    tipo: { type: String, enum: TIPI_ASSEMBLEA, default: 'ordinaria' },
    stato: { type: String, enum: STATI_ASSEMBLEA, default: 'bozza', index: true },
    data: { type: Date, required: [true, 'Data assemblea obbligatoria'], index: true },
    oraInizio: { type: String, trim: true },
    oraChiusura: { type: String, trim: true },
    luogo: { type: String, trim: true, required: true },
    /** Seconda convocazione: l'assemblea è valida per qualunque numero di presenti. */
    secondaConvocazione: { type: Boolean, default: false },
    /** Entro i 14 giorni dalla prima: cambia solo il quorum dei presenti. */
    quattordiciGgiorni: { type: Boolean, default: false },
    presiedutaDa: { type: Schema.Types.ObjectId, ref: 'User' },
    segretario: { type: Schema.Types.ObjectId, ref: 'User' },
    ordineDelGiorno: [puntoOrdineSchema],
    presenze: [presenzaSchema],
    votazioni: [votazioneSchema],
    /** Millesimi rappresentati dai presenti (inclusi i delegati). */
    millesimiPresenti: { type: Number, default: 0 },
    /** Totale millesimi del condominio. */
    millesimiTotali: { type: Number, default: 0 },
    dataConvocazione: { type: Date },
    dataChiusura: { type: Date },
    // Qui non c'è un elenco di allegati: l'assemblea non è un documento con dei
    // fogli attaccati, è un elenco di punti all'ordine del giorno, e sono quelli
    // ad avere il proprio materiale. Un allegato qui non saprebbe a quale punto
    // appartenere.
    note: { type: String, trim: true, maxlength: 4000 },
  },
  { collection: 'assemblee' },
);

assembleaSchema.index({ condominio: 1, numero: 1, tipo: 1 }, { unique: true });
assembleaSchema.index({ condominio: 1, data: -1 });

export interface PresenzaAssemblea {
  condomino: ObjectId;
  presente: boolean;
  delegaA?: ObjectId;
  motivazioneAstenuto?: string;
  note?: string;
}

export interface PuntoOrdine {
  ordine: number;
  titolo: string;
  descrizione?: string;
  delibera?: string;
  riservata?: boolean;
  bilancio?: ObjectId;
  allegati: ObjectId[];
}

export interface Votazione {
  ordine: number;
  esito?: 'approvato' | 'respinto' | 'rinviato' | 'dibattuto' | null;
  votiFavorevoli: number;
  votiContrari: number;
  astenuti: number;
  segreta?: boolean;
  motivoRinvio?: string;
}

export interface AssembleaDoc {
  _id: ObjectId;
  condominio: CondominioDoc['_id'];
  numero: number;
  tipo: TipoAssemblea;
  stato: StatoAssemblea;
  data: Date;
  oraInizio?: string;
  oraChiusura?: string;
  luogo: string;
  secondaConvocazione: boolean;
  quattordiciGgiorni: boolean;
  presiedutaDa?: UserDoc['_id'];
  segretario?: UserDoc['_id'];
  ordineDelGiorno: PuntoOrdine[];
  presenze: PresenzaAssemblea[];
  votazioni: Votazione[];
  millesimiPresenti: number;
  millesimiTotali: number;
  dataConvocazione?: Date;
  dataChiusura?: Date;
  allegati: ObjectId[];
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AssembleaModel = Model<AssembleaDoc>;
export const Assemblea: AssembleaModel =
  (models.Assemblea as AssembleaModel) ?? model<AssembleaDoc>('Assemblea', assembleaSchema);
