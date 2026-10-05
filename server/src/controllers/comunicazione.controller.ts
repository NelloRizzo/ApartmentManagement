import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, noContent } from '../utils/http.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { getObjectId, paginazioneDa } from '../utils/pagination.js';
import { AuditLog, Comunicazione, Condomino, Unita, type ComunicazioneDoc } from '../models/index.js';
import { currentUser } from '../middleware/auth.js';
import { toAllegati } from '../middleware/upload.js';
import { auditLog } from '../services/audit.service.js';
import { rendiPermanenti, espandiAllegato, eliminaSvincolati } from '../services/allegato.service.js';
import {
  amministratoriDiCondominio,
  assicuraAccesso,
  destinatariDiUnita,
  listComunicazioni,
  preparaComunicazione,
  segnaLetta as marcaLetta,
  contaNonLette,
} from '../services/comunicazione.service.js';

const oid = (v: string): Types.ObjectId => new Types.ObjectId(String(v));

export const list = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const q = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    sort: string;
    order: 'asc' | 'desc';
    bandiera: 'posta' | 'inviate' | 'bozze' | 'tutte';
    tipo?: string;
    stato?: string;
  };
  const { page, limit, sort, order } = paginazioneDa(q, 'createdAt');

  const risultato = await listComunicazioni(utente.sub, utente.role, {
    condominio: req.query.condominio ? String(req.query.condominio) : undefined,
    bandiera: q.bandiera,
    tipo: q.tipo,
    stato: q.stato,
    search: q.search,
    page,
    limit,
    sort,
    order,
  });

  res.json({
    success: true,
    data: risultato.dati,
    meta: {
      page: risultato.page,
      limit: risultato.limit,
      total: risultato.totale,
      totalPages: Math.ceil(risultato.totale / risultato.limit),
      hasNext: risultato.page * risultato.limit < risultato.totale,
      hasPrev: risultato.page > 1,
    },
  });
});

export const nonLette = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  // Il condominio viene dal percorso e non dalla query: il pallino conta quello
  // che l'utente sta guardando, non tutto quello a cui ha accesso.
  const condominioId = getObjectId(req.params.condominioId ?? '', 'condominioId');
  ok(res, { nonLette: await contaNonLette(utente.sub, utente.role, condominioId) });
});

export const getOne = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const doc = await Comunicazione.findById(req.params.id)
    .populate('mittente', 'nome cognome email')
    .populate('destinatario', 'nome cognome email')
    .lean<ComunicazioneDoc>();
  if (!doc) throw notFound('Comunicazione non trovata');

  await assicuraAccesso(doc, utente.sub, utente.role);

  const thread = doc.threadId
    ? await Comunicazione.find({ threadId: doc.threadId })
        .populate('mittente', 'nome cognome')
        .sort({ createdAt: 1 })
        .lean()
    : [doc];

  ok(res, { ...(await espandiAllegato(doc)), thread });
});

export const create = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const body = req.body as {
    tipo: 'avviso' | 'richiesta' | 'reclamo' | 'segnalazione' | 'risposta' | 'convocazione';
    oggetto: string;
    corpo: string;
    destinatario?: string;
    destinatari?: string[];
    unita?: string[];
    assemblea?: string;
    rispostaA?: string;
    richiedeRisposta: boolean;
    salvaComeBozza: boolean;
  };

  // I file arrivano qui solo se il middleware li ha messi in `req.files`: senza
  // questa riga il caricamento finiva senza errore e senza allegato, perché la
  // rotta accettava i file ma nessuno li trasformava in documenti.
  const caricati = await toAllegati(req);

// Il condominio viene dalla rotta, che ha già eseguito `requireCondominioAccess`:
  // dedurlo dall'utenza sbagliava per il superadmin (non è titolare di nessuno
  // stabile, quindi restava `undefined` e la comunicazione nasceva senza
  // condominio) e per gli assistenti che amministrano più stabili (il primo
  // della lista non è necessariamente quello della rotta).
  const condominio =
    req.params.condominioId ??
    (body.unita && body.unita.length > 0
      ? String(await condomioDiUnita(String(body.unita[0])))
      : utente.role === 'admin'
        ? utente.condominiIds[0]
        : (await condomioDiUtente(utente.sub))[0]);

  const daAmministratore = body.tipo === 'avviso' || body.tipo === 'convocazione';

  // Avviso e convocazione sono riservati a chi amministra: senza questo controllo
  // un condomino che modifica il corpo della richiesta si metterebbe in tasca un
  // avviso "inviato" a tutto lo stabile. Il superadmin non amministra uno stabile
  // in particolare, ma è un operatore della piattaforma e non è un partecipante:
  // escluderlo gli renderebbe impossibile usare la pagina.
  if (daAmministratore && utente.role !== 'admin' && utente.role !== 'superadmin') {
    throw forbidden('Solo l\'amministratore può inviare avvisi e convocazioni');
  }

  const destinatari = [...(body.destinatari ?? [])];
  if (body.unita?.length && condominio) {
    destinatari.push(...(await destinatariDiUnita(condominio, body.unita)));
  }

  // Un avviso o una convocazione senza destinatari espliciti raggiunge tutti i
  // condòmini del condominio: è il comportamento atteso dall'amministratore.
  if (destinatari.length === 0 && daAmministratore && condominio && !body.salvaComeBozza) {
    destinatari.push(...(await tuttiICondomini(condominio)));
  }

  const unici = [...new Set(destinatari)];

  // Il condòmino scrive all'amministratore del proprio condominio: qualunque
  // destinatario scelto nel corpo viene scartato, così non può recapitare un
  // messaggio a un altro condòmino.
  if (utente.role === 'condomino' && condominio) {
    unici.length = 0;
    unici.push(...(await amministratoriDiCondominio(condominio)));
  }

  if (!body.salvaComeBozza && unici.length === 0) {
    throw badRequest(
      daAmministratore
        ? 'Il condominio non ha condòmini attivi: impossibile recapitare la comunicazione'
        : 'Seleziona almeno un destinatario',
    );
  }

  const base = await Comunicazione.findById(body.rispostaA).lean<ComunicazioneDoc>();
  if (body.rispostaA && !base) throw notFound('Comunicazione a cui rispondere non trovata');
  if (body.rispostaA) await assicuraAccesso(base!, utente.sub, utente.role);

  const preparato = preparaComunicazione({
    mittente: utente.sub,
    condominio,
    tipo: body.tipo,
    oggetto: body.oggetto,
    corpo: body.corpo,
    destinatario: body.destinatario,
    destinatari: unici,
    unita: body.unita,
    threadId: base?.threadId ? String(base.threadId) : base ? String(base._id) : undefined,
    rispostaA: body.rispostaA,
    richiedeRisposta: body.richiedeRisposta,
    allegati: caricati,
    salvaComeBozza: body.salvaComeBozza,
  });

  if (body.assemblea) preparato.assemblea = oid(body.assemblea);

  const doc = await Comunicazione.create(preparato as object);

  // Gli allegati appena agganciati smettono di scadere: senza questo l'indice TTL
  // li cancellerebbe dopo 24 ore e la comunicazione resterebbe con un file
  // sparito. Solo se la comunicazione è stata inviata: una bozza abbandonata deve
  // poter perdere i file.
  if (doc.stato === 'inviata') {
    await rendiPermanenti(doc.allegati as unknown as string[]);
  }

  if (base) {
    await Comunicazione.updateOne({ _id: base._id }, { stato: 'risposta' });
  }

  await auditLog({
    condominio,
    attore: utente.sub,
    azione: 'creazione_comunicazione',
    entita: 'Comunicazione',
    entitaId: String(doc._id),
    dettagli: { tipo: doc.tipo, stato: doc.stato, destinatari: unici.length },
    req,
  });

  created(res, await espandiAllegato(doc));
});

export const invia = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const doc = await Comunicazione.findOne({ _id: req.params.id, mittente: utente.sub, stato: 'bozza' });
  if (!doc) throw notFound('Bozza non trovata');
  if (!doc.destinatario && (doc.destinatari ?? []).length === 0 && (doc.unita ?? []).length === 0) {
    throw badRequest('Aggiungi almeno un destinatario prima di inviare');
  }

  doc.stato = 'inviata';
  doc.dataInvio = new Date();
  await doc.save();
  ok(res, doc);
});

export const segnaLetta = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const doc = await Comunicazione.findById(req.params.id);
  if (!doc) throw notFound('Comunicazione non trovata');
  await assicuraAccesso(doc as unknown as ComunicazioneDoc, utente.sub, utente.role);
  ok(res, await marcaLetta(String(doc._id), utente.sub));
});

export const rispondi = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const originale = await Comunicazione.findById(req.params.id);
  if (!originale) throw notFound('Comunicazione non trovata');
  await assicuraAccesso(originale as unknown as ComunicazioneDoc, utente.sub, utente.role);

  const body = req.body as { corpo: string };
  // Una risposta può avere i suoi allegati, e arrivano come file: gli id li
  // produce `toAllegati`, non il corpo validato.
  const caricati = await toAllegati(req);

  const risposta = await Comunicazione.create({
    condominio: originale.condominio,
    assemblea: originale.assemblea,
    tipo: 'risposta',
    stato: 'inviata',
    dataInvio: new Date(),
    mittente: oid(utente.sub),
    destinatario: originale.mittente,
    oggetto: `Re: ${originale.oggetto.replace(/^Re:\s*/, '')}`,
    corpo: body.corpo,
    allegati: caricati.map((a) => new Types.ObjectId(a)),
    threadId: originale.threadId ?? originale._id,
    rispostaA: originale._id,
    richiedeRisposta: false,
  });

  // La risposta parte subito, quindi i suoi file non devono scadere.
  await rendiPermanenti(caricati);

  originale.stato = 'risposta';
  await originale.save();

  created(res, await espandiAllegato(risposta));
});

export const update = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const esistente = await Comunicazione.findOne({
    _id: req.params.id,
    mittente: utente.sub,
    stato: 'bozza',
  });
  if (!esistente) throw notFound('Bozza non trovata o non tua');

  // I file appena caricati e quelli da togliere arrivano qui; il resto del corpo
  // è già stato validato e ripulito da `validate`, quindi non contiene chiavi in
  // grado di scrivere campi non previsti.
  const caricati = await toAllegati(req);
  const corpo = { ...req.body } as Record<string, unknown>;
  delete corpo.allegati;

  const rimossi = String(corpo.rimuoviAllegati ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const precedenti = (esistente.allegati as unknown as string[]).map(String);
  const tenuti = precedenti.filter((id) => !rimossi.includes(id));

  // La cancellazione del file avviene **dopo** la scrittura: cancellando prima, un
  // salvataggio fallito lascerebbe il documento con un id che non porta più a
  // nessun file, e il documento non potrebbe più essere recuperato.
  const aggiornato = await Comunicazione.findOneAndUpdate(
    { _id: req.params.id, mittente: utente.sub, stato: 'bozza' },
    { ...corpo, allegati: [...tenuti, ...caricati].map((a) => new Types.ObjectId(a)) },
    { new: true, runValidators: true },
  );
  if (!aggiornato) throw notFound('Bozza non trovata o non tua');

  await eliminaSvincolati(rimossi);
  await rendiPermanenti(aggiornato.allegati as unknown as string[]);

  ok(res, await espandiAllegato(aggiornato));
});

export const remove = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const risultato = await Comunicazione.deleteOne({ _id: req.params.id, mittente: utente.sub, stato: 'bozza' });
  if (risultato.deletedCount === 0) {
    throw forbidden('Solo le proprie bozze possono essere eliminate');
  }
  noContent(res);
});

/** Cronologia completa di un utente: base per l'esportazione GDPR. */
export const mieDati = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const [comunicazioni, legami, audit] = await Promise.all([
    Comunicazione.find({
      $or: [
        { mittente: utente.sub },
        { destinatario: utente.sub },
        { destinatari: utente.sub },
      ],
    })
      .lean(),
    Condomino.find({ utente: utente.sub }).populate('unita', 'codice').lean(),
    AuditLog.find({ attore: utente.sub }).lean(),
  ]);

  ok(res, {
    comunicazioni: comunicazioni.map((c) => ({
      data: c.createdAt,
      tipo: c.tipo,
      stato: c.stato,
      oggetto: c.oggetto,
      corpo: c.corpo,
      ruolo: String(c.mittente) === utente.sub ? 'mittente' : 'destinatario',
    })),
    posizioni: legami,
    attivita: audit,
    esportatoIl: new Date(),
  });
});

async function condomioDiUnita(unitaId: string): Promise<string> {
  const unita = await Unita.findById(unitaId).select('condominio').lean();
  if (!unita) throw notFound('Unità immobiliare non trovata');
  return String(unita.condominio);
}

/** Tutti gli utenti attivi che hanno una posizione nel condominio. */
async function tuttiICondomini(condominioId: string): Promise<string[]> {
  const legs = await Condomino.find({ condominio: condominioId, attivo: true }).select('utente').lean();
  return [...new Set(legs.map((l) => String(l.utente)))];
}

async function condomioDiUtente(utenteId: string): Promise<string[]> {
  const legs = await Condomino.find({ utente: utenteId, attivo: true }).select('condominio').lean();
  return [...new Set(legs.map((l) => String(l.condominio)))];
}
