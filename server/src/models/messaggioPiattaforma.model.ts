import { Schema, model, type Model } from 'mongoose';
import { baseSchema, models as mongooseModels, type ObjectId } from './base.js';

export const TIPI_MESSAGGIO = ['info', 'avviso', 'sollecito'] as const;
export type TipoMessaggio = (typeof TIPI_MESSAGGIO)[number];

/**
 * Messaggio fra l'amministratore di piattaforma e un amministratore di
 * condominio.
 *
 * È un canale distinto da `Comunicazione`, che resta rivolto ai condòmini ed è
 * legato a un condominio: qui non esiste un condominio di riferimento.
 */
const messaggioSchema = baseSchema(
  {
    contratto: { type: Schema.Types.ObjectId, ref: 'Contratto', index: true },
    mittente: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    destinatario: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tipo: { type: String, enum: TIPI_MESSAGGIO, default: 'info' },
    oggetto: { type: String, required: true, trim: true, maxlength: 300 },
    corpo: { type: String, default: '', maxlength: 50_000 },
    dataLettura: { type: Date },
    lettoDa: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { collection: 'messaggiPiattaforma' },
);

messaggioSchema.index({ destinatario: 1, dataLettura: 1, createdAt: -1 });
messaggioSchema.index({ mittente: 1, destinatario: 1, createdAt: 1 });

export interface MessaggioPiattaformaDoc {
  _id: ObjectId;
  contratto?: ObjectId;
  mittente: ObjectId;
  destinatario: ObjectId;
  tipo: TipoMessaggio;
  oggetto: string;
  corpo: string;
  dataLettura?: Date;
  lettoDa: ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export type MessaggioPiattaformaModel = Model<MessaggioPiattaformaDoc>;
export const MessaggioPiattaforma: MessaggioPiattaformaModel =
  (mongooseModels.MessaggioPiattaforma as MessaggioPiattaformaModel) ??
  model<MessaggioPiattaformaDoc, MessaggioPiattaformaModel>(
    'MessaggioPiattaforma',
    messaggioSchema,
  );