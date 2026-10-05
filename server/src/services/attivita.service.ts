import { Types, type FilterQuery } from 'mongoose';
import { Attivita, User, type AttivitaDoc } from '../models/index.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';

/**
 * Attività della bacheca del team.
 *
 * Qui stanno le regole che nessun guard di permesso può esprimere, perché
 * riguardano il documento e non il ruolo:
 *
 * - l'attività è visibile al proprietario e agli assegnatari, e a nessun altro;
 * - solo il proprietario modifica ed elimina;
 * - solo il proprietario o un assegnatario segna "fatto".
 *
 * "Non visibile" è un 404 e non un 403: confermare con un 403 che un'attività
 * esiste la rivelerebbe comunque a chi non deve vederla. Il 403 è riservato a
 * chi la vede ma non può eseguire l'operazione richiesta.
 */

/** Identificativo dell'utente corrente. Il ruolo lo controlla già `requireRole`. */
export interface Identita {
  id: string;
}

const oid = (v: string | Types.ObjectId): Types.ObjectId => new Types.ObjectId(String(v));

/** Gli assistenti creati da questo amministratore: il suo team. */
export async function teamDi(proprietarioId: string): Promise<string[]> {
  const assistenti = await User.find({ delegatoDa: oid(proprietarioId), attivo: true })
    .select('_id')
    .lean<{ _id: Types.ObjectId }[]>();
  return assistenti.map((a) => String(a._id));
}

/** Un'attività è visibile se sono il proprietario o un assegnatario. */
export function visibileA(doc: AttivitaDoc, utenteId: string): boolean {
  if (String(doc.proprietario) === utenteId) return true;
  return doc.assegnatari.some((a) => String(a) === utenteId);
}

/**
 * Filtro per le sole attività che l'utente può vedere.
 *
 * Un `$or` perché proprietario e assegnatari sono condizioni alternative: con due
 * filtri in `AND` l'amministratore non vedrebbe le proprie attività non assegnate,
 * che sono la maggior parte della bacheca.
 */
export function filtroVisibile(utenteId: string): FilterQuery<AttivitaDoc> {
  return { $or: [{ proprietario: oid(utenteId) }, { assegnatari: oid(utenteId) }] };
}

/**
 * Valida gli assegnatari contro il team.
 *
 * Serve perché l'id arriva dal client: senza questo controllo si potrebbe
 * assegnare un'attività a chiunque, compreso il superadmin, che non è del team e
 * non potrebbe vederla.
 */
export async function assicuraAssegnatari(proprietarioId: string, assegnatari: string[]): Promise<Types.ObjectId[]> {
  const unici = [...new Set(assegnatari.map(String))];
  if (unici.length === 0) return [];

  const team = await teamDi(proprietarioId);
  const fuori = unici.filter((a) => !team.includes(a));
  if (fuori.length > 0) {
    throw badRequest('Alcuni destinatari non sono assistenti di questo amministratore', { nonValidi: fuori });
  }
  return unici.map(oid);
}

/**
 * Carica un'attività e ne verifica la visibilità.
 *
 * Vale sia per le attività sia per le voci di un thread: ciascuna ha la sua
 * visibilità, perché figlio e padre possono avere proprietari diversi.
 */
export async function getVisibileOrThrow(id: string, utente: Identita): Promise<AttivitaDoc> {
  const doc = await Attivita.findById(id);
  if (!doc || !visibileA(doc, utente.id)) throw notFound('Attività non trovata');
  return doc;
}

/** Le azioni riservate al proprietario non sono un 403 silenzioso. */
export function assicuraProprietario(doc: AttivitaDoc, utente: Identita): void {
  if (String(doc.proprietario) !== utente.id) {
    throw forbidden("Solo il proprietario dell'attività può eseguire questa operazione");
  }
}

/**
 * Segna "fatto": lo può fare il proprietario o un assegnatario.
 *
 * Il proprietario rientra sempre nell'elenco di controllo anche se non è
 * assegnatario: può aver creato l'attività e non averla passata a nessuno.
 */
export function assicuraPuoSegnareFatto(doc: AttivitaDoc, utente: Identita): void {
  if (!visibileA(doc, utente.id)) {
    throw forbidden("Solo chi ha ricevuto l'attività può segnarla come fatta");
  }
}

/**
 * Un assistente riceve i compiti, non li crea.
 *
 * `requireRole('admin')` non basta a distinguerlo: un assistente è un `admin` con
 * `delegatoDa` valorizzato, quindi passa lo stesso controllo di ruolo. Il
 * confronto è sul documento che lo identifica, non sul ruolo.
 *
 * Se un assistente non può creare attività, non ne è mai proprietario, e i
 * controlli "solo il proprietario" delle altre rotte escludono da soli le azioni
 * che non gli spettano.
 */
export async function assicuraCreatore(utente: Identita): Promise<void> {
  const autore = await User.findById(utente.id).select('delegatoDa').lean<{ delegatoDa?: Types.ObjectId }>();
  if (!autore) throw notFound('Utente non trovato');
  if (autore.delegatoDa) {
    throw forbidden("Gli assistenti ricevono le attività, non le creano");
  }
}

/**
 * Un thread è di un solo livello.
 *
 * Un'attività che ha già un padre non può diventare padre a sua volta: altrimenti
 * A → B → A e la risoluzione del thread non finisce. Si controlla il padre
 * indicato e non i fratelli, quindi due voci dello stesso padre restano valide.
 */
export async function assicuraPadreValido(parentId: string | undefined): Promise<Types.ObjectId | undefined> {
  if (!parentId) return undefined;

  const padre = await Attivita.findById(parentId).select('parent').lean<{ parent?: Types.ObjectId }>();
  if (!padre) throw notFound('Attività di riferimento non trovata');
  if (padre.parent) {
    throw badRequest("Un thread è di un solo livello: l'attività indicata è già dentro un thread");
  }
  return oid(parentId);
}

/**
 * Le voci di un'attività, filtrate per chi guarda.
 *
 * Non le restituisce tutte: una voce assegnata a un altro assistente non è
 * leggibile, e il thread di ogni utente mostra solo la parte sua.
 */
export function filtroThread(parentId: string, utente: Identita): FilterQuery<AttivitaDoc> {
  return { parent: oid(parentId), ...filtroVisibile(utente.id) };
}