import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, noContent, paginated } from '../utils/http.js';
import { getObjectId, paginazioneDa, regexDaTesto } from '../utils/pagination.js';
import { notFound } from '../utils/errors.js';
import { Attivita, User, type AttivitaDoc, type ColoreAttivita, type UserDoc } from '../models/index.js';
import { currentUser } from '../middleware/auth.js';
import { auditLog } from '../services/audit.service.js';
import {
  assicuraAssegnatari,
  assicuraCreatore,
  assicuraPadreValido,
  assicuraProprietario,
  assicuraPuoSegnareFatto,
  filtroThread,
  filtroVisibile,
  getVisibileOrThrow,
  teamDi,
  visibileA,
} from '../services/attivita.service.js';

const oid = (v: string | Types.ObjectId): Types.ObjectId => new Types.ObjectId(String(v));
const campiUtente = 'nome cognome email';
/** Id inesistente per un campo obbligatorio che il popolamento non ha trovato. */
const idAssente = oid('000000000000000000000000');

/** Forma di `proprietario` e `assegnatari` dopo il popolamento degli utenti. */
interface UtentePopolato {
  _id: Types.ObjectId;
  nome: string;
  cognome: string;
  email?: string;
}

interface AttivitaPopolata extends Omit<AttivitaDoc, 'proprietario' | 'assegnatari' | 'fattoDa'> {
  proprietario: UtentePopolato | null;
  assegnatari: UtentePopolato[];
  fattoDa?: UtentePopolato | null;
}

/**
 * Riduce un'attività popolata alla forma grezza per la regola di visibilità.
 *
 * `visibileA` confronta id, e su un documento popolato `proprietario` è un
 * oggetto: `String({})` darebbe `[object Object]` e il confronto fallirebbe
 * sempre. Riportare ai due id evita di duplicare la regola nel controller,
 * che è il posto dove si sbaglia.
 */
function perLaVisibilita(doc: AttivitaPopolata): AttivitaDoc {
  return {
    ...doc,
    proprietario: doc.proprietario ? oid(doc.proprietario._id) : idAssente,
    assegnatari: (doc.assegnatari ?? []).map((u) => oid(String(u._id))),
  } as AttivitaDoc;
}

function riepilogo(doc: AttivitaPopolata, utenteId: string) {
  const nomeCompleto = (u: { nome: string; cognome: string }) => `${u.nome} ${u.cognome}`.trim();
  return {
    _id: doc._id,
    titolo: doc.titolo,
    descrizione: doc.descrizione,
    proprietario: doc.proprietario
      ? {
          id: String(doc.proprietario._id),
          nome: doc.proprietario.nome,
          cognome: doc.proprietario.cognome,
          nomeCompleto: nomeCompleto(doc.proprietario),
        }
      : null,
    assegnatari: (doc.assegnatari ?? []).map((u) => ({
      id: String(u._id),
      nome: u.nome,
      cognome: u.cognome,
      nomeCompleto: nomeCompleto(u),
    })),
    parent: doc.parent ?? null,
    milestone: doc.milestone,
    colore: doc.colore ?? null,
    dataInizio: doc.dataInizio ?? null,
    dataFine: doc.dataFine ?? null,
    fatto: doc.fatto,
    fattoDa: doc.fattoDa ? { id: String(doc.fattoDa._id), ...doc.fattoDa, nomeCompleto: nomeCompleto(doc.fattoDa) } : null,
    fattoIl: doc.fattoIl ?? null,
    /** Sono il proprietario: solo io posso modificare ed eliminare. */
    sonoProprietario: String(doc.proprietario?._id ?? '') === utenteId,
    /** Mi è stata affidata: posso segnarla come fatta. */
    assegnatoAMe: (doc.assegnatari ?? []).some((u) => String(u._id) === utenteId),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Bacheca: le attività di primo livello che l'utente può vedere.
 *
 * Le voci di un thread non compaiono qui: hanno il proprio elenco sotto
 * l'attività che le contiene, altrimenti la bacheca si riempirebbe di righe senza
 * relazione con la card su cui si clicca.
 */
export const list = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const q = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    sort: string;
    order: 'asc' | 'desc';
    stato: 'tutte' | 'aperta' | 'fatta';
    soloAssegnate: boolean;
  };
  const { page, limit, sort, order } = paginazioneDa(q, 'dataFine');

  const query: Record<string, unknown> = {
    // `parent: null` e non `$exists: false`: in Mongoose è la stessa cosa, ma la
    // forma esplicita si legge meglio.
    parent: null,
    ...filtroVisibile(utente.sub),
  };
  if (q.stato !== 'tutte') query.fatto = q.stato === 'fatta';

  if (q.soloAssegnate) {
    // "Assegnate a me": escludo le mie, che non sono un compito ricevuto. Insieme
    // all'$or` della visibilità la query si riduce a "assegnata a me e non mia".
    query.assegnatari = oid(utente.sub);
    query.proprietario = { $ne: oid(utente.sub) };
  }

  if (q.search) {
    query.$and = [{ $or: [{ titolo: regexDaTesto(q.search) }, { descrizione: regexDaTesto(q.search) }] }];
  }

  const [documenti, totale] = await Promise.all([
    Attivita.find(query)
      .populate<{ proprietario: UtentePopolato }>('proprietario', campiUtente)
      .populate<{ assegnatari: UtentePopolato[] }>('assegnatari', campiUtente)
      .populate<{ fattoDa: UtentePopolato }>('fattoDa', campiUtente)
      .sort({ [sort]: order === 'asc' ? 1 : -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<AttivitaPopolata[]>(),
    Attivita.countDocuments(query),
  ]);

  paginated(res, documenti.map((d) => riepilogo(d, utente.sub)), totale, page, limit);
});

export const getOne = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const id = getObjectId(req.params.id ?? '', 'id');

  const doc = await Attivita.findById(id)
    .populate<{ proprietario: UtentePopolato }>('proprietario', campiUtente)
    .populate<{ assegnatari: UtentePopolato[] }>('assegnatari', campiUtente)
    .populate<{ fattoDa: UtentePopolato }>('fattoDa', campiUtente)
    .lean<AttivitaPopolata | null>();
  if (!doc || !visibileA(perLaVisibilita(doc), utente.sub)) throw notFound('Attività non trovata');

  ok(res, riepilogo(doc, utente.sub));
});

/**
 * Le voci dell'attività, e solo quelle visibili a chi guarda.
 *
 * La radice del thread deve essere visibile: è il gate. Poi vale il filtro della
 * bacheca, così un assistente vede nella card solo le voci a lui assegnate e non
 * quelle di un collega.
 */
export const thread = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const id = getObjectId(req.params.id ?? '', 'id');

  const radice = await getVisibileOrThrow(id, { id: utente.sub });
  const voci = await Attivita.find(filtroThread(String(radice._id), { id: utente.sub }))
    .populate<{ proprietario: UtentePopolato }>('proprietario', campiUtente)
    .populate<{ assegnatari: UtentePopolato[] }>('assegnatari', campiUtente)
    .populate<{ fattoDa: UtentePopolato }>('fattoDa', campiUtente)
    .sort({ createdAt: 1 })
    .lean<AttivitaPopolata[]>();

  ok(res, voci.map((v) => riepilogo(v, utente.sub)));
});

export const crea = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const body = req.body as {
    titolo: string;
    descrizione: string;
    assegnatari: string[];
    parent?: string;
    milestone: boolean;
    colore?: ColoreAttivita | null;
    dataInizio?: Date;
    dataFine?: Date;
  };

  await assicuraCreatore({ id: utente.sub });
  const assegnatari = await assicuraAssegnatari(utente.sub, body.assegnatari ?? []);
  const parent = await assicuraPadreValido(body.parent);

  const attivita = await Attivita.create({
    titolo: body.titolo,
    descrizione: body.descrizione ?? '',
    // Il proprietario è chi crea: non arriva dal client, altrimenti si potrebbe
    // creare un'attività intestata a un altro.
    proprietario: utente.sub,
    assegnatari,
    parent: parent ?? undefined,
    milestone: body.milestone ?? false,
    colore: body.colore ?? null,
    dataInizio: body.dataInizio,
    dataFine: body.dataFine,
  });

  await auditLog({
    attore: utente.sub,
    azione: 'creazione_attivita',
    entita: 'Attivita',
    entitaId: String(attivita._id),
    dettagli: {
      titolo: attivita.titolo,
      assegnatari: assegnatari.map(String),
      parent: parent ? String(parent) : null,
    },
    req,
  });

  const popolata = await Attivita.findById(attivita._id)
    .populate<{ proprietario: UtentePopolato }>('proprietario', campiUtente)
    .populate<{ assegnatari: UtentePopolato[] }>('assegnatari', campiUtente)
    .lean<AttivitaPopolata | null>();
  if (!popolata) throw notFound('Attività non trovata');

  created(res, riepilogo(popolata, utente.sub));
});

export const aggiorna = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const id = getObjectId(req.params.id ?? '', 'id');
  const esistente = await getVisibileOrThrow(id, { id: utente.sub });
  assicuraProprietario(esistente, { id: utente.sub });

  const body = req.body as {
    titolo: string;
    descrizione: string;
    assegnatari: string[];
    colore?: ColoreAttivita | null;
    dataInizio?: Date;
    dataFine?: Date;
  };

  const aggiornata = await Attivita.findOneAndUpdate(
    { _id: id, proprietario: utente.sub },
    {
      $set: {
        titolo: body.titolo,
        descrizione: body.descrizione ?? '',
        assegnatari: await assicuraAssegnatari(utente.sub, body.assegnatari ?? []),
        colore: body.colore ?? null,
        dataInizio: body.dataInizio,
        dataFine: body.dataFine,
      },
    },
    { new: true },
  )
    .populate<{ proprietario: UtentePopolato }>('proprietario', campiUtente)
    .populate<{ assegnatari: UtentePopolato[] }>('assegnatari', campiUtente)
    .lean<AttivitaPopolata | null>();

  if (!aggiornata) throw notFound('Attività non trovata');

  await auditLog({
    attore: utente.sub,
    azione: 'modifica_attivita',
    entita: 'Attivita',
    entitaId: String(aggiornata._id),
    dettagli: { titolo: aggiornata.titolo },
    req,
  });

  ok(res, riepilogo(aggiornata, utente.sub));
});

/**
 * Segna "fatto" o torna indietro.
 *
 * Non è un `PATCH` qualunque del campo: chi può premere il pulsante dipende dal
 * documento, e il controllo sta in `assicuraPuoSegnareFatto`.
 */
export const segnaFatto = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const id = getObjectId(req.params.id ?? '', 'id');
  const esistente = await getVisibileOrThrow(id, { id: utente.sub });
  assicuraPuoSegnareFatto(esistente, { id: utente.sub });

  const { fatto } = req.body as { fatto: boolean };

  // `fattoDa` e `fattoIl` si scrivono solo quando si segna come fatta: tornando
  // indietro non ha senso conservare chi e quando.
  const aggiornata = await Attivita.findByIdAndUpdate(
    id,
    { $set: { fatto, fattoDa: fatto ? utente.sub : null, fattoIl: fatto ? new Date() : null } },
    { new: true },
  )
    .populate<{ proprietario: UtentePopolato }>('proprietario', campiUtente)
    .populate<{ assegnatari: UtentePopolato[] }>('assegnatari', campiUtente)
    .populate<{ fattoDa: UtentePopolato }>('fattoDa', campiUtente)
    .lean<AttivitaPopolata | null>();

  if (!aggiornata) throw notFound('Attività non trovata');

  await auditLog({
    attore: utente.sub,
    azione: fatto ? 'attivita_completata' : 'attivita_riaperta',
    entita: 'Attivita',
    entitaId: String(aggiornata._id),
    req,
  });

  ok(res, riepilogo(aggiornata, utente.sub));
});

/**
 * Eliminazione esplicita: è l'unico modo in cui un'attività sparisce, anche se è
 * stata completata.
 *
 * Le voci del thread non vengono cancellate in cascata. Elimino il padre, il
 * client chiede prima `GET /:id/thread` e propone di eliminare anche le voci, una
 * richiesta alla volta: una cancellazione silenziosa dei figli sarebbe perdita di
 * dati non annunciata.
 */
export const elimina = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const id = getObjectId(req.params.id ?? '', 'id');
  const esistente = await getVisibileOrThrow(id, { id: utente.sub });
  assicuraProprietario(esistente, { id: utente.sub });

  await Attivita.deleteOne({ _id: id, proprietario: utente.sub });

  await auditLog({
    attore: utente.sub,
    azione: 'eliminazione_attivita',
    entita: 'Attivita',
    entitaId: String(id),
    dettagli: { titolo: esistente.titolo, fatta: esistente.fatto },
    req,
  });

  noContent(res);
});

/**
 * Il team di cui l'utente è proprietario, per il form di assegnazione.
 *
 * Esposto a parte perché la UI deve poter scegliere i destinatari senza derivare
 * "il mio team" da `GET /staff/assistenti`, che legge un'altra fonte.
 */
export const listTeam = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const ids = await teamDi(utente.sub);
  if (ids.length === 0) {
    ok(res, []);
    return;
  }

  const assistenti = await User.find({ _id: { $in: ids } })
    .select('nome cognome email')
    .sort({ cognome: 1 })
    .lean<Pick<UserDoc, '_id' | 'nome' | 'cognome' | 'email'>[]>();

  ok(
    res,
    assistenti.map((a) => ({
      id: String(a._id),
      nome: a.nome,
      cognome: a.cognome,
      nomeCompleto: `${a.nome} ${a.cognome}`.trim(),
      email: a.email,
    })),
  );
});