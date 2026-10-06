import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { baseSchema, models, type ObjectId } from './base.js';
import { USER_ROLES, type Permesso, type UserRole } from '../types/domain.js';
import { config } from '../config/index.js';

export interface UserDoc {
  _id: ObjectId;
  email: string;
  password: string;
  nome: string;
  cognome: string;
  role: UserRole;
  /** `null` = accesso pieno. Vedi `types/domain.ts`. */
  permessi: Permesso[] | null;
  delegatoDa?: ObjectId;
  dataDelega?: Date;
  condominiAmministrati: ObjectId[];
  condominiAssistente: ObjectId[];
  condominiServito: ObjectId[];
  telefono?: string;
  attivo: boolean;
  /**
   * Conferma dell'indirizzo email.
   *
   * È separata da `attivo` di proposito: `attivo` è la disattivazione
   * amministrativa, che revoca l'accesso, mentre qui l'indirizzo è semplicemente
   * non stato verificato. Un utente non confermato entra e vede un avviso, ma
   * finché l'indirizzo non è valido non abbiamo la certezza che sia lui.
   */
  emailConfermato: boolean;
  emailConfermatoIl?: Date;
  /**
   * Indirizzo proposto dall'utente, in attesa di conferma.
   *
   * `email` resta quella con cui si entra finché il nuovo indirizzo non risponde:
   * il login è per indirizzo, quindi salvare subito significherebbe che uno
   * sbaglio nella digitazione blocca l'utente fuori, e oggi nessuno potrebbe
   * correggerlo al suo posto.
   */
  emailInAttesa?: string;
  /** Hash SHA-256 del token di conferma: il token in chiaro non viene conservato. */
  confermaEmailHash?: string;
  confermaEmailScadenza?: Date;
  confermaEmailInviataIl?: Date;
  tokenVersion: number;
  ultimoAccesso?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserMethods {
  verifyPassword(plain: string): boolean;
}

export interface UserStatics {
  hashPassword(plain: string): Promise<string>;
}

export type UserModel = Model<UserDoc, Record<string, never>, UserMethods> & UserStatics;

const userSchema = baseSchema(
  {
    email: {
      type: String,
      required: [true, 'Email obbligatoria'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email non valida'],
    },
    password: { type: String, required: true, select: false },
    nome: { type: String, required: [true, 'Nome obbligatorio'], trim: true },
    cognome: { type: String, required: [true, 'Cognome obbligatorio'], trim: true },
    role: { type: String, enum: USER_ROLES, default: 'condomino' },
    /**
     * Permessi delegati a un assistente, come `ambito:azione`.
     * `null` (il default) significa accesso pieno: è il caso degli amministratori
     * e del superadmin. Un elenco vuoto disabilita tutte le operazioni.
     */
    permessi: { type: [String], default: null },
    /** Amministratore che ha concesso le deleghe, per tracciabilità. */
    delegatoDa: { type: Schema.Types.ObjectId, ref: 'User' },
    dataDelega: { type: Date },
    /** Condomini di cui l'utente è amministratore. */
    condominiAmministrati: [{ type: Schema.Types.ObjectId, ref: 'Condominio', index: true }],
    /** Condomini in cui l'utente opera come assistente delegato. */
    condominiAssistente: [{ type: Schema.Types.ObjectId, ref: 'Condominio', index: true }],
    /** Condomini in cui l'utente opera come portiere/servizio. */
    condominiServito: [{ type: Schema.Types.ObjectId, ref: 'Condominio', index: true }],
    telefono: { type: String, trim: true },
    attivo: { type: Boolean, default: true },
    emailConfermato: { type: Boolean, default: false },
    emailConfermatoIl: { type: Date },
    emailInAttesa: { type: String, trim: true, lowercase: true },
    confermaEmailHash: { type: String, index: true },
    confermaEmailScadenza: { type: Date },
    confermaEmailInviataIl: { type: Date },
    /** Incrementato per invalidare tutti i refresh token emessi in precedenza. */
    tokenVersion: { type: Number, default: 0 },
    ultimoAccesso: { type: Date },
  },
  { collection: 'users' },
);

userSchema.virtual('nomeCompleto').get(function (this: HydratedDocument<UserDoc>) {
  return `${this.nome} ${this.cognome}`.trim();
});

userSchema.index({ role: 1, attivo: 1 });

userSchema.statics.hashPassword = async function (plain: string): Promise<string> {
  const saltRounds = config.isProd ? 12 : 10;
  return bcrypt.hash(plain, saltRounds);
};

userSchema.methods.verifyPassword = function (this: UserDoc & { password: string }, plain: string): boolean {
  return bcrypt.compareSync(plain, this.password);
};

export const User: UserModel = (models.User as UserModel) ?? model<UserDoc, UserModel>('User', userSchema);

/** Forma di `utente` dopo un `populate` con i soli campi di riepilogo. */
export interface UtenteRiepilogo {
  _id: ObjectId;
  nome: string;
  cognome: string;
  email: string;
  telefono?: string;
  attivo?: boolean;
  ultimoAccesso?: Date;
}
