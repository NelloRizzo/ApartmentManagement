import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, noContent, paginated } from '../utils/http.js';
import { badRequest, notFound } from '../utils/errors.js';
import { paginazioneDa, regexDaTesto } from '../utils/pagination.js';
import { Condomino, QuotaMillesimale, Unita } from '../models/index.js';
import { currentUser } from '../middleware/auth.js';
import { auditLog } from '../services/audit.service.js';
import { getRevisioneAttiva, quotaDiUnita } from '../services/tabellaMillesimale.service.js';

export const list = asyncHandler(async (req, res) => {
  const q = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    sort: string;
    order: 'asc' | 'desc';
    attiva?: boolean;
    tipo?: string;
  };
  const { page, limit, sort, order } = paginazioneDa(q, 'codice');

  const query: Record<string, unknown> = { condominio: new Types.ObjectId(req.params.condominioId!) };
  if (q.attiva !== undefined) query.attiva = q.attiva;
  if (q.tipo) query.tipo = q.tipo;
  if (q.search) query.$or = [{ codice: regexDaTesto(q.search) }, { descrizione: regexDaTesto(q.search) }];

  const [documenti, totale] = await Promise.all([
    Unita.find(query)
      .sort({ [sort]: order === 'asc' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Unita.countDocuments(query),
  ]);

  const revisione = await getRevisioneAttiva(req.params.condominioId!);
  const [quote, legami] = await Promise.all([
    revisione
      ? QuotaMillesimale.find({ condominio: req.params.condominioId, revisione }).lean()
      : Promise.resolve([]),
    // I titolari vivono in `Condomino`: è una relazione inversa, non un campo
    // dello schema `Unita`, quindi non si può popolare.
    Condomino.find({ condominio: req.params.condominioId, unita: { $in: documenti.map((d) => d._id) } })
      .populate('utente', 'nome cognome email')
      .lean(),
  ]);

  // La mappa è indicizzata da unita + ripartizione: senza la ripartizione
  // nella chiave ogni unità mostrerebbe l'ultima quota letta (tipicamente
  // "scale") al posto di quella di diritto.
  const chiaveQuota = (unitaId: unknown, ripartizione: string): string => `${unitaId}:${ripartizione}`;
  const quoteMap = new Map(quote.map((q) => [chiaveQuota(q.unita, q.ripartizione), q.valore]));
  const titolariPerUnita = new Map<string, { nome: string; regime: string; quota: number }[]>();
  for (const legame of legami) {
    const utente = legame.utente as unknown as { nome: string; cognome: string; email: string };
    for (const idUnita of legame.unita) {
      const chiave = String(idUnita);
      const elenco = titolariPerUnita.get(chiave) ?? [];
      elenco.push({ nome: `${utente.nome} ${utente.cognome}`, regime: legame.regime, quota: legame.quota });
      titolariPerUnita.set(chiave, elenco);
    }
  }

  paginated(
    res,
    documenti.map((d) => ({
      ...d,
      titolari: titolariPerUnita.get(String(d._id)) ?? [],
      millesimi: {
        diritto: quoteMap.get(chiaveQuota(d._id, 'diritto')) ?? 0,
        uso: quoteMap.get(chiaveQuota(d._id, 'uso')) ?? 0,
        spese: quoteMap.get(chiaveQuota(d._id, 'spese')) ?? 0,
        revisione,
      },
    })),
    totale,
    page,
    limit,
  );
});

export const getOne = asyncHandler(async (req, res) => {
  const unita = await Unita.findOne({ _id: req.params.id, condominio: req.params.condominioId }).lean();
  if (!unita) throw notFound('Unità immobiliare non trovata');

  const [quota, storico, legami] = await Promise.all([
    quotaDiUnita(req.params.condominioId!, req.params.id!),
    QuotaMillesimale.find({ unita: req.params.id })
      .sort({ revisione: -1, ripartizione: 1 })
      .lean(),
    Condomino.find({ condominio: req.params.condominioId, unita: req.params.id, attivo: true })
      .populate('utente', 'nome cognome email telefono')
      .lean(),
  ]);

  ok(res, { ...unita, quota, storicoQuote: storico, titolari: legami });
});

export const create = asyncHandler(async (req, res) => {
  const condominioId = req.params.condominioId!;
  const esistente = await Unita.findOne({ condominio: condominioId, codice: req.body.codice });
  if (esistente) throw badRequest(`Esiste già un’unità con il codice "${req.body.codice}"`);

  const unita = await Unita.create({ ...req.body, condominio: new Types.ObjectId(condominioId) });
  await auditLog({
    condominio: condominioId,
    attore: currentUser(req).sub,
    azione: 'creazione',
    entita: 'Unita',
    entitaId: String(unita._id),
    dettagli: req.body,
    req,
  });
  created(res, unita);
});

export const update = asyncHandler(async (req, res) => {
  const unita = await Unita.findOneAndUpdate(
    { _id: req.params.id, condominio: req.params.condominioId },
    req.body,
    { new: true, runValidators: true },
  );
  if (!unita) throw notFound('Unità immobiliare non trovata');
  ok(res, unita);
});

export const remove = asyncHandler(async (req, res) => {
  const [legami, quote] = await Promise.all([
    Condomino.countDocuments({ unita: req.params.id }),
    QuotaMillesimale.countDocuments({ unita: req.params.id, validTo: null }),
  ]);
  if (legami > 0) throw badRequest('Impossibile eliminare: l’unità è collegata a uno o più condòmini');
  if (quote > 0) throw badRequest('Impossibile eliminare: l’unità ha quote millesimali in vigore. Imposta "attiva" a false.');

  const risultato = await Unita.deleteOne({ _id: req.params.id, condominio: req.params.condominioId });
  if (risultato.deletedCount === 0) throw notFound('Unità immobiliare non trovata');
  noContent(res);
});
