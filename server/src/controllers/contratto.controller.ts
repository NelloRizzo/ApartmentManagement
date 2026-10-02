import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, noContent, paginated } from '../utils/http.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { getObjectId, paginazioneDa, regexDaTesto } from '../utils/pagination.js';
import {
  Condominio,
  Contratto,
  MessaggioPiattaforma,
  PagamentoContratto,
  Unita,
  User,
  type ContrattoDoc,
  type ContrattoDocumento,
  type MessaggioPiattaformaDoc,
  type ObjectId,
  type PagamentoContrattoDoc,
} from '../models/index.js';
import { currentUser } from '../middleware/auth.js';
import { auditLog } from '../services/audit.service.js';
import {
  cambiaStatoServizio,
  cessa,
  creaContratto,
  proroga,
  round2,
  statoServizio,
  unitaInCarico,
} from '../services/contratto.service.js';

const oid = (v: string): Types.ObjectId => new Types.ObjectId(String(v));

/** Il superadmin gestisce i contratti; l'amministratore vede solo il proprio. */
function soloSuperadmin(req: Parameters<typeof currentUser>[0]) {
  const utente = currentUser(req);
  if (utente.role !== 'superadmin') {
    throw forbidden('Operazione riservata all’amministratore di piattaforma');
  }
  return utente;
}

export interface DatiRiepilogoContratto {
  id: string;
  codice: string;
  amministratore: string;
  stato: string;
  unitaMassime: number;
  costo: number;
  periodicita: string;
  durataMesi: number;
  dataInizio: string;
  dataScadenza: string;
  giorniAllaScadenza: number | null;
  scaduto: boolean;
  rinnovoAutomatico: boolean;
  mesiProroga: number;
  note?: string;
  sospesoIl?: string;
  sospesoMotivo?: string;
  cessatoIl?: string;
  cessatoMotivo?: string;
  creatoIl: string;
  proroghe: number;
}

async function riepilogo(
  contratto: ContrattoDoc,
  amministratore?: { nome: string; cognome: string; email: string },
): Promise<DatiRiepilogoContratto> {
  const giorni = Math.ceil((new Date(contratto.dataScadenza).getTime() - Date.now()) / 86_400_000);
  const proroghe = contratto.storico.filter((s) => s.azione === 'proroga').length;

  return {
    id: String(contratto._id),
    codice: contratto.codice,
    amministratore: amministratore ? `${amministratore.nome} ${amministratore.cognome}` : String(contratto.amministratore),
    stato: contratto.stato,
    unitaMassime: contratto.unitaMassime,
    costo: round2(contratto.costo),
    periodicita: contratto.periodicita,
    durataMesi: contratto.durataMesi,
    dataInizio: new Date(contratto.dataInizio).toISOString(),
    dataScadenza: new Date(contratto.dataScadenza).toISOString(),
    giorniAllaScadenza: giorni,
    scaduto: giorni < 0,
    rinnovoAutomatico: contratto.rinnovoAutomatico,
    mesiProroga: contratto.mesiProroga,
    note: contratto.note,
    sospesoIl: contratto.sospesoIl?.toISOString(),
    sospesoMotivo: contratto.sospesoMotivo,
    cessatoIl: contratto.cessatoIl?.toISOString(),
    cessatoMotivo: contratto.cessatoMotivo,
    creatoIl: contratto.createdAt.toISOString(),
    proroghe,
  };
}

async function caricaContratto(id: string): Promise<ContrattoDocumento> {
  const contratto = await Contratto.findById(id);
  if (!contratto) throw notFound('Contratto non trovato');
  return contratto;
}

// ---------- Contratti ----------

export const list = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const q = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    sort: string;
    order: 'asc' | 'desc';
    stato?: string;
  };
  const { page, limit, sort, order } = paginazioneDa(q, 'dataScadenza');

  const query: Record<string, unknown> = {};
  // Un amministratore vede solo il proprio contratto.
  if (utente.role !== 'superadmin') query.amministratore = utente.sub;
  if (q.stato) query.stato = q.stato;

  if (q.search) {
    const rx = regexDaTesto(q.search);
    const corrispondenze = await User.find({ $or: [{ nome: rx }, { cognome: rx }, { email: rx }] })
      .select('_id')
      .lean();
    const perCodice = await Contratto.find({ codice: rx }).select('_id').lean();
    query._id = { $in: [...corrispondenze.map((u) => u._id), ...perCodice.map((c) => c._id)] };
  }

  const [documenti, totale] = await Promise.all([
    Contratto.find(query)
      .populate('amministratore', 'nome cognome email')
      .sort({ [sort]: order === 'asc' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Contratto.countDocuments(query),
  ]);

  const arricchiti = await Promise.all(
    documenti.map(async (c) => {
      const admin = c.amministratore as unknown as { nome: string; cognome: string; email: string };
      return {
        ...(await riepilogo(c, admin)),
        amministratoreId: String(c.amministratore._id ?? c.amministratore),
        amministratoreEmail: admin?.email,
        unitaInUso: await unitaInCarico(String(c.amministratore._id ?? c.amministratore)),
      };
    }),
  );

  paginated(res, arricchiti, totale, page, limit);
});

export const getOne = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const contratto = await caricaContratto(getObjectId(req.params.id ?? '', 'id'));

  if (utente.role !== 'superadmin' && String(contratto.amministratore) !== utente.sub) {
    throw forbidden('Questo contratto non è tuo');
  }

  const [admin, rate, messaggi, inUso, condomini] = await Promise.all([
    User.findById(contratto.amministratore).select('nome cognome email telefono').lean(),
    PagamentoContratto.find({ contratto: contratto._id }).sort({ progressivo: 1 }).lean(),
    MessaggioPiattaforma.find({ contratto: contratto._id }).sort({ createdAt: 1 }).lean(),
    unitaInCarico(String(contratto.amministratore)),
    Condominio.find({ amministratore: contratto.amministratore }).select('nome codice').lean(),
  ]);

  const incassato = round2(rate.filter((r) => r.stato === 'pagato').reduce((s, r) => s + r.importo, 0));
  const dovuto = round2(rate.filter((r) => r.stato !== 'annullato').reduce((s, r) => s + r.importo, 0));

  ok(res, {
    ...(await riepilogo(contratto, admin ?? undefined)),
    amministratoreId: String(contratto.amministratore),
    unitaInUso: inUso,
    condomini: condomini.map((c) => ({ id: String(c._id), nome: c.nome, codice: c.codice })),
    rate: rate.map((r) => ({
      id: String(r._id),
      progressivo: r.progressivo,
      scadenza: new Date(r.scadenza).toISOString(),
      importo: round2(r.importo),
      stato: r.stato,
      scaduta: new Date(r.scadenza) < new Date() && r.stato === 'da_pagare',
      dataPagamento: r.dataPagamento?.toISOString() ?? null,
      metodo: r.metodo,
      identificativoTransazione: r.identificativoTransazione,
      quietanza: r.quietanza,
      note: r.note,
    })),
    incassato,
    dovuto,
    saldo: round2(dovuto - incassato),
    storico: contratto.storico.map((s) => ({
      data: new Date(s.data).toISOString(),
      azione: s.azione,
      da: s.da,
      a: s.a,
      nota: s.nota,
      operatore: s.operatore ? String(s.operatore) : null,
    })),
    messaggi: messaggi.map((m) => ({
      id: String(m._id),
      mittente: String(m.mittente),
      tipo: m.tipo,
      oggetto: m.oggetto,
      corpo: m.corpo,
      dataLettura: m.dataLettura?.toISOString() ?? null,
      creatoIl: new Date(m.createdAt).toISOString(),
    })),
  });
});

export const create = asyncHandler(async (req, res) => {
  const operatore = soloSuperadmin(req);
  const body = req.body as {
    amministratore: string;
    unitaMassime: number;
    costo: number;
    periodicita: 'mensile' | 'trimestrale' | 'semestrale' | 'annuale';
    durataMesi: number;
    dataInizio: Date;
    mesiProroga?: number;
    rinnovoAutomatico?: boolean;
    note?: string;
  };

  const contratto = await creaContratto(body, operatore.sub);
  created(res, await riepilogo(contratto));
});

export const prorogaContratto = asyncHandler(async (req, res) => {
  const operatore = soloSuperadmin(req);
  const contratto = await caricaContratto(getObjectId(req.params.id ?? '', 'id'));
  const body = req.body as { mesi?: number; nuovaCapacita?: number; nota?: string };

  const mesi = body.mesi ?? contratto.mesiProroga;
  await proroga(contratto, mesi, operatore.sub, {
    nuovaCapacita: body.nuovaCapacita,
    nota: body.nota,
  });

  ok(res, await riepilogo(contratto));
});

export const cambiaStato = asyncHandler(async (req, res) => {
  const operatore = soloSuperadmin(req);
  const contratto = await caricaContratto(getObjectId(req.params.id ?? '', 'id'));
  const { azione, motivo } = req.body as { azione: 'sospendi' | 'riattiva'; motivo?: string };

  await cambiaStatoServizio(contratto, azione, operatore.sub, motivo);
  ok(res, await riepilogo(contratto));
});

export const cessaContratto = asyncHandler(async (req, res) => {
  const operatore = soloSuperadmin(req);
  const contratto = await caricaContratto(getObjectId(req.params.id ?? '', 'id'));
  const { motivo } = req.body as { motivo?: string };

  await cessa(contratto, motivo?.trim() || 'Cessazione non motivata', operatore.sub);
  ok(res, await riepilogo(contratto));
});

// ---------- Rate ----------

export const listRate = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const contratto = await caricaContratto(getObjectId(req.params.id ?? '', 'id'));
  if (utente.role !== 'superadmin' && String(contratto.amministratore) !== utente.sub) {
    throw forbidden('Questo contratto non è tuo');
  }

  const rate = await PagamentoContratto.find({ contratto: contratto._id })
    .sort({ progressivo: 1 })
    .lean();

  ok(res, rate.map((r) => ({
    id: String(r._id),
    progressivo: r.progressivo,
    scadenza: new Date(r.scadenza).toISOString(),
    importo: round2(r.importo),
    stato: r.stato,
    dataPagamento: r.dataPagamento?.toISOString() ?? null,
    metodo: r.metodo,
    identificativoTransazione: r.identificativoTransazione,
    note: r.note,
  })));
});

export const registraPagamento = asyncHandler(async (req, res) => {
  const operatore = soloSuperadmin(req);
  const contratto = await caricaContratto(getObjectId(req.params.id ?? '', 'id'));
  const rataId = getObjectId(req.params.rataId ?? '', 'rataId');

  const rata = await PagamentoContratto.findOne({ _id: rataId, contratto: contratto._id });
  if (!rata) throw notFound('Rata non trovata');
  if (rata.stato === 'pagato') throw badRequest('La rata è già stata registrata come pagata');

  const body = req.body as {
    dataPagamento?: Date;
    metodo?: string;
    identificativoTransazione?: string;
    quietanza?: string;
    note?: string;
  };

  rata.stato = 'pagato';
  rata.dataPagamento = body.dataPagamento ?? new Date();
  rata.metodo = (body.metodo as PagamentoContrattoDoc['metodo']) ?? 'bonifico';
  rata.identificativoTransazione = body.identificativoTransazione;
  rata.quietanza = body.quietanza;
  rata.note = body.note;
  rata.registratoDa = oid(operatore.sub);
  await rata.save();

  await auditLog({
    attore: operatore.sub,
    azione: 'registrazione_pagamento_contratto',
    entita: 'PagamentoContratto',
    entitaId: String(rata._id),
    dettagli: { contratto: String(contratto._id), importo: rata.importo },
    req,
  });

  ok(res, { id: String(rata._id), stato: rata.stato, importo: round2(rata.importo) });
});

export const annullaRata = asyncHandler(async (req, res) => {
  soloSuperadmin(req);
  const contratto = await caricaContratto(getObjectId(req.params.id ?? '', 'id'));
  const rataId = getObjectId(req.params.rataId ?? '', 'rataId');

  const rata = await PagamentoContratto.findOne({ _id: rataId, contratto: contratto._id });
  if (!rata) throw notFound('Rata non trovata');
  if (rata.stato === 'pagato') throw badRequest('Non si può annullare una rata già pagata');

  rata.stato = 'annullato';
  await rata.save();
  noContent(res);
});

// ---------- Messaggi ----------

export const listMessaggi = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const destinatario = req.query.destinatario as string | undefined;

  const query: Record<string, unknown> = {};
  // Solo la corrispondenza che riguarda l'utente collegato.
  query.$or = [{ mittente: utente.sub }, { destinatario: utente.sub }];

  if (utente.role !== 'superadmin') {
    query.destinatario = utente.sub;
  } else if (destinatario) {
    query.destinatario = destinatario;
  }

  const messaggi = await MessaggioPiattaforma.find(query)
    .populate('mittente', 'nome cognome')
    .populate('destinatario', 'nome cognome')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean<MessaggioPiattaformaDoc[]>();

  ok(res, messaggi.map((m) => ({
    id: String(m._id),
    contratto: m.contratto ? String(m.contratto) : null,
    mittente: {
      id: String((m.mittente as unknown as { _id: unknown })._id ?? m.mittente),
      nome: (m.mittente as unknown as { nome: string }).nome,
      cognome: (m.mittente as unknown as { cognome: string }).cognome,
    },
    destinatario: {
      id: String((m.destinatario as unknown as { _id: unknown })._id ?? m.destinatario),
      nome: (m.destinatario as unknown as { nome: string }).nome,
      cognome: (m.destinatario as unknown as { cognome: string }).cognome,
    },
    tipo: m.tipo,
    oggetto: m.oggetto,
    corpo: m.corpo,
    letto: Boolean(m.dataLettura),
    creatoIl: new Date(m.createdAt).toISOString(),
  })));
});

export const inviaMessaggio = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const body = req.body as {
    destinatario: string;
    contratto?: string;
    tipo?: 'info' | 'avviso' | 'sollecito';
    oggetto: string;
    corpo: string;
  };

  const destinatario = await User.findById(body.destinatario);
  if (!destinatario) throw notFound('Destinatario non trovato');
  if (destinatario.role !== 'admin') {
    throw badRequest('I messaggi di piattaforma sono rivolti agli amministratori di condominio');
  }

  const messaggio = await MessaggioPiattaforma.create({
    contratto: body.contratto ? oid(body.contratto) : undefined,
    mittente: oid(utente.sub),
    destinatario: oid(body.destinatario),
    tipo: body.tipo ?? 'info',
    oggetto: body.oggetto,
    corpo: body.corpo,
  });

  await auditLog({
    attore: utente.sub,
    azione: 'messaggio_piattaforma',
    entita: 'MessaggioPiattaforma',
    entitaId: String(messaggio._id),
    dettagli: { destinatario: body.destinatario },
    req,
  });

  created(res, { id: String(messaggio._id), oggetto: messaggio.oggetto });
});

export const segnaLetto = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const id = getObjectId(req.params.id ?? '', 'id');

  const messaggio = await MessaggioPiattaforma.findOneAndUpdate(
    { _id: id, destinatario: utente.sub },
    { dataLettura: new Date(), $addToSet: { lettoDa: oid(utente.sub) } },
    { new: true },
  );
  if (!messaggio) throw notFound('Messaggio non trovato');
  ok(res, { id, letto: true });
});

// ---------- Vista per l'amministratore ----------

/** Situazione del contratto dal punto di vista dell'amministratore. */
export const mioStato = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  if (utente.role === 'superadmin') {
    const totale = await Contratto.countDocuments({ stato: { $in: ['attivo', 'sospeso'] } });
    const scadenti = await Contratto.countDocuments({ dataScadenza: { $lte: new Date(Date.now() + 30 * 86_400_000) } });
    ok(res, { ruolo: 'superadmin', contrattiAttivi: totale, inScadenzaEntro30Giorni: scadenti });
    return;
  }

  if (utente.role !== 'admin') {
    ok(res, { ruolo: utente.role });
    return;
  }

  const servizio = await statoServizio(utente.sub);
  const rate = servizio.contratto
    ? await PagamentoContratto.find({ contratto: servizio.contratto._id }).lean()
    : [];

  ok(res, {
    ruolo: 'admin',
    stato: servizio.stato,
    contratto: servizio.contratto
      ? {
          id: String(servizio.contratto._id),
          codice: servizio.contratto.codice,
          unitaMassime: servizio.unitaMassime,
          unitaInUso: servizio.unitaInUso,
          unitaDisponibili: servizio.unitaDisponibili,
          costo: round2(servizio.contratto.costo),
          periodicita: servizio.contratto.periodicita,
          dataScadenza: new Date(servizio.contratto.dataScadenza).toISOString(),
          giorniAllaScadenza: servizio.giorniAllaScadenza,
          scaduto: servizio.scaduto,
          utilizzabile: servizio.utilizzabile,
        }
      : null,
    prossimaRata: rate
      .filter((r) => r.stato === 'da_pagare')
      .sort((a, b) => new Date(a.scadenza).getTime() - new Date(b.scadenza).getTime())
      .map((r) => ({ id: String(r._id), scadenza: new Date(r.scadenza).toISOString(), importo: round2(r.importo) }))[0] ?? null,
  });
});

/** Riepilogo operativo per il superadmin: unità per contratto. */
export const caricoPerContratto = asyncHandler(async (req, res) => {
  soloSuperadmin(req);
  const contratti = await Contratto.find({ stato: { $in: ['attivo', 'sospeso', 'scaduto'] } })
    .populate('amministratore', 'nome cognome email')
    .lean();

  const righe = await Promise.all(
    contratti.map(async (c) => {
      const condomini = await Condominio.find({ amministratore: c.amministratore }).select('_id').lean();
      const unita = condomini.length
        ? await Unita.countDocuments({ condominio: { $in: condomini.map((x) => x._id) }, attiva: true })
        : 0;
      const admin = c.amministratore as unknown as { nome: string; cognome: string; email: string };
      return {
        contratto: String(c._id),
        codice: c.codice,
        amministratore: `${admin.nome} ${admin.cognome}`,
        email: admin.email,
        stato: c.stato,
        unitaMassime: c.unitaMassime,
        unitaInUso: unita,
        percentualeUtilizzo:
          c.unitaMassime > 0 ? Math.round((unita / c.unitaMassime) * 100) : 0,
        scadenza: new Date(c.dataScadenza).toISOString(),
      };
    }),
  );

  ok(res, righe);
});

/** Riepilogo per l'amministratore di piattaforma. */
export const piattaforma = asyncHandler(async (req, res) => {
  soloSuperadmin(req);

  const adesso = new Date();
  const tra30 = new Date(adesso.getTime() + 30 * 86_400_000);
  const inizioMese = new Date(adesso.getFullYear(), adesso.getMonth(), 1);

  const [amministratori, assistenti, contrattiAttivi, contrattiSospesi, inScadenza, incassato, incassatoMese] =
    await Promise.all([
      User.countDocuments({ role: 'admin', permessi: null }),
      User.countDocuments({ role: 'admin', permessi: { $ne: null } }),
      Contratto.countDocuments({ stato: 'attivo' }),
      Contratto.countDocuments({ stato: 'sospeso' }),
      Contratto.find({ stato: 'attivo', dataScadenza: { $gte: adesso, $lte: tra30 } })
        .select('codice dataScadenza amministratore')
        .lean<{ _id: ObjectId; codice: string; dataScadenza: Date }[]>(),
      PagamentoContratto.aggregate([
        { $match: { stato: 'pagato' } },
        { $group: { _id: null, totale: { $sum: '$importo' } } },
      ]),
      PagamentoContratto.aggregate([
        { $match: { stato: 'pagato', dataPagamento: { $gte: inizioMese } } },
        { $group: { _id: null, totale: { $sum: '$importo' } } },
      ]),
    ]);

  ok(res, {
    amministratori,
    assistenti,
    contrattiAttivi,
    contrattiSospesi,
    incassato: round2(incassato[0]?.totale ?? 0),
    incassatoMese: round2(incassatoMese[0]?.totale ?? 0),
    // Un contratto in scadenza è la cosa su cui agire: per i rinnovi serve
    // saperlo prima, non scoprirlo alla scadenza.
    inScadenza: inScadenza
      .map((c) => ({
        contratto: String(c._id),
        codice: c.codice,
        scadenza: new Date(c.dataScadenza).toISOString(),
        giorni: Math.ceil((new Date(c.dataScadenza).getTime() - adesso.getTime()) / 86_400_000),
      }))
      .sort((a, b) => a.giorni - b.giorni),
  });
});