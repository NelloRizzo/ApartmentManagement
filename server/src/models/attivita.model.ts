import { Schema, model, type Model } from 'mongoose';
import { baseSchema, models, type ObjectId } from './base.js';

/**
 * Attività della bacheca del team amministrativo.
 *
 * È l'unico dominio che non appartiene a un condominio: l'attività è un
 * compito che l'amministratore dà ai propri assistenti, quindi vive su
 * `/staff` e non sotto `/condomini/:id`.
 *
 * Il "team" è `User.delegatoDa`, cioè gli assistenti che ho creato io. Non
 * `Condominio.assistenti`: quello dice *dove* qualcuno può operare, e se
 * cambiasse gli stabili la bacheca cambierebbe da sola. `delegatoDa` è il
 * legame che non dipende da nulla.
 */
const attivitaSchema = baseSchema(
  {
    titolo: { type: String, required: [true, 'Titolo obbligatorio'], trim: true, maxlength: 300 },
    descrizione: { type: String, default: '', maxlength: 20_000 },

    /**
     * Chi ha creato l'attività: l'unico che può modificarla o eliminarla.
     *
     * Non è un ruolo: è la proprietà del documento. Un assistente che la
     * riceve non diventa proprietario, e nessuno dei guard di permesso
     * esprime questa distinzione, quindi il controllo sta nel service.
     */
    proprietario: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    /**
     * A chi è affidata. Elenco esplicito di id, mai "vuoto significa tutti":
     * un elenco vuoto qui significa che nessuno l'ha ancora, e l'attività resta
     * visibile solo al proprietario. È la trappola di `permessi: null`, dove
     * invece `null` significa "tutti".
     */
    assegnatari: [{ type: Schema.Types.ObjectId, ref: 'User' }],

    /**
     * Attività di primo livello a cui questa appartiene (il thread).
     *
     * Un solo livello: un figlio non può avere figli. Senza il controllo, A
     * potrebbe diventare padre di B e B padre di A, e la risoluzione del
     * thread non terminerebbe.
     */
    parent: { type: Schema.Types.ObjectId, ref: 'Attivita', index: true },

    /**
     * Figlio che scandisce il lavoro del padre.
     *
     * In v1 la milestone non governa le date del padre: ha le sue e il padre le
     * vede. La cascata delle proroghe è rimandata, perché propagare una data
     * in su richiede prevenzione dei cicli e un ordine di scrittura definito.
     */
    milestone: { type: Boolean, default: false },

    dataInizio: { type: Date },
    dataFine: { type: Date },

    fatto: { type: Boolean, default: false },
    /** Chi ha segnato "fatto" e quando: serve a chi legge la bacheca. */
    fattoDa: { type: Schema.Types.ObjectId, ref: 'User' },
    fattoIl: { type: Date },
  },
  { collection: 'attivita' },
);

// La bacheca di un amministratore: le sue, ordinate per scadenza.
attivitaSchema.index({ proprietario: 1, fatto: 1, dataFine: 1 });
// Le attività che un assistente ha ricevuto.
attivitaSchema.index({ assegnatari: 1, fatto: 1, dataFine: 1 });

export interface AttivitaDoc {
  _id: ObjectId;
  titolo: string;
  descrizione: string;
  proprietario: ObjectId;
  assegnatari: ObjectId[];
  parent?: ObjectId;
  milestone: boolean;
  dataInizio?: Date;
  dataFine?: Date;
  fatto: boolean;
  fattoDa?: ObjectId;
  fattoIl?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type AttivitaModel = Model<AttivitaDoc>;
export const Attivita: AttivitaModel =
  (models.Attivita as AttivitaModel) ?? model<AttivitaDoc>('Attivita', attivitaSchema);

/** Come compare un'utente nelle risposte delle attività. */
export interface UtenteRiepilogoAttivita {
  _id: ObjectId;
  nome: string;
  cognome: string;
  email: string;
}