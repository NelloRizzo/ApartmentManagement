import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, noContent } from '../utils/http.js';
import { notFound } from '../utils/errors.js';
import { Bilancio, type BilancioDoc } from '../models/index.js';
import { currentUser } from '../middleware/auth.js';
import { auditLog } from '../services/audit.service.js';
import {
  aggiungiVoce,
  creaConsuntivo,
  eliminaVoce,
  getBilancioOrThrow,
  modificaVoce,
  oid,
  totalizza,
  type VoceInput,
} from '../services/bilancio.service.js';

export const list = asyncHandler(async (req, res) => {
  const query: Record<string, unknown> = { condominio: oid(req.params.condominioId!) };
  if (req.query.anno) query.anno = Number(req.query.anno);
  if (req.query.tipo) query.tipo = req.query.tipo;

  const documenti = await Bilancio.find(query).sort({ anno: -1, tipo: 1 }).lean<BilancioDoc[]>();
  ok(res, documenti.map((b) => ({ ...b, totale: b.totale || totalizza(b.voci) })));
});

export const getOne = asyncHandler(async (req, res) => {
  const bilancio = await getBilancioOrThrow(req.params.condominioId!, req.params.id!);
  ok(res, bilancio);
});

export const create = asyncHandler(async (req, res) => {
  const condominioId = req.params.condominioId!;
  const body = req.body as { anno: number; tipo: string; voci: { importo: number }[] };

  const corpo = req.body as {
    descrizione?: string;
    note?: string;
    deliberaAssemblea?: string;
  };

  const esistente = await Bilancio.findOne({ condominio: condominioId, anno: body.anno, tipo: body.tipo });
  if (esistente) {
    esistente.voci = body.voci as never;
    esistente.totale = totalizza(body.voci);
    esistente.descrizione = corpo.descrizione;
    esistente.note = corpo.note;
    esistente.deliberaAssemblea = corpo.deliberaAssemblea
      ? oid(corpo.deliberaAssemblea)
      : (esistente.deliberaAssemblea ?? undefined);
    await esistente.save();
    ok(res, esistente);
    return;
  }

  const bilancio = await Bilancio.create({
    ...req.body,
    condominio: oid(condominioId),
    deliberaAssemblea: req.body.deliberaAssemblea ? oid(req.body.deliberaAssemblea) : undefined,
    totale: totalizza(body.voci),
  });

  await auditLog({
    condominio: condominioId,
    attore: currentUser(req).sub,
    azione: 'creazione',
    entita: 'Bilancio',
    entitaId: String(bilancio._id),
    dettagli: { anno: bilancio.anno, tipo: bilancio.tipo, totale: bilancio.totale },
    req,
  });

  created(res, bilancio);
});

export const update = asyncHandler(async (req, res) => {
  const { deliberaAssemblea, ...resto } = req.body as { deliberaAssemblea?: string };
  const bilancio = await Bilancio.findOneAndUpdate(
    { _id: req.params.id, condominio: req.params.condominioId },
    { ...resto, ...(deliberaAssemblea ? { deliberaAssemblea: oid(deliberaAssemblea) } : {}) },
    { new: true, runValidators: true },
  );
  if (!bilancio) throw notFound('Bilancio non trovato');

  if (Array.isArray(bilancio.voci)) bilancio.totale = totalizza(bilancio.voci);
  await bilancio.save();
  ok(res, bilancio);
});

// ---------- Voci, una alla volta ----------

export const aggiungi = asyncHandler(async (req, res) => {
  const condominioId = req.params.condominioId!;
  const bilancio = await aggiungiVoce(condominioId, req.params.id!, req.body as VoceInput);

  await auditLog({
    condominio: condominioId,
    attore: currentUser(req).sub,
    azione: 'creazione',
    entita: 'VoceBilancio',
    entitaId: `${bilancio._id}:${bilancio.voci.at(-1)?._id}`,
    dettagli: { descrizione: req.body.descrizione, importo: req.body.importo },
    req,
  });

  created(res, bilancio);
});

export const modifica = asyncHandler(async (req, res) => {
  const condominioId = req.params.condominioId!;
  const bilancio = await modificaVoce(condominioId, req.params.id!, req.params.voceId!, req.body as VoceInput);

  await auditLog({
    condominio: condominioId,
    attore: currentUser(req).sub,
    azione: 'modifica',
    entita: 'VoceBilancio',
    entitaId: `${bilancio._id}:${req.params.voceId}`,
    dettagli: req.body,
    req,
  });

  ok(res, bilancio);
});

export const elimina = asyncHandler(async (req, res) => {
  const condominioId = req.params.condominioId!;
  const bilancio = await eliminaVoce(condominioId, req.params.id!, req.params.voceId!);

  await auditLog({
    condominio: condominioId,
    attore: currentUser(req).sub,
    azione: 'eliminazione',
    entita: 'VoceBilancio',
    entitaId: `${bilancio._id}:${req.params.voceId}`,
    req,
  });

  ok(res, bilancio);
});

// ---------- Consuntivo ----------

/**
 * Genera il consuntivo dell'anno dal preventivo approvato.
 *
 * Idempotente: se il consuntivo esiste già lo restituisce, così il pulsante
 * può essere premuto senza timori di creare un secondo documento per lo stesso
 * anno (l'indice univoco su `condominio + anno + tipo` lo impedirebbe comunque).
 */
export const generaConsuntivo = asyncHandler(async (req, res) => {
  const condominioId = req.params.condominioId!;
  const { bilancio, creato } = await creaConsuntivo(condominioId, req.params.id!);

  if (creato) {
    await auditLog({
      condominio: condominioId,
      attore: currentUser(req).sub,
      azione: 'creazione',
      entita: 'Consuntivo',
      entitaId: String(bilancio._id),
      dettagli: { anno: bilancio.anno, da: String(req.params.id) },
      req,
    });
  }

  ok(res, bilancio);
});

export const approva = asyncHandler(async (req, res) => {
  const { approvato } = req.body as { approvato: boolean };
  const bilancio = await Bilancio.findOneAndUpdate(
    { _id: req.params.id, condominio: req.params.condominioId },
    { approvato },
    { new: true },
  );
  if (!bilancio) throw notFound('Bilancio non trovato');
  ok(res, bilancio);
});

export const remove = asyncHandler(async (req, res) => {
  const risultato = await Bilancio.deleteOne({ _id: req.params.id, condominio: req.params.condominioId, approvato: false });
  if (risultato.deletedCount === 0) throw notFound('Bilancio non trovato o già approvato');
  noContent(res);
});
