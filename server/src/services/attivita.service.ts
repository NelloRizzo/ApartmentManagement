import { Types, type FilterQuery } from 'mongoose';
import { Attivita, Condominio, User, type AttivitaDoc } from '../models/index.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import type { UserRole } from '../types/domain.js';

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

/** Il personale che serve uno stabile di questo amministratore. */
export async function portieriDi(proprietarioId: string, condominioId: string): Promise<string[]> {
  const stabile = await Condominio.findOne({ _id: oid(condominioId), amministratore: oid(proprietarioId) })
    .select('_id')
    .lean();
  if (!stabile) return [];

  const portieri = await User.find({ role: 'portiere', attivo: true, condominiServito: stabile._id })
    .select('_id')
    .lean<{ _id: Types.ObjectId }[]>();
  return portieri.map((p) => String(p._id));
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
 * Valida gli assegnatari e stabilisce a quale stabile si riferisce l'attività.
 *
 * Serve perché l'id arriva dal client: senza questo controllo si potrebbe
 * assegnare un'attività a chiunque, compreso il superadmin, che non è del team e
 * non potrebbe vederla.
 *
 * Gli assegnatari sono due popolazioni diverse. Gli assistenti sono del team e non
 * hanno uno stabile: lavorano su tutto il portafoglio. I portieri invece servono
 * **un** stabile, quindi se entrano nell'elenco l'attività viene legata a quello e
 * non a un altro scelto a caso: è la condizione che impedisce all'amministratore
 * di cinque stabili di affidare il compito di uno al portiere di un altro. Il
 * portiere che riceve un compito non porta con sé il proprio stabile nei campi
 * dell'attività, ci arriva perché gliel'ha risolto il controllo.
 */
export async function assicuraAssegnatari(
  proprietarioId: string,
  assegnatari: string[],
  condominio?: string,
): Promise<{ assegnatari: Types.ObjectId[]; condominio?: Types.ObjectId }> {
  const scelto = condominio ? oid(condominio) : undefined;
  const unici = [...new Set(assegnatari.map(String))];
  if (unici.length === 0) return { assegnatari: [], condominio: scelto };

  const team = await teamDi(proprietarioId);
  const candidati = unici.filter((a) => !team.includes(a));
  if (candidati.length === 0) return { assegnatari: unici.map(oid), condominio: scelto };

  const portieri = await User.find({ _id: { $in: candidati.map(oid) }, role: 'portiere' })
    .select('_id condominiServito')
    .lean<{ _id: Types.ObjectId; condominiServito?: Types.ObjectId[] }[]>();
  const idPortieri = new Set(portieri.map((p) => String(p._id)));
  const nonValidi = candidati.filter((c) => !idPortieri.has(c));
  if (nonValidi.length > 0) {
    throw badRequest('Alcuni destinatari non sono del team di questo amministratore né portieri di un suo stabile', {
      nonValidi,
    });
  }

  // Il portiere porta con sé il legame in `condominiServito`. Se ne servisse più di
  // uno non sapremmo a quale stabile riferire l'attività, quindi il compito non
  // viene accettato: è più honesto far rimettere a posto il legame.
  const serviti = [
    ...new Set(portieri.flatMap((p) => (p.condominiServito ?? []).map(String))),
  ];
  if (serviti.length !== 1) {
    throw badRequest(
      serviti.length === 0
        ? 'Nessuno di questi portieri è collegato a uno stabile'
        : 'Un portiere collegato a più stabili non può ricevere compiti: correggi il suo incarico',
    );
  }

  const stabile = await Condominio.findOne({ _id: serviti[0], amministratore: oid(proprietarioId) })
    .select('_id')
    .lean();
  if (!stabile) {
    throw badRequest('Nessuno di questi portieri serve uno stabilo tuo');
  }
  if (scelto && String(scelto) !== String(stabile._id)) {
    throw badRequest('L’attività è già legata a uno stabile diverso da quello del portiere', {
      stabileDellAttivita: String(scelto),
      stabileDelPortiere: String(stabile._id),
    });
  }

  return { assegnatari: unici.map(oid), condominio: stabile._id };
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
  const autore = await User.findById(utente.id)
    .select('delegatoDa role')
    .lean<{ delegatoDa?: Types.ObjectId; role: UserRole }>();
  if (!autore) throw notFound('Utente non trovato');
  if (autore.role === 'portiere') {
    throw forbidden('Il personale dello stabile riceve i compiti, non li crea');
  }
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