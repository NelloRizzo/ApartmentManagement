import { Schema, model, type Model } from 'mongoose';
import { baseSchema, models, type ObjectId } from './base.js';
import {
  STATI_COMUNICAZIONE,
  TIPI_COMUNICAZIONE,
  type StatoComunicazione,
  type TipoComunicazione,
} from '../types/domain.js';
import type { CondominioDoc } from './condominio.model.js';
import type { UnitaDoc } from './unita.model.js';
import type { UserDoc } from './user.model.js';

const comunicazioneSchema = baseSchema(
  {
    condominio: { type: Schema.Types.ObjectId, ref: 'Condominio', index: true },
    assemblea: { type: Schema.Types.ObjectId, ref: 'Assemblea' },
    tipo: { type: String, enum: TIPI_COMUNICAZIONE, default: 'avviso' },
    stato: { type: String, enum: STATI_COMUNICAZIONE, default: 'bozza', index: true },
    mittente: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    destinatario: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    /** Destinatari broadcast quando non c'è un singolo destinatario. */
    destinatari: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    unita: [{ type: Schema.Types.ObjectId, ref: 'Unita' }],
    oggetto: { type: String, required: [true, 'Oggetto obbligatorio'], trim: true, maxlength: 300 },
    corpo: { type: String, default: '', maxlength: 50_000 },
    /** Thread per le risposte del condomino all'amministratore. */
    threadId: { type: Schema.Types.ObjectId, index: true },
    dataInvio: { type: Date },
    dataLettura: { type: Date },
    lettaDa: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    allegati: [{ type: Schema.Types.ObjectId, ref: 'Allegato' }],
    richiedeRisposta: { type: Boolean, default: false },
    rispostaA: { type: Schema.Types.ObjectId, ref: 'Comunicazione' },
  },
  { collection: 'comunicazioni' },
);

comunicazioneSchema.index({ condominio: 1, createdAt: -1 });
comunicazioneSchema.index({ destinatario: 1, stato: 1, createdAt: -1 });
comunicazioneSchema.index({ mittente: 1, createdAt: -1 });
comunicazioneSchema.index({ threadId: 1, createdAt: 1 });

export interface ComunicazioneDoc {
  _id: ObjectId;
  condominio?: CondominioDoc['_id'];
  assemblea?: ObjectId;
  tipo: TipoComunicazione;
  stato: StatoComunicazione;
  mittente: UserDoc['_id'];
  destinatario?: UserDoc['_id'];
  destinatari: UserDoc['_id'][];
  unita: UnitaDoc['_id'][];
  oggetto: string;
  corpo: string;
  threadId?: ObjectId;
  dataInvio?: Date;
  dataLettura?: Date;
  lettaDa: UserDoc['_id'][];
  allegati: ObjectId[];
  richiedeRisposta: boolean;
  rispostaA?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type ComunicazioneModel = Model<ComunicazioneDoc>;
export const Comunicazione: ComunicazioneModel =
  (models.Comunicazione as ComunicazioneModel) ??
  model<ComunicazioneDoc>('Comunicazione', comunicazioneSchema);
