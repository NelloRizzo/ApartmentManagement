import { Schema, model, type Model } from 'mongoose';
import { baseSchema, models, type ObjectId } from './base.js';
import type { UserDoc } from './user.model.js';

const condominioSchema = baseSchema(
  {
    nome: { type: String, required: [true, 'Nome obbligatorio'], trim: true },
    /**
     * Identificativo univoco, **autogenerato** e non modificabile: serve nei
     * contratti e nelle comunicazioni, dove il nome non basta perché due
     * stabili possono omonimi. Vedi `generaCodiceCondominio`.
     *
     * `maxlength` è 20 e non 6, che è la lunghezza dei codici nuovi: i condomini
     * creati con il formato precedente portano `RESIDENZAA-3F9A2C` e restano in
     * archivio, perché il codice non è modificabile e le comunicazioni già
     * emesse lo riportano. Abbassare il limite a 6 renderebbe quei documenti
     * non conformi allo schema, e la validazione Mongoose è il tipo di controllo
     * che un giorno, magari su una `update` con `runValidators`, blocca la
     * modifica di uno stabile esistente. La lunghezza dei codici nuovi è
     * garantita dal generatore, che è l'unico a scriverlo.
     */
    codice: {
      type: String,
      required: [true, 'Codice obbligatorio'],
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 20,
    },
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
