import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, noContent, paginated } from '../utils/http.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { paginazioneDa, regexDaTesto } from '../utils/pagination.js';
import { Condomino, Condominio, Unita, User, type UnitaRiepilogo, type UtenteRiepilogo } from '../models/index.js';
import { currentUser } from '../middleware/auth.js';
import { auditLog } from '../services/audit.service.js';
import { buildTabella, quotaDiUnita } from '../services/tabellaMillesimale.service.js';
import { passwordTemporanea } from '../services/ruolo.service.js';
import { inviaConfermaA } from '../services/confermaEmail.service.js';

const oid = (v: string): Types.ObjectId => new Types.ObjectId(String(v));

interface CondominoPopolato {
  _id: Types.ObjectId;
  condominio: Types.ObjectId;
  regime: string;
  quota: number;
  primario: boolean;
  attivo: boolean;
  dataInizio: Date;
  dataFine: Date | null;
  note?: string;
  utente: UtenteRiepilogo;
  unita: UnitaRiepilogo[];
  createdAt: Date;
  updatedAt: Date;
}

/** Condomini in cui l'utente compare come condòmino attivo. */
export async function condominiDiUtente(utenteId: string): Promise<string[]> {
  const legs = await Condomino.find({ utente: utenteId, attivo: true }).select('condominio').lean();
  return [...new Set(legs.map((l) => String(l.condominio)))];
}

export const list = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const q = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    sort: string;
    order: 'asc' | 'desc';
    attivo?: boolean;
    regime?: string;
  };
  const { page, limit, sort, order } = paginazioneDa(q, 'utente.cognome');

  const query: Record<string, unknown> = { condominio: oid(req.params.condominioId!) };
  if (utente.role === 'condomino') {
    // Un condòmino vede solo se stesso e i comproprietari delle sue unità.
    const mie = await Condomino.find({ condominio: req.params.condominioId, utente: utente.sub, attivo: true })
      .select('unita')
      .lean();
    const mieUnita = mie.flatMap((m) => m.unita);
    query.$or = [{ utente: utente.sub }, { unita: { $in: mieUnita.length ? mieUnita : [new Types.ObjectId()] } }];
  }
  if (q.attivo !== undefined) query.attivo = q.attivo;
  if (q.regime) query.regime = q.regime;

  if (q.search) {
    // `utente` è un riferimento: non si può filtrare con 'utente.nome'. Si
    // cercano prima gli id corrispondenti e poi si restringe il filtro su `utente`.
    const rx = regexDaTesto(q.search);
    const corrispondenze = await User.find({ $or: [{ nome: rx }, { cognome: rx }, { email: rx }] })
      .select('_id')
      .lean();
    query.utente = { $in: corrispondenze.map((u) => u._id) };
    if (corrispondenze.length === 0) {
      paginated(res, [], 0, page, limit);
      return;
    }
  }

  const [documenti, totale] = await Promise.all([
    Condomino.find(query)
      .populate<{ utente: UtenteRiepilogo }>('utente', 'nome cognome email telefono attivo')
      .populate<{ unita: UnitaRiepilogo[] }>('unita', 'codice piano tipo')
      .sort({ [sort]: order === 'asc' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean<CondominoPopolato[]>(),
    Condomino.countDocuments(query),
  ]);

  const tabella = await buildTabella(req.params.condominioId!);
  const millesimiPerUnita = new Map(tabella.righe.map((r) => [r.unitaId, r.quote.diritto]));

  paginated(
    res,
    documenti.map((d) => {
      const diritto = d.unita.reduce((s, u) => s + (millesimiPerUnita.get(String(u._id)) ?? 0), 0);
      const proprieta = d.regime === 'nuda_proprieta' ? 0.5 : 1;
      return { ...d, millesimi: Number((diritto * proprieta * ((d.quota ?? 100) / 100)).toFixed(2)) };
    }),
    totale,
    page,
    limit,
  );
});

export const getOne = asyncHandler(async (req, res) => {
  const legame = await Condomino.findOne({ _id: req.params.id, condominio: req.params.condominioId })
    .populate<{ utente: UtenteRiepilogo }>('utente', 'nome cognome email telefono attivo ultimoAccesso')
    .populate<{ unita: UnitaRiepilogo[] }>('unita', 'codice piano tipo metratura')
    .lean<CondominoPopolato>();
  if (!legame) throw notFound('Condòmino non trovato');

  const quote = await Promise.all(
    legame.unita.map(async (u) => ({ unita: u.codice, quota: await quotaDiUnita(req.params.condominioId!, String(u._id)) })),
  );

  ok(res, { ...legame, quotePerUnita: quote });
});

/** Crea o collega un utente e vi registra il legame con le unità. */
export const create = asyncHandler(async (req, res) => {
  const condominioId = req.params.condominioId!;
  const body = req.body as {
    utente?: string;
    email?: string;
    nome?: string;
    cognome?: string;
    telefono?: string;
    passwordProvvisoria?: string;
    unita: string[];
    regime: string;
    quota: number;
    primario: boolean;
    dataInizio?: Date;
    note?: string;
  };

  const unita = await Unita.find({ _id: { $in: body.unita }, condominio: condominioId }).select('_id');
  if (unita.length !== body.unita.length) throw badRequest('Una o più unità non appartengono a questo condominio');

  const esistente = await Condomino.findOne({ condominio: condominioId, utente: req.body.utente });
  if (esistente) throw conflict('Questo utente è già registrato nel condominio');

  let utenteId = body.utente;
  let conferma: Awaited<ReturnType<typeof inviaConfermaA>> | null = null;
  if (!utenteId) {
    const email = body.email!;
    const esistenteUtente = await User.findOne({ email });
    if (esistenteUtente) {
      utenteId = String(esistenteUtente._id);
    } else {
      if (!body.nome || !body.cognome) throw badRequest('Nome e cognome sono obbligatori per creare un nuovo utente');
      const password = body.passwordProvvisoria ?? passwordTemporanea('Condo');
      const nuovo = await User.create({
        email,
        nome: body.nome,
        cognome: body.cognome,
        telefono: body.telefono,
        role: 'condomino',
        password: await User.hashPassword(password),
        emailConfermato: false,
      });
      utenteId = String(nuovo._id);

      // La password provvisoria viaggia nell'email di conferma: prima finiva
      // solo nel log di audit, in chiaro, e nessuno poteva recuperarla.
      conferma = await inviaConfermaA(nuovo, {
        passwordProvvisoria: body.passwordProvvisoria ? undefined : password,
        organizzazione: 'un amministratore di condominio',
      });

      await auditLog({
        condominio: condominioId,
        attore: currentUser(req).sub,
        azione: 'creazione_utente_condomino',
        entita: 'User',
        entitaId: utenteId,
        dettagli: { email, confermaInviata: conferma.esito.inviato },
        req,
      });
    }
  }

  const legame = await Condomino.create({
    condominio: oid(condominioId),
    utente: oid(utenteId!),
    unita: body.unita.map((u) => oid(u)),
    regime: body.regime,
    quota: body.quota,
    primario: body.primario,
    dataInizio: body.dataInizio ?? new Date(),
    note: body.note,
  });

  await auditLog({
    condominio: condominioId,
    attore: currentUser(req).sub,
    azione: 'creazione',
    entita: 'Condomino',
    entitaId: String(legame._id),
    dettagli: { unita: body.unita, regime: body.regime },
    req,
  });

  created(res, {
    legame: await legame.populate('utente', 'nome cognome email'),
    // Se l'email non è partita la password va consegnata a mano.
    ...(conferma && !conferma.esito.inviato && !body.passwordProvvisoria
      ? { passwordDaConsegnare: true, motivoInvio: conferma.motivo ?? null }
      : {}),
    conferma: {
      inviata: conferma?.esito.inviato ?? false,
      motivo: conferma?.motivo ?? null,
    },
  });
});

export const update = asyncHandler(async (req, res) => {
  const aggiornato = await Condomino.findOneAndUpdate(
    { _id: req.params.id, condominio: req.params.condominioId },
    req.body,
    { new: true, runValidators: true },
  ).populate('utente', 'nome cognome email telefono');

  if (!aggiornato) throw notFound('Condòmino non trovato');
  ok(res, aggiornato);
});

export const remove = asyncHandler(async (req, res) => {
  const legame = await Condomino.findOne({ _id: req.params.id, condominio: req.params.condominioId });
  if (!legame) throw notFound('Condòmino non trovato');

  // Se non ha più unità, il legame viene rimosso; altrimenti viene solo disattivato.
  if (legame.unita.length <= 1) {
    await Condomino.deleteOne({ _id: legame._id });
  } else {
    legame.attivo = false;
    legame.dataFine = new Date();
    await legame.save();
  }

  await auditLog({
    condominio: req.params.condominioId,
    attore: currentUser(req).sub,
    azione: 'disattivazione',
    entita: 'Condomino',
    entitaId: String(legame._id),
    req,
  });

  noContent(res);
});

/** Riepilogo millesimi per singolo utente, usato dal frontend condomino. */
export const mieQuote = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const legs = await Condomino.find({ condominio: req.params.condominioId, utente: utente.sub, attivo: true })
    .populate<{ unita: UnitaRiepilogo[] }>('unita', 'codice piano tipo metratura')
    .lean<CondominoPopolato[]>();

  if (legs.length === 0) throw notFound('Non risulti condòmino di questo condominio');

  const tabella = await buildTabella(req.params.condominioId!);
  const perUnita = new Map(tabella.righe.map((r) => [r.unitaId, r.quote]));
  const condominio = await Condominio.findById(req.params.condominioId).select('nome codice').lean();

  ok(res, {
    condominio,
    legame: legs.map((l) => ({
      regime: l.regime,
      quota: l.quota,
      unita: l.unita.map((u) => {
        const riga = tabella.righe.find((r) => r.unitaId === String(u._id));
        return {
          codice: u.codice,
          piano: u.piano,
          tipo: u.tipo,
          metratura: u.metratura,
          quote: riga?.quote ?? perUnita.get(String(u._id)) ?? { diritto: 0, uso: 0, spese: 0, scale: 0, ascensore: 0 },
        };
      }),
    })),
    tabella: { revisione: tabella.revisione, delibera: tabella.delibera, dataDelibera: tabella.dataDelibera },
  });
});
