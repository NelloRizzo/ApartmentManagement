import { Types } from 'mongoose';
import { Comunicazione, Condominio, Condomino, User, type ComunicazioneDoc } from '../models/index.js';
import type { TIPI_COMUNICAZIONE} from '../types/domain.js';
import { type UserRole } from '../types/domain.js';
import { forbidden, notFound } from '../utils/errors.js';
import { regexDaTesto } from '../utils/pagination.js';
import { espandiAllegati } from './allegato.service.js';

export interface FiltroComunicazione {
  condominio?: string;
  bandiera: 'posta' | 'inviate' | 'bozze' | 'tutte';
  tipo?: string;
  stato?: string;
  search?: string;
  page: number;
  limit: number;
  sort: string;
  order: 'asc' | 'desc';
}

/**
 * Visibilità: un admin/portiere vede tutto ciò che riguarda il proprio condominio;
 * un condomino vede le comunicazioni indirizzate a lui o inviate a tutte le
 * unità di cui è titolare, più le proprie e i thread in cui partecipa.
 */
export function filtroVisibilita(utenteId: string, role: UserRole, unitaIds: string[]): Record<string, unknown> {
  if (role === 'admin' || role === 'portiere') return {};

  const id = new Types.ObjectId(String(utenteId));
  const unita = unitaIds.map((u) => new Types.ObjectId(String(u)));

  return {
    $or: [
      { destinatario: id },
      { mittente: id },
      { destinatari: id },
      ...(unita.length ? [{ unita: { $in: unita } }] : []),
    ],
  };
}

export async function unitaDiCondomino(utenteId: string): Promise<string[]> {
  const legs = await Condomino.find({ utente: utenteId, attivo: true }).select('unita').lean();
  return [...new Set(legs.flatMap((l) => l.unita.map(String)))];
}

/**
 * Quante comunicazioni indirizzate a me non ho ancora aperto.
 *
 * Tre cose che il conteggio deve fare e non faceva:
 *
 * - **usare `lettaDa`, non `stato`.** `stato` è un campo unico della
 *   comunicazione e `segnaLetta` lo porta a `'letta'` per tutti: bastava che
 *   l'amministratore aprisse un avviso perché il contatore del condòmino
 *   tornasse a zero senza che lui l'avesse mai visto. `lettaDa` è un array per
 *   utente ed esiste già, ma nessuna query lo usava.
 * - **partire da `filtroVisibilita`**, come la lista: le broadcast per
 *   condominio hanno il destinatario in `unita`, e senza quello il contatore era
 *   più basso della lista che l'utente vedeva. riusare la stessa funzione evita
 *   che i due divergano in futuro.
 * - **trovarsi dentro il condominio selezionato**: senza, un amministratore con
 *   dieci stabili vedeva la somma di tutti e il pallino non cambiava passando da
 *   uno all'altro.
 *
 * Le bozze sono escluse perché non sono arrivate a nessuno, e le proprie
 * comunicazioni perché non è una posta in arrivo.
 */
export async function contaNonLette(
  utenteId: string,
  role: UserRole,
  condominioId: string,
): Promise<number> {
  const id = new Types.ObjectId(String(utenteId));
  return Comunicazione.countDocuments({
    $and: [
      filtroVisibilita(utenteId, role, await unitaDiCondomino(utenteId)),
      { condominio: new Types.ObjectId(String(condominioId)) },
      { mittente: { $ne: id } },
      { stato: { $ne: 'bozza' } },
      { lettaDa: { $ne: id } },
    ],
  });
}

export async function listComunicazioni(
  utenteId: string,
  role: UserRole,
  filtri: FiltroComunicazione,
): Promise<{ dati: unknown[]; totale: number; page: number; limit: number }> {
  const query: Record<string, unknown> = { ...filtroVisibilita(utenteId, role, await unitaDiCondomino(utenteId)) };

  if (filtri.condominio) query.condominio = new Types.ObjectId(filtri.condominio);
  if (filtri.tipo) query.tipo = filtri.tipo;
  if (filtri.stato) query.stato = filtri.stato;

  switch (filtri.bandiera) {
    case 'posta':
      query.mittente = { $ne: new Types.ObjectId(String(utenteId)) };
      query.stato = { $in: ['inviata', 'letta'] };
      break;
    case 'inviate':
      query.mittente = new Types.ObjectId(String(utenteId));
      break;
    case 'bozze':
      query.mittente = new Types.ObjectId(String(utenteId));
      query.stato = 'bozza';
      break;
    default:
      break;
  }

  if (filtri.search) {
    const rx = regexDaTesto(filtri.search);
    query.$and = [{ $or: [{ oggetto: rx }, { corpo: rx }] }];
  }

  const skip = (filtri.page - 1) * filtri.limit;
  const direzione = filtri.order === 'asc' ? 1 : -1;
  const [documenti, totale] = await Promise.all([
    Comunicazione.find(query)
      .populate('mittente', 'nome cognome email')
      .populate('destinatario', 'nome cognome email')
      .sort({ [filtri.sort]: direzione })
      .skip(skip)
      .limit(filtri.limit)
      .lean(),
    Comunicazione.countDocuments(query),
  ]);

  // Gli allegati viaggiano come id: qui diventano descrittori con URL firmato
  // fresco, in una query sola per tutta la pagina.
  return { dati: await espandiAllegati(documenti), totale, page: filtri.page, limit: filtri.limit };
}

export async function segnaLetta(id: string, utenteId: string): Promise<ComunicazioneDoc> {
  const doc = await Comunicazione.findByIdAndUpdate(
    id,
    {
      $set: { stato: 'letta', dataLettura: new Date() },
      $addToSet: { lettaDa: new Types.ObjectId(String(utenteId)) },
    },
    { new: true },
  );
  if (!doc) throw notFound('Comunicazione non trovata');
  return doc;
}

/** Costruisce una comunicazione standard con i valori coerenti per tipo e stato. */
export function preparaComunicazione(input: {
  mittente: string;
  condominio?: string;
  tipo: (typeof TIPI_COMUNICAZIONE)[number];
  oggetto: string;
  corpo: string;
  destinatario?: string;
  destinatari?: string[];
  unita?: string[];
  threadId?: string;
  rispostaA?: string;
  richiedeRisposta?: boolean;
  allegati?: string[];
  /** `true` se l'autore ha chiesto di fermarsi a una bozza. */
  salvaComeBozza?: boolean;
}): Partial<ComunicazioneDoc> {
  const daAmministratore = input.tipo === 'avviso' || input.tipo === 'convocazione';
  // Un avviso o una convocazione sono recapitati appena creati. Tutto il resto
  // parte solo se l'autore non ha chiesto una bozza: senza questo controllo la
  // richiesta del condòmino resterebbe in bozza per sempre, perché non ha un
  // secondo passo che la spedisce.
  const daSpedire = daAmministratore || input.salvaComeBozza === false;
  return {
    mittente: new Types.ObjectId(String(input.mittente)),
    condominio: input.condominio ? new Types.ObjectId(String(input.condominio)) : undefined,
    tipo: input.tipo,
    stato: daSpedire ? 'inviata' : 'bozza',
    dataInvio: daSpedire ? new Date() : undefined,
    oggetto: input.oggetto,
    corpo: input.corpo,
    destinatario: input.destinatario ? new Types.ObjectId(String(input.destinatario)) : undefined,
    destinatari: (input.destinatari ?? []).map((d) => new Types.ObjectId(String(d))),
    unita: (input.unita ?? []).map((u) => new Types.ObjectId(String(u))),
    threadId: input.threadId ? new Types.ObjectId(String(input.threadId)) : undefined,
    rispostaA: input.rispostaA ? new Types.ObjectId(String(input.rispostaA)) : undefined,
    richiedeRisposta: input.richiedeRisposta ?? false,
    // Solo gli id: i metadati e l'URL firmato si rileggono da `Allegato` a ogni
    // richiesta, perché l'URL vale 24 ore e nel documento invecchierebbe.
    allegati: (input.allegati ?? []).map((a) => new Types.ObjectId(a)),
  };
}

/**
 * Amministratore titolare di un condominio.
 *
 * È il destinatario obbligato di tutto ciò che scrive un condòmino: senza questo
 * aiuto il pannello del condòmino non avrebbe modo di scegliere a chi scrivere,
 * e il messaggio non potrebbe essere recapitato.
 */
export async function amministratoriDiCondominio(condominioId: string): Promise<string[]> {
  const condominio = await Condominio.findById(condominioId).select('amministratore').lean();
  return condominio ? [String(condominio.amministratore)] : [];
}

export async function destinatariDiUnita(
  condominioId: string,
  unitaIds: string[],
): Promise<string[]> {
  if (unitaIds.length === 0) return [];
  const legs = await Condomino.find({
    condominio: condominioId,
    attivo: true,
    unita: { $in: unitaIds.map((u) => new Types.ObjectId(String(u))) },
  })
    .select('utente')
    .lean();
  return [...new Set(legs.map((l) => String(l.utente)))];
}

export async function utenteEsiste(id: string): Promise<boolean> {
  const found = await User.exists({ _id: id });
  return found !== null;
}

export async function assicuraAccesso(
  comunicazione: { mittente?: unknown; destinatario?: unknown; destinatari?: unknown[] },
  utenteId: string,
  role: UserRole,
): Promise<void> {
  if (role === 'admin' || role === 'portiere') return;
  const id = String(utenteId);
  const coinvolto =
    String(comunicazione.mittente ?? '') === id ||
    String(comunicazione.destinatario ?? '') === id ||
    (comunicazione.destinatari ?? []).some((d) => String(d) === id);
  if (!coinvolto) throw forbidden('Comunicazione non accessibile');
}
