import { Types } from 'mongoose';
import type { Request } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, noContent, paginated } from '../utils/http.js';
import { notFound, forbidden } from '../utils/errors.js';
import { paginazioneDa, regexDaTesto } from '../utils/pagination.js';
import { Assemblea, Condominio, Condomino, Unita } from '../models/index.js';
import { currentUser, puoEseguire } from '../middleware/auth.js';
import { auditLog } from '../services/audit.service.js';
import { buildTabella } from '../services/tabellaMillesimale.service.js';
import { calcolaQuoteMensili } from '../services/quoteVersamenti.service.js';
import type { CondominioDoc } from '../models/index.js';
import type { JwtUserPayload, Permesso } from '../types/domain.js';

const id = (v: string): Types.ObjectId => new Types.ObjectId(String(v));

/**
 * Filtro condominio per ruolo.
 *
 * Il superadmin vede tutto; l'amministratore e il suo assistente vedono i
 * condomini per cui è titolare o è stato delegato; il portiere quelli che
 * serve; il condòmino solo quelli in cui ha una posizione.
 */
async function filtroCondomini(utente: JwtUserPayload): Promise<Record<string, unknown>> {
  if (utente.role === 'superadmin') return {};
  if (utente.role === 'admin') {
    return { $or: [{ amministratore: utente.sub }, { assistenti: utente.sub }] };
  }
  if (utente.role === 'portiere') return { condominiServito: utente.sub };
  return { _id: { $in: await unitaIdToCondomini(utente.sub) } };
}

/** Condomini in cui l'utente ha un ruolo operativo. */
export async function condominiVisibili(utente: JwtUserPayload) {
  return Condominio.find(await filtroCondomini(utente)).sort({ nome: 1 }).lean();
}

async function unitaIdToCondomini(utenteId: string): Promise<Types.ObjectId[]> {
  const legs = await Condomino.find({ utente: utenteId, attivo: true }).select('condominio').lean();
  return [...new Set(legs.map((l) => l.condominio))];
}

export const list = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const q = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    sort: string;
    order: 'asc' | 'desc';
  };
  const { page, limit, sort, order } = paginazioneDa(q, 'nome');

  const query: Record<string, unknown> = { ...(await filtroCondomini(utente)) };
  if (q.search) {
    const rx = regexDaTesto(q.search);
    query.$and = [{ $or: [{ nome: rx }, { codice: rx }, { 'indirizzo.via': rx }, { 'indirizzo.citta': rx }] }];
  }

  const [documenti, totale] = await Promise.all([
    Condominio.find(query)
      .sort({ [sort]: order === 'asc' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Condominio.countDocuments(query),
  ]);

  paginated(res, documenti, totale, page, limit);
});

export const getOne = asyncHandler(async (req, res) => {
  const condominio = await Condominio.findById(req.params.condominioId).lean<CondominioDoc>();
  if (!condominio) throw notFound('Condominio non trovato');
  ok(res, condominio);
});

/** `true` se l'utente corrente può consultare l'ambito indicato. */
function leggibile(req: Request, permesso: Permesso): boolean {
  return puoEseguire(currentUser(req), permesso);
}

export const summary = asyncHandler(async (req, res) => {
  const condominioId = req.params.condominioId!;
  const now = new Date();
  const [tabella, nUnita, nCondomini, assembleeAperte, riepilogo] = await Promise.all([
    buildTabella(condominioId),
    Unita.countDocuments({ condominio: condominioId, attiva: true }),
    Condomino.countDocuments({ condominio: condominioId, attivo: true }),
    Assemblea.countDocuments({ condominio: condominioId, stato: { $in: ['convocata', 'in_corso'] } }),
    calcolaQuoteMensili(condominioId, now.getFullYear(), now.getMonth() + 1).catch(() => null),
  ]);

  ok(res, {
    unita: nUnita,
    condomini: nCondomini,
    assembleeAperte,
    morosiMeseCorrente: riepilogo?.morosi.length ?? null,
    // I totali millesimali appartengono all'ambito `tabella`: un assistente
    // delegato solo sui versamenti riceve il resto del riepilogo, ma non questi
    // numeri, che non ha il permesso di consultare.
    ...(leggibile(req, 'tabella:leggere')
      ? {
          tabella: {
            revisione: tabella.revisione,
            valida: tabella.valida,
            totaleDiritto: tabella.totale.diritto,
            delibera: tabella.delibera,
          },
        }
      : {}),
  });
});

export const create = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  // Il permesso è già verificato dalla rotta; qui basta il vincolo sul ruolo.
  if (utente.role !== 'admin' && utente.role !== 'superadmin') {
    throw forbidden('Solo un amministratore può creare un condominio');
  }

  const condominio = await Condominio.create({ ...req.body, amministratore: utente.sub });
  await auditLog({
    condominio: String(condominio._id),
    attore: utente.sub,
    azione: 'creazione',
    entita: 'Condominio',
    entitaId: String(condominio._id),
    req,
  });
  created(res, condominio);
});

export const update = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const condominio = await Condominio.findOneAndUpdate(
    { _id: req.params.condominioId, amministratore: utente.sub },
    req.body,
    { new: true, runValidators: true },
  );
  if (!condominio) throw notFound('Condominio non trovato o non amministrato da te');
  await auditLog({
    condominio: String(condominio._id),
    attore: utente.sub,
    azione: 'aggiornamento',
    entita: 'Condominio',
    entitaId: String(condominio._id),
    dettagli: req.body,
    req,
  });
  ok(res, condominio);
});

export const remove = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const [nUnita, nAssemblee] = await Promise.all([
    Unita.countDocuments({ condominio: id(req.params.condominioId!) }),
    Assemblea.countDocuments({ condominio: id(req.params.condominioId!) }),
  ]);
  if (nUnita > 0 || nAssemblee > 0) {
    throw forbidden('Impossibile eliminare un condominio che ha unità o assemblee: procedi con la disattivazione');
  }
  const risultato = await Condominio.deleteOne({ _id: req.params.condominioId, amministratore: utente.sub });
  if (risultato.deletedCount === 0) throw notFound('Condominio non trovato');
  noContent(res);
});

/** Assegna un portiere/servizio al condominio. */
export const addServizio = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const { utenteId } = req.body as { utenteId: string };
  const condominio = await Condominio.findOneAndUpdate(
    { _id: req.params.condominioId, amministratore: utente.sub },
    { $addToSet: { condominiServito: id(utenteId) } },
    { new: true },
  );
  if (!condominio) throw notFound('Condominio non trovato');
  ok(res, condominio.condominiServito.map(String));
});

export const removeServizio = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const condominio = await Condominio.findOneAndUpdate(
    { _id: req.params.condominioId, amministratore: utente.sub },
    { $pull: { condominiServito: id(req.params.utenteId!) } },
    { new: true },
  );
  if (!condominio) throw notFound('Condominio non trovato');
  ok(res, condominio.condominiServito.map(String));
});
