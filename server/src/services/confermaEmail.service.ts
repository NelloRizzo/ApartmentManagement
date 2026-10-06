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
  return inviaConfermaConToken(
    utente,
    nuovoTokenConferma(),
    opzioni.passwordProvvisoria,
    opzioni.organizzazione,
  );
}

/**
 * Come `inviaConfermaA`, ma con un token deciso da chi chiama.
 *
 * Serve al cambio di indirizzo, che ha bisogno del token per l'avviso all'utente:
 * il cambio e l'avviso devono parlare dello stesso link, altrimenti la casella
 * vecchia riceverebbe un token che non è quello appena inviato.
 */
export async function inviaConfermaConToken(
  utente: Confermabile,
  token: string,
  passwordProvvisoria?: string,
  organizzazione?: string,
): Promise<EsitoConferma> {
  const scadenza = new Date(Date.now() + config.brevo.confermaTtlOre * 3_600_000);
  const hash = hashTokenConferma(token);

  const esito = await inviaConfermaEmail({
    a: utente.email,
    nome: utente.nome,
    ruolo: utente.role,
    token,
    passwordProvvisoria,
    organizzazione,
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
 *
 * Con un cambio di indirizzo in corso il token conferma **il nuovo**: lo scambio
 * avviene qui, e non in un secondo passaggio, perché il link viaggia per email e
 * l'utente non deve fare nulla.
 */
export async function confermaConToken(token: string) {
  if (!token || token.length < 32) throw badRequest('Token di conferma non valido');

  const utente = await User.findOne({ confermaEmailHash: hashTokenConferma(token) });
  if (!utente) throw notFound('Token di conferma non valido o già usato');

  if (!utente.confermaEmailScadenza || utente.confermaEmailScadenza < new Date()) {
    throw badRequest('Il link di conferma è scaduto: richiedine uno nuovo');
  }

  if (utente.emailInAttesa) {
    utente.email = utente.emailInAttesa;
    utente.emailInAttesa = undefined;
    utente.emailConfermato = true;
    utente.emailConfermatoIl = new Date();
    utente.confermaEmailHash = undefined;
    utente.confermaEmailScadenza = undefined;
    // Niente `tokenVersion`: l'indirizzo non è una credenziale di sessione e
    // l'account non ha mai perso validità, quindi non c'è motivo di far uscire
    // chi ci sta lavorando.
    await utente.save();
    return utente;
  }

  if (utente.emailConfermato) throw badRequest('L’indirizzo email è già confermato');

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
