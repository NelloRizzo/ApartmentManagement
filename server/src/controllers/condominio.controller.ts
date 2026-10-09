import { Types } from 'mongoose';
import type { Request } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, noContent, paginated } from '../utils/http.js';
import { notFound, forbidden } from '../utils/errors.js';
import { paginazioneDa, regexDaTesto } from '../utils/pagination.js';
import {
  Allegato,
  Assemblea,
  Bilancio,
  Comunicazione,
  Condominio,
  Condomino,
  QuotaMillesimale,
  Unita,
  User,
  Verbale,
  Versamento,
} from '../models/index.js';
import { currentUser, puoEseguire } from '../middleware/auth.js';
import { auditLog } from '../services/audit.service.js';
import { generaCodiceCondominio } from '../services/condominio.service.js';
import { allineaUtente, passwordTemporanea } from '../services/ruolo.service.js';
import { inviaConfermaA } from '../services/confermaEmail.service.js';
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
            ripartizioniAttive: tabella.ripartizioniAttive,
            // `totale` contiene solo le ripartizioni presenti: su una tabella
            // vuota la chiave `diritto` manca e va letta come zero.
            totaleDiritto: tabella.totale.diritto ?? 0,
            problemi: tabella.problemi,
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

  // `codice` non arriva dal client: è generato qui, perché è univoco e compare
  // nei contratti. Lasciarlo a chi crea lo stabili lo renderebbe una sigla che
  // nessuno spiega, e che due amministratori possono scegliere uguale.
  const condominio = await Condominio.create({
    ...req.body,
    codice: await generaCodiceCondominio(req.body.nome),
    amministratore: utente.sub,
  });
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

/**
 * Cosa impedisce di cancellare un condominio.
 *
 * Ogni collezione che porta `condominio` va controllata: senza, cancellando lo
 * stabile resterebbero documenti che nessuna rotta può più raggiungere, perché
 * ogni rotta passa da `requireCondominioAccess` e chiede il condominio. Sono
 * dati persi in silenzio, il caso peggiore.
 *
 * `AuditLog` è escluso di proposito: è una traccia storica e non un documento
 * vivo, cancellare il condominio non deve cancellare la storia di quello che ci
 * è successo.
 */
/** Solo il conteggio serve: ogni modello ha il proprio tipo di documento. */
type Dipendenza = {
  etichetta: string;
  conta: (filtro: { condominio: Types.ObjectId }) => Promise<number>;
};

const DIPENDENZE: Dipendenza[] = [
  { etichetta: 'unità immobiliari', conta: (f) => Unita.countDocuments(f) },
  { etichetta: 'iscritti', conta: (f) => Condomino.countDocuments(f) },
  { etichetta: 'quote millesimali', conta: (f) => QuotaMillesimale.countDocuments(f) },
  { etichetta: 'assemblee', conta: (f) => Assemblea.countDocuments(f) },
  { etichetta: 'verbali', conta: (f) => Verbale.countDocuments(f) },
  { etichetta: 'bilanci', conta: (f) => Bilancio.countDocuments(f) },
  { etichetta: 'versamenti', conta: (f) => Versamento.countDocuments(f) },
  { etichetta: 'comunicazioni', conta: (f) => Comunicazione.countDocuments(f) },
  { etichetta: 'allegati', conta: (f) => Allegato.countDocuments(f) },
];

export const remove = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const condominioId = id(req.params.condominioId!);

  const conteggi = await Promise.all(
    DIPENDENZE.map(async (d) => ({ etichetta: d.etichetta, numero: await d.conta({ condominio: condominioId }) })),
  );
  const bloccanti = conteggi.filter((c) => c.numero > 0);

  if (bloccanti.length > 0) {
    throw forbidden(
      `Impossibile eliminare un condominio che ha ${bloccanti
        .map((c) => `${c.numero} ${c.etichetta}`)
        .join(', ')}: procedi con la disattivazione`,
    );
  }

  const risultato = await Condominio.deleteOne({ _id: condominioId, amministratore: utente.sub });
  if (risultato.deletedCount === 0) throw notFound('Condominio non trovato');
  noContent(res);
});

/**
 * Assegna del personale allo stabile, creandone l'account.
 *
 * Prima collegava un `utenteId` esistente senza impostargli il ruolo: il
 * collegamento non bastava, perché ogni guard decide su `role` e quel utente
 * restava un utente qualunque. Creare l'account qui risolve la contraddizione tra
 * "è in `condominiServito`" e "`role` vale `portiere`", che sono due modi di dire
 * la stessa cosa e possono divergere.
 *
 * I permessi sono una **lista vuota**, non `null`: il portiere serve uno stabile e
 * non ha alcun ambito delegato. È la forma più stretta di perimetro — non gli
 * si apre niente e non si esclude niente, ogni rotta decisa caso per caso — e
 * `null` significa accesso pieno, che qui aprirebbe versamenti, quote e bilanci
 * dello stabile in cui serve. La rubrica dei residenti non passa da qui: la
 * concede `requireRubrica` perché serva quello stabile.
 */
export const addServizio = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const body = req.body as {
    email: string;
    nome: string;
    cognome: string;
    telefono?: string;
    password?: string;
  };

  // Il titolare dello stabile è l'unico che può assegnare personale: è l'atto con
  // cui decide chi vede i dati dei residenti. Un assistente che lo farebbe
  // assegnerebbe la visibilità dei dati al posto suo.
  const stabile = await Condominio.findOne({
    _id: req.params.condominioId,
    amministratore: utente.sub,
  })
    .select('_id')
    .lean();
  if (!stabile) throw notFound('Condominio non trovato');

  const esistente = await User.findOne({ email: body.email });
  if (esistente) {
    if (esistente.role !== 'condomino' && esistente.role !== 'portiere') {
      throw forbidden('Questo utente ha già un ruolo amministrativo');
    }
  }

  const password = body.password ?? passwordTemporanea('Personale');
  const persona =
    esistente ??
    (await User.create({
      email: body.email,
      nome: body.nome,
      cognome: body.cognome,
      telefono: body.telefono,
      password: await User.hashPassword(password),
      role: 'portiere',
      // Lista vuota, non `null`: vedi la nota sul perimetro del ruolo.
      permessi: [],
      attivo: true,
      emailConfermato: false,
    }));

  if (esistente) {
    esistente.role = 'portiere';
    esistente.permessi = [];
    esistente.attivo = true;
    esistente.tokenVersion += 1;
    await esistente.save();
  }

  await Condominio.updateOne(
    { _id: req.params.condominioId, amministratore: utente.sub },
    { $addToSet: { condominiServito: persona._id } },
  );
  await allineaUtente(persona._id);

  // La password provvisoria viaggia solo nell'email: nel registro operazioni non
  // deve finire, e senza questa email il portiere non potrebbe accedere.
  const conferma = await inviaConfermaA(persona, {
    passwordProvvisoria: body.password ? undefined : password,
    organizzazione: 'un amministratore di condominio',
  });

  await auditLog({
    condominio: req.params.condominioId,
    attore: utente.sub,
    azione: 'assegnazione_personale',
    entita: 'User',
    entitaId: String(persona._id),
    dettagli: { email: body.email, ruolo: 'portiere', confermaInviata: conferma.esito.inviato },
    req,
  });

  created(res, {
    id: String(persona._id),
    nome: persona.nome,
    cognome: persona.cognome,
    email: persona.email,
    telefono: persona.telefono,
    emailConfermato: persona.emailConfermato ?? false,
    conferma: {
      inviata: conferma.esito.inviato,
      motivo: conferma.motivo ?? null,
      scadenza: conferma.scadenza ?? null,
    },
    // Se l'email non è partita la password va consegnata a mano: senza di lei il
    // portiere non potrebbe accedere, e nessuno potrebbe sapere qual è.
    ...(conferma.esito.inviato || body.password
      ? {}
      : { passwordDaConsegnare: true, motivoInvio: conferma.motivo ?? null }),
  });
});

/** Una persona di `condominiServito` dopo il popolamento. */
interface PersonaAssegnata {
  _id: Types.ObjectId;
  nome: string;
  cognome: string;
  email: string;
  telefono?: string;
  attivo: boolean;
  emailConfermato?: boolean;
}

/** Il personale attualmente assegnato allo stabile. */
export const listServizi = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const condominio = await Condominio.findOne({ _id: req.params.condominioId, amministratore: utente.sub })
    .populate<{ condominiServito: PersonaAssegnata[] }>(
      'condominiServito',
      'nome cognome email telefono attivo emailConfermato',
    )
    .lean();
  if (!condominio) throw notFound('Condominio non trovato');
  ok(res, condominio.condominiServito);
});

/**
 * Revoca l'incarico: toglie il legame dallo stabile.
 *
 * Non cancella l'utente, come `revocaAssistente`: se serve un altro stabile deve
 * poter continuare a lavorare lì, e i compiti che ha già fatto non si cancellano
 * con lui. Se invece questo era l'unico incarico, l'account viene **disattivato**,
 * come per l'assistente: altrimenti resterebbe un accesso con password in mano a
 * chi non serve più lo stabile, e senza nessuna rotta per eliminarlo.
 */
export const removeServizio = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const condominio = await Condominio.findOneAndUpdate(
    { _id: req.params.condominioId, amministratore: utente.sub },
    { $pull: { condominiServito: id(req.params.utenteId!) } },
    { new: true },
  );
  if (!condominio) throw notFound('Condominio non trovato');

  const personaId = req.params.utenteId!;
  const serveAltro = await Condominio.exists({ condominiServito: id(personaId) });
  if (!serveAltro) {
    await User.updateOne(
      { _id: id(personaId) },
      { attivo: false, tokenVersion: 1 },
    );
  }
  await allineaUtente(personaId);

  await auditLog({
    condominio: req.params.condominioId,
    attore: utente.sub,
    azione: 'revoca_personale',
    entita: 'User',
    entitaId: personaId,
    dettagli: { disattivato: !serveAltro },
    req,
  });

  ok(res, condominio.condominiServito.map(String));
});
