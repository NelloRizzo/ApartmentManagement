import { Schema, model, type Model } from 'mongoose';
import { baseSchema, models, type ObjectId } from './base.js';

/**
 * Allegati salvati dentro MongoDB.
 *
 * Su Render il filesystem del servizio è temporaneo: un file finito in
 * `server/uploads` sparisce al primo riavvio. Mettere il contenuto nel database
 * lo rende durevole e replica insieme al resto, e rende superfluo un disco
 * aggiuntivo a pagamento.
 *
 * Il contenuto è un `Buffer` in un documento normale invece che in GridFS: il
 * limite di BSON è 16 MB e l'upload è limitato a 10 MB, quindi c'è spazio.
 * Un documento per file, inoltre, si interroga con le stesse regole del resto
 * dei dati invece di richiedere un secondo accesso al database.
 */
const allegatoSchema = baseSchema(
  {
    /** Nome originale del file, mostrato all'utente. */
    nome: { type: String, required: true, trim: true },
    /** MIME dichiarato dal client, verificato contro l'allowlist in upload. */
    tipo: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
    dati: { type: Buffer, required: true },

    /** Chi ha caricato il file: serve a sapere a chi appartiene. */
    mittente: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /**
     * Condominio di appartenenza.
     *
     * Un allegato non è pubblico: la firma ne autorizza il download per un
     * tempo breve, quindi l'ambito serve a non mescolare allegati di stabili
     * diversi e a poter ripulire con precisione.
     */
    condominio: { type: Schema.Types.ObjectId, ref: 'Condominio', required: true, index: true },

    /**
     * Usato dall'indice TTL per cancellare i caricamenti mai agganciati a un
     * documento: chi carica e poi abbandona il modulo non lascia spazzatura.
     */
    scadenza: { type: Date },
  },
  { collection: 'allegati' },
);

// `expireAfterSeconds: 0` su un campo assente non fa nulla: i documenti già
// agganciati a una comunicazione non hanno scadenza e non vengono toccati.
allegatoSchema.index({ scadenza: 1 }, { expireAfterSeconds: 0 });

export interface AllegatoDoc {
  _id: ObjectId;
  nome: string;
  tipo: string;
  size: number;
  dati: Buffer;
  mittente: ObjectId;
  condominio: ObjectId;
  scadenza?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type AllegatoModel = Model<AllegatoDoc>;
export const Allegato: AllegatoModel =
  (models.Allegato as AllegatoModel) ?? model<AllegatoDoc>('Allegato', allegatoSchema);

/** Come compare un allegato nelle risposte dell'API e dentro i documenti. */
export interface AllegatoRiferito {
  nome: string;
  url: string;
  tipo?: string;
  size?: number;
}