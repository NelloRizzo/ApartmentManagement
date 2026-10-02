import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, noContent, paginated } from '../utils/http.js';
import { badRequest, notFound } from '../utils/errors.js';
import { paginazioneDa } from '../utils/pagination.js';
import { Condomino, Unita, Versamento } from '../models/index.js';
import { currentUser } from '../middleware/auth.js';
import { auditLog } from '../services/audit.service.js';
import { calcolaQuoteMensili, quotePerCondomino } from '../services/quoteVersamenti.service.js';

const oid = (v: string): Types.ObjectId => new Types.ObjectId(String(v));
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export const list = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const q = req.query as unknown as {
    page: number;
    limit: number;
    sort: string;
    order: 'asc' | 'desc';
    unita?: string;
    anno?: number;
    mese?: number;
    dal?: Date;
    al?: Date;
    metodo?: string;
  };
  const { page, limit, sort, order } = paginazioneDa(q, 'dataVersamento');

  const query: Record<string, unknown> = { condominio: oid(req.params.condominioId!) };
  if (q.unita) query.unita = oid(q.unita);
  if (q.anno) query['periodo.anno'] = q.anno;
  if (q.mese) query['periodo.mese'] = q.mese;
  if (q.metodo) query.metodo = q.metodo;
  if (q.dal || q.al) {
    query.dataVersamento = {
      ...(q.dal ? { $gte: q.dal } : {}),
      ...(q.al ? { $lte: q.al } : {}),
    };
  }

  if (utente.role === 'condomino') {
    const legs = await Condomino.find({ condominio: req.params.condominioId, utente: utente.sub, attivo: true })
      .select('unita')
      .lean();
    query.unita = { $in: legs.flatMap((l) => l.unita) };
  }

  const [documenti, totale, aggregato] = await Promise.all([
    Versamento.find(query)
      .populate('unita', 'codice piano')
      .populate('condomino', 'nome cognome')
      .sort({ [sort]: order === 'asc' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Versamento.countDocuments(query),
    Versamento.aggregate<{ totale: number }>([
      { $match: query },
      { $group: { _id: null, totale: { $sum: '$importo' } } },
    ]),
  ]);

  paginated(
    res,
    { documenti, totaleImporti: round2(aggregato[0]?.totale ?? 0) },
    totale,
    page,
    limit,
  );
});

/** Quote del mese: ripartizione per unità e stato di pagamento. */
export const quote = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const anno = Number(req.query.anno ?? new Date().getFullYear());
  const mese = Number(req.query.mese ?? new Date().getMonth() + 1);

  if (utente.role === 'condomino') {
    const riepilogo = await quotePerCondomino(req.params.condominioId!, utente.sub, anno, mese);
    ok(res, { ...riepilogo, soloMie: true });
    return;
  }

  const riepilogo = await calcolaQuoteMensili(req.params.condominioId!, anno, mese);
  const utenti = await Condomino.find({ condominio: req.params.condominioId, attivo: true })
    .populate('utente', 'nome cognome')
    .lean();

  const infoUnita = await Unita.find({ condominio: req.params.condominioId, attiva: true })
    .select('codice piano')
    .lean();
  const unitaMap = new Map(infoUnita.map((u) => [String(u._id), u]));

  ok(res, {
    ...riepilogo,
    soloMie: false,
    righe: riepilogo.righe.map((r) => {
      const legame = utenti.find((c) => c.unita.some((id) => String(id) === r.unitaId) && c.primario);
      const utente = legame?.utente as unknown as { nome: string; cognome: string } | undefined;
      const u = unitaMap.get(r.unitaId);
      return {
        ...r,
        piano: u?.piano,
        nome: utente ? `${utente.nome} ${utente.cognome}` : null,
        utenteId: legame ? String(legame.utente) : null,
      };
    }),
  });
});

/** Riepilogo annuale: dodici mesi con incassato e saldo. */
export const riepilogoAnnuo = asyncHandler(async (req, res) => {
  const anno = Number(req.query.anno ?? new Date().getFullYear());
  const mesi = await Promise.all(
    Array.from({ length: 12 }, (_, i) => calcolaQuoteMensili(req.params.condominioId!, anno, i + 1)),
  );
  ok(res, {
    anno,
    mesi: mesi.map((m) => ({
      mese: m.mese,
      dovuto: m.totaleDovuto,
      versato: m.totaleVersato,
      saldo: m.saldo,
      morosi: m.morosi.length,
    })),
    totaleDovuto: round2(mesi.reduce((s, m) => s + m.totaleDovuto, 0)),
    totaleVersato: round2(mesi.reduce((s, m) => s + m.totaleVersato, 0)),
  });
});

export const create = asyncHandler(async (req, res) => {
  const condominioId = req.params.condominioId!;
  const body = req.body as {
    unita: string;
    condomino?: string;
    periodo: { anno: number; mese: number };
    importo: number;
    dataVersamento: Date;
    identificativoTransazione?: string;
  };

  const unita = await Unita.findOne({ _id: body.unita, condominio: condominioId });
  if (!unita) throw notFound('Unità immobiliare non trovata in questo condominio');

  if (body.condomino) {
    const legame = await Condomino.findOne({ condominio: condominioId, utente: body.condomino, unita: body.unita });
    if (!legame) throw badRequest('Il condòmino indicato non è titolare di questa unità');
  }

  const duplicato = body.identificativoTransazione
    ? await Versamento.findOne({ condominio: condominioId, identificativoTransazione: body.identificativoTransazione })
    : null;
  if (duplicato) throw badRequest('Esiste già un versamento con lo stesso identificativo di transazione');

  const versamento = await Versamento.create({
    ...req.body,
    condominio: oid(condominioId),
    unita: oid(body.unita),
    condomino: body.condomino ? oid(body.condomino) : undefined,
    registratoDa: currentUser(req).sub,
  });

  await auditLog({
    condominio: condominioId,
    attore: currentUser(req).sub,
    azione: 'registrazione_versamento',
    entita: 'Versamento',
    entitaId: String(versamento._id),
    dettagli: { importo: versamento.importo, periodo: versamento.periodo, unita: body.unita },
    req,
  });

  created(res, versamento);
});

export const update = asyncHandler(async (req, res) => {
  const versamento = await Versamento.findOneAndUpdate(
    { _id: req.params.id, condominio: req.params.condominioId },
    req.body,
    { new: true, runValidators: true },
  );
  if (!versamento) throw notFound('Versamento non trovato');
  ok(res, versamento);
});

export const remove = asyncHandler(async (req, res) => {
  const risultato = await Versamento.deleteOne({ _id: req.params.id, condominio: req.params.condominioId });
  if (risultato.deletedCount === 0) throw notFound('Versamento non trovato');

  await auditLog({
    condominio: req.params.condominioId,
    attore: currentUser(req).sub,
    azione: 'eliminazione_versamento',
    entita: 'Versamento',
    entitaId: String(req.params.id),
    req,
  });

  noContent(res);
});
