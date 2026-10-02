import { config } from '../config/index.js';
import { User } from '../models/index.js';
import { badRequest, notFound } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { hashTokenConferma, inviaConfermaEmail, nuovoTokenConferma, type EsitoInvio } from './email.service.js';

/**
 * Conferma dell'indirizzo email degli account creati dall'amministratore di
 * piattaforma e dall'amministratore di condominio per il proprio team.
 *
 * L'utente non viene bloccato: entra normalmente e vede un avviso finché
 * l'indirizzo non è confermato. Se l'invio non riesce l'account resta creato e
 * chi lo ha creato vede che deve riprovare.
 */

/** Il minimo necessario: `User.create` non restituisce un documento hydratato. */
export interface Confermabile {
  _id: unknown;
  email: string;
  nome: string;
  role: string;
  emailConfermato?: boolean;
}

export interface EsitoConferma {
  esito: EsitoInvio;
  scadenza?: string;
  /** Motivo in forma piatta, comodo da mostrare al chiamante. */
  motivo?: string;
}

function appiattito(esito: EsitoInvio) {
  return esito.inviato ? undefined : esito.motivo;
}

/**
 * Invia l'email di conferma a un utente già salvato.
 *
 * Scrive con un update mirato invece di `save()`: l'utente appena creato non è
 * un documento hydratato, e toccare solo i campi della conferma evita di
 * riscrivere l'intero documento.
 *
 * Non solleva mai: il fallimento dell'invio non deve annullare la creazione
 * dell'account, che è già stato scritto.
 */
export async function inviaConfermaA(
  utente: Confermabile,
  opzioni: { passwordProvvisoria?: string; organizzazione?: string } = {},
): Promise<EsitoConferma> {
  const token = nuovoTokenConferma();
  const scadenza = new Date(Date.now() + config.brevo.confermaTtlOre * 3_600_000);
  const hash = hashTokenConferma(token);

  const esito = await inviaConfermaEmail({
    a: utente.email,
    nome: utente.nome,
    ruolo: utente.role,
    token,
    passwordProvvisoria: opzioni.passwordProvvisoria,
    organizzazione: opzioni.organizzazione,
  });

  // Se l'invio è fallito il token non viene conservato: rimarrebbe valido e
  // leggibile nei log di qualche intermediario, senza che nessuno lo abbia
  // ricevuto. Chi deve riprovare ne avrà uno nuovo.
  await User.updateOne(
    { _id: utente._id },
    esito.inviato
      ? { $set: { confermaEmailHash: hash, confermaEmailScadenza: scadenza, confermaEmailInviataIl: new Date() } }
      : { $set: { confermaEmailInviataIl: new Date() }, $unset: { confermaEmailHash: '', confermaEmailScadenza: '' } },
  );

  if (!esito.inviato) {
    logger.warn(`Conferma email non inviata a ${utente.email}: ${esito.motivo}`);
  }

  return { esito, scadenza: scadenza.toISOString(), motivo: appiattito(esito) };
}

/** Invia di nuovo la conferma, rilasciando un token nuovo. */
export async function reinviaConferma(utente: Confermabile): Promise<EsitoConferma> {
  if (utente.emailConfermato) throw badRequest('L’indirizzo email è già confermato');
  return inviaConfermaA(utente);
}

/**
 * Consuma il token e segna l'indirizzo come confermato.
 *
 * Il token non viene firmato: è casuale, viene cercato tra gli hash e vale una
 * volta sola. Così non serve una terza coppia di segreti JWT per un token che
 * vive pochi giorni, e la revoca è gratuita.
 */
export async function confermaConToken(token: string) {
  if (!token || token.length < 32) throw badRequest('Token di conferma non valido');

  const utente = await User.findOne({ confermaEmailHash: hashTokenConferma(token) });
  if (!utente) throw notFound('Token di conferma non valido o già usato');

  if (utente.emailConfermato) throw badRequest('L’indirizzo email è già confermato');
  if (!utente.confermaEmailScadenza || utente.confermaEmailScadenza < new Date()) {
    throw badRequest('Il link di conferma è scaduto: richiedine uno nuovo');
  }

  utente.emailConfermato = true;
  utente.emailConfermatoIl = new Date();
  utente.confermaEmailHash = undefined;
  utente.confermaEmailScadenza = undefined;
  // Il token era a conoscenza solo di chi lo aveva ricevuto: azzerare la
  // versione revoca le sessioni aperte prima della conferma.
  utente.tokenVersion += 1;
  await utente.save();

  return utente;
}
