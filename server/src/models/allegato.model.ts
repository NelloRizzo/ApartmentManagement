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
 *
 * **Chi lo referenzia tiene solo l'id, non una copia dei metadati.** Il documento
 * che ospita il file (una comunicazione, una voce di bilancio) ha
 * `allegati: [ObjectId]`, e tutto il resto si legge da qui a ogni richiesta.
 * Copiare i metadati dentro il documento darebbe due copie che possono divergere,
 * e l'URL firmato copieriato scadrebbe: la firma vale 24 ore e non si rinnova da
 * sola.
 */
const allegatoSchema = baseSchema(
  {
    /** Nome originale del file, mostrato all'utente. */
    nome: { type: String, required: true, trim: true },
    /** MIME dichiarato dal client, verificato contro l'allowlist in upload. */
    tipo: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
    dati: { type: Buffer, required: true },

    /**
     * Di cosa parla il documento, in parole dell'utente.
     *
     * Obbligatorio e non derivato da `nome`: il nome del file lo dice il mittente
     * e non chi legge, e finisce in "documento (1).pdf". È l'unico campo che
     * distingue due allegati nella stessa lista.
     */
    oggetto: { type: String, required: [true, 'Oggetto obbligatorio'], trim: true, maxlength: 300 },
    /** Chiarimento facoltativo sul contenuto. */
    descrizione: { type: String, default: '', trim: true, maxlength: 2000 },
    /** Da dove viene: "fattura", "contratto", "comune", per esempio. */
    fonte: { type: String, trim: true, maxlength: 200 },
    /** Riferimento puntuale: numero di protocollo, di fattura, di delibera. */
    riferimento: { type: String, trim: true, maxlength: 200 },

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
  oggetto: string;
  descrizione: string;
  fonte?: string;
  riferimento?: string;
  mittente: ObjectId;
  condominio: ObjectId;
  scadenza?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type AllegatoModel = Model<AllegatoDoc>;
export const Allegato: AllegatoModel =
  (models.Allegato as AllegatoModel) ?? model<AllegatoDoc>('Allegato', allegatoSchema);