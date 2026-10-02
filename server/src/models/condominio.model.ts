import { Schema, model, type Model } from 'mongoose';
import { baseSchema, models, type ObjectId } from './base.js';
import type { UserDoc } from './user.model.js';

const condominioSchema = baseSchema(
  {
    nome: { type: String, required: [true, 'Nome obbligatorio'], trim: true },
    codice: { type: String, required: [true, 'Codice obbligatorio'], unique: true, uppercase: true, trim: true },
    indirizzo: {
      via: { type: String, required: true, trim: true },
      civico: { type: String, trim: true },
      citta: { type: String, trim: true },
      cap: { type: String, trim: true },
      provincia: { type: String, trim: true },
    },
    amministratore: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** Portieri o altri servizi operanti nel condominio. */
    condominiServito: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
    /**
     * Assistenti delegati dall'amministratore con permessi limitati.
     * Sono utenti con ruolo `admin`, quindi devono essere esplicitati qui per
     * superare `requireCondominioAccess` senza essere i titolari del condominio.
     */
    assistenti: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
    /** Delibera dell'assemblea che ha approvato la tabella millesimale in uso. */
    deliberaRipartizione: { type: String, trim: true },
    dataDeliberaRipartizione: { type: Date },
    /** Numero totale di millesimi dichiarati. Deve coincidere con 1000. */
    totaleMillesimi: { type: Number, default: 1000, min: 1 },
    note: { type: String, trim: true, maxlength: 4000 },
  },
  { collection: 'condomini' },
);

export interface CondominioDoc {
  _id: ObjectId;
  nome: string;
  codice: string;
  indirizzo: { via: string; civico?: string; citta?: string; cap?: string; provincia?: string };
  amministratore: UserDoc['_id'];
  condominiServito: UserDoc['_id'][];
  assistenti: UserDoc['_id'][];
  deliberaRipartizione?: string;
  dataDeliberaRipartizione?: Date;
  totaleMillesimi: number;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CondominioModel = Model<CondominioDoc>;
export const Condominio: CondominioModel =
  (models.Condominio as CondominioModel) ?? model<CondominioDoc>('Condominio', condominioSchema);
