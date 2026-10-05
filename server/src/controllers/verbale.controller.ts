import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, noContent, paginated } from '../utils/http.js';
import { conflict, notFound } from '../utils/errors.js';
import { paginazioneDa, regexDaTesto } from '../utils/pagination.js';
import { Assemblea, Condomino, Verbale, type AssembleaDoc, type UtenteRiepilogo } from '../models/index.js';
import { currentUser } from '../middleware/auth.js';
import { auditLog } from '../services/audit.service.js';
import { generaDatiVerbale, generaVerbale } from '../services/verbale.service.js';
import { toAllegati } from '../middleware/upload.js';
import { allegaA, staccaDa, espandiAllegato } from '../services/allegato.service.js';

export const list = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const q = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    sort: string;
    order: 'asc' | 'desc';
    approvato?: boolean;
  };
  const { page, limit, sort, order } = paginazioneDa(q, 'numero');

  const query: Record<string, unknown> = { condominio: req.params.condominioId };
  if (q.approvato !== undefined) query.approvato = q.approvato;
  if (q.search) query.testo = regexDaTesto(q.search);

  if (utente.role === 'condomino') {
    // Un condòmino vede i verbali delle assemblee a cui ha partecipato.
    const legs = await Condomino.find({ condominio: req.params.condominioId, utente: utente.sub })
      .select('_id')
      .lean();
    const assemblee = await Assemblea.find({
      condominio: req.params.condominioId,
      stato: 'conclusa',
      presenze: { $elemMatch: { condomino: { $in: legs.map((l) => l._id) }, presente: true } },
    })
      .select('_id')
      .lean();
    query.assemblea = { $in: assemblee.map((a) => a._id) };
  }

  const [documenti, totale] = await Promise.all([
    Verbale.find(query)
      .populate<{ assemblea: { _id: Types.ObjectId; numero: number; tipo: string; data: Date; stato: string } }>(
        'assemblea',
        'numero tipo data stato',
      )
      .populate<{ generatoDa: UtenteRiepilogo }>('generatoDa', 'nome cognome')
      .select('-testo')
      .sort({ [sort]: order === 'asc' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Verbale.countDocuments(query),
  ]);

  paginated(res, documenti, totale, page, limit);
});

export const getOne = asyncHandler(async (req, res) => {
  const verbale = await Verbale.findOne({ _id: req.params.id, condominio: req.params.condominioId })
    .populate<{ assemblea: AssembleaDoc }>('assemblea')
    .populate<{ generatoDa: UtenteRiepilogo }>('generatoDa', 'nome cognome')
    .lean();
  if (!verbale) throw notFound('Verbale non trovato');
  // Gli allegati viaggiano come id: qui diventano file scaricabili con firma
  // rinnovata, altrimenti il verbale mostrerebbe degli identificativi.
  ok(res, await espandiAllegato(verbale));
});

/** Anteprima del testo senza persistenza: utile per revisionare prima di salvare. */
export const anteprima = asyncHandler(async (req, res) => {
  ok(res, await generaDatiVerbale(req.params.assembleaId!));
});

export const genera = asyncHandler(async (req, res) => {
  const verbale = await generaVerbale(req.params.assembleaId!, currentUser(req).sub);
  await auditLog({
    condominio: String(verbale.condominio),
    attore: currentUser(req).sub,
    azione: 'generazione_verbale',
    entita: 'Verbale',
    entitaId: String(verbale._id),
    dettagli: { assemblea: String(verbale.assemblea), numero: verbale.numero },
    req,
  });
  created(res, verbale);
});

/** Rigenera il verbale solo se il testo non è stato editato a mano. */
export const rigenera = asyncHandler(async (req, res) => {
  const verbale = await generaVerbale(req.params.assembleaId!, currentUser(req).sub);
  ok(res, verbale);
});

export const updateTesto = asyncHandler(async (req, res) => {
  const { testo } = req.body as { testo: string };
  const verbale = await Verbale.findOne({ _id: req.params.id, condominio: req.params.condominioId });
  if (!verbale) throw notFound('Verbale non trovato');
  if (verbale.approvato) throw conflict('Il verbale approvato non può essere modificato');

  verbale.testo = testo;
  verbale.modificatoManualmente = true;
  await verbale.save();

  await auditLog({
    condominio: req.params.condominioId,
    attore: currentUser(req).sub,
    azione: 'modifica_verbale',
    entita: 'Verbale',
    entitaId: String(verbale._id),
    req,
  });

  ok(res, verbale);
});

export const approva = asyncHandler(async (req, res) => {
  const { approvato } = req.body as { approvato: boolean };
  const verbale = await Verbale.findOne({ _id: req.params.id, condominio: req.params.condominioId });
  if (!verbale) throw notFound('Verbale non trovato');

  verbale.approvato = approvato;
  verbale.approvatoIl = approvato ? new Date() : undefined;
  verbale.approvatoDa = approvato ? new Types.ObjectId(currentUser(req).sub) : undefined;
  await verbale.save();

  await auditLog({
    condominio: req.params.condominioId,
    attore: currentUser(req).sub,
    azione: approvato ? 'approvazione_verbale' : 'revoca_approvazione_verbale',
    entita: 'Verbale',
    entitaId: String(verbale._id),
    req,
  });

  ok(res, verbale);
});

export const remove = asyncHandler(async (req, res) => {
  const risultato = await Verbale.deleteOne({ _id: req.params.id, condominio: req.params.condominioId });
  if (risultato.deletedCount === 0) throw notFound('Verbale non trovato');
  noContent(res);
});
/**
 * Allega file al verbale.
 *
 * Un verbale approvato non è più modificabile, per lo stesso motivo di un bilancio
 * approvato: dopo la ratifica dell'assemblea aggiungere un documento significherebbe
 * cambiarne il contenuto.
 */
export const allega = asyncHandler(async (req, res) => {
  const id = String(req.params.id);
  const condominioId = String(req.params.condominioId);

  const verbale = await Verbale.findOne({ _id: id, condominio: condominioId });
  if (!verbale) throw notFound('Verbale non trovato');
  if (verbale.approvato) {
    throw conflict('Il verbale è approvato: per aggiungere un allegato, togli prima l\'approvazione.');
  }

  const caricati = await toAllegati(req);
  await allegaA(Verbale, { _id: id, condominio: condominioId }, 'allegati', caricati);

  ok(res, { allegati: caricati, aggiunti: caricati.length });
});

/** Toglie un allegato dal verbale e cancella il file. */
export const stacca = asyncHandler(async (req, res) => {
  await staccaDa(
    Verbale,
    { _id: String(req.params.id), condominio: String(req.params.condominioId) },
    'allegati',
    String(req.params.allegatoId),
  );
  noContent(res);
});