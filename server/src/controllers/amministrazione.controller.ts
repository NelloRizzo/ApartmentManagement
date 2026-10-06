import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, noContent, paginated } from '../utils/http.js';
import { badRequest, conflict, forbidden, notFound, AppError } from '../utils/errors.js';
import { getObjectId, paginazioneDa, regexDaTesto } from '../utils/pagination.js';
import { Condomino, Condominio, User, type CondominioDoc, type UserDoc } from '../models/index.js';
import { currentUser } from '../middleware/auth.js';
import { auditLog } from '../services/audit.service.js';
import { allineaUtente, passwordTemporanea } from '../services/ruolo.service.js';
import { inviaConfermaA, reinviaConferma } from '../services/confermaEmail.service.js';
import { AMBITI, TUTTI_I_PERMESSI, isPermesso, type Permesso } from '../types/domain.js';

const oid = (v: string): Types.ObjectId => new Types.ObjectId(String(v));

/** Normalizza e valida un elenco di permessi in arrivo dal client. */
function pulisciPermessi(ingresso: unknown): Permesso[] {
  if (!Array.isArray(ingresso)) {
    throw badRequest('I permessi devono essere un elenco');
  }
  const invalidi = ingresso.filter((p) => typeof p !== 'string' || !isPermesso(p as string));
  if (invalidi.length > 0) {
    throw badRequest('Permessi non riconosciuti', {
      invalidi,
      ammessi: AMBITI.map((a) => a.chiave),
    });
  }
  // Deduplicati: un elenco duplicato non deve ingannare chi lo legge.
  return [...new Set(ingresso as Permesso[])];
}

function riepilogoCollaboratore(u: UserDoc & { condominiAssistente?: Types.ObjectId[] }) {
  const accessoPieno = !u.permessi;
  return {
    id: String(u._id),
    email: u.email,
    nome: u.nome,
    cognome: u.cognome,
    nomeCompleto: `${u.nome} ${u.cognome}`.trim(),
    role: u.role,
    attivo: u.attivo,
    telefono: u.telefono,
    /** `true` se non ha restrizioni; in quel caso `permessi` è un elenco vuoto. */
    accessoPieno,
    permessi: accessoPieno ? TUTTI_I_PERMESSI : (u.permessi ?? []),
    delegatoDa: u.delegatoDa ? String(u.delegatoDa) : null,
    dataDelega: u.dataDelega ?? null,
    ultimoAccesso: u.ultimoAccesso ?? null,
    emailConfermato: u.emailConfermato ?? true,
    confermaInviataIl: u.confermaEmailInviataIl ?? null,
    creatoIl: u.createdAt,
  };
}

/**
 * Amministrazione di sistema: gli amministratori del servizio.
 * Riservata al superadmin.
 */
export const listAmministratori = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  if (utente.role !== 'superadmin') throw forbidden('Operazione riservata all’amministratore di sistema');

  const q = req.query as unknown as { page: number; limit: number; search?: string; sort: string; order: 'asc' | 'desc' };
  const { page, limit, sort, order } = paginazioneDa(q, 'cognome');

  const query: Record<string, unknown> = { role: { $in: ['admin', 'superadmin'] } };
  if (q.search) {
    query.$and = [
      { $or: [{ nome: regexDaTesto(q.search) }, { cognome: regexDaTesto(q.search) }, { email: regexDaTesto(q.search) }] },
    ];
  }

  const [documenti, totale] = await Promise.all([
    User.find(query)
      .sort({ [sort]: order === 'asc' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(query),
  ]);

  paginated(res, documenti.map(riepilogoCollaboratore), totale, page, limit);
});

export const creaAmministratore = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  if (utente.role !== 'superadmin') throw forbidden('Operazione riservata all’amministratore di sistema');

  const body = req.body as {
    email: string;
    nome: string;
    cognome: string;
    telefono?: string;
    password: string;
  };

  const esistente = await User.findOne({ email: body.email });
  if (esistente) throw conflict('Esiste già un utente con questa email');

  const amministratore = await User.create({
    email: body.email,
    nome: body.nome,
    cognome: body.cognome,
    telefono: body.telefono,
    password: await User.hashPassword(body.password),
    role: 'admin',
    // `null`: l'amministratore nasce con accesso pieno e può poi delegare.
    permessi: null,
    attivo: true,
    emailConfermato: false,
  });

  const conferma = await inviaConfermaA(amministratore, { organizzazione: 'Steward' });

  await auditLog({
    attore: utente.sub,
    azione: 'creazione_amministratore',
    entita: 'User',
    entitaId: String(amministratore._id),
    // Nessuna password nel log: l'audit è letto da più persone e finisce in
    // chiaro sul database.
    dettagli: { email: body.email, role: 'admin', confermaInviata: conferma.esito.inviato },
    req,
  });

  const riepilogo = riepilogoCollaboratore(amministratore);

  created(res, {
    ...riepilogo,
    // Se l'email non è partita chi ha creato l'utente deve saperlo: l'account
    // resta valido, ma nessuno potrà confermare l'indirizzo.
    conferma: {
      emailConfermato: riepilogo.emailConfermato,
      inviata: conferma.esito.inviato,
      motivo: conferma.motivo ?? null,
      scadenza: conferma.scadenza ?? null,
    },
  });
});

export const aggiornaAmministratore = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  if (utente.role !== 'superadmin') throw forbidden('Operazione riservata all’amministratore di sistema');

  const id = getObjectId(req.params.id ?? '', 'id');
  const target = await User.findById(id);
  if (!target) throw notFound('Amministratore non trovato');
  if (target.role !== 'admin' && target.role !== 'superadmin') {
    throw badRequest('L’utente indicato non è un amministratore');
  }

  const body = req.body as {
    nome?: string;
    cognome?: string;
    telefono?: string | null;
    attivo?: boolean;
    permessi?: unknown;
  };

  if (body.nome !== undefined) target.nome = body.nome;
  if (body.cognome !== undefined) target.cognome = body.cognome;
  if (body.telefono !== undefined) target.telefono = body.telefono ?? undefined;
  if (body.attivo !== undefined) {
    if (String(target._id) === utente.sub && !body.attivo) {
      throw badRequest('Non puoi disattivare il tuo stesso account');
    }
    target.attivo = body.attivo;
    // Disattivare o cambiare i permessi deve chiudere le sessioni già aperte.
    if (!body.attivo) target.tokenVersion += 1;
  }
  if (body.permessi !== undefined) {
    if (target.role === 'superadmin') {
      throw badRequest('Un amministratore di sistema ha sempre accesso pieno');
    }
    // `null` rimuove la delega e restituisce l'accesso pieno: senza questa via
    // una volta ristretti i permessi non si potrebbe tornare indietro.
    target.permessi = body.permessi === null ? null : pulisciPermessi(body.permessi);
    target.tokenVersion += 1;
  }

  await target.save();
  await auditLog({
    attore: utente.sub,
    azione: 'aggiornamento_amministratore',
    entita: 'User',
    entitaId: String(target._id),
    dettagli: { attivo: target.attivo, permessi: target.permessi },
    req,
  });

  ok(res, riepilogoCollaboratore(target));
});

export const rimuoviAmministratore = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  if (utente.role !== 'superadmin') throw forbidden('Operazione riservata all’amministratore di sistema');

  const id = getObjectId(req.params.id ?? '', 'id');
  if (String(id) === utente.sub) throw badRequest('Non puoi eliminare il tuo stesso account');

  const target = await User.findById(id);
  if (!target) throw notFound('Amministratore non trovato');
  if (target.role === 'superadmin') {
    const altri = await User.countDocuments({ role: 'superadmin', _id: { $ne: id } });
    if (altri === 0) throw conflict('Deve restare almeno un amministratore di sistema');
  }

  const gestiti = await Condominio.countDocuments({ amministratore: id });
  if (gestiti > 0) {
    throw conflict(
      `L’amministratore segue ${gestiti} ${gestiti === 1 ? 'condominio' : 'condomini'}: trasferiscili prima di eliminarlo`,
      { condominiGestiti: gestiti },
    );
  }

  await Condominio.updateMany({ assistenti: id }, { $pull: { assistenti: id } });
  await User.deleteOne({ _id: id });

  await auditLog({
    attore: utente.sub,
    azione: 'eliminazione_amministratore',
    entita: 'User',
    entitaId: id,
    dettagli: { email: target.email },
    req,
  });

  noContent(res);
});

/**
 * Deleghe: gli assistenti che l'amministratore può usare sui propri condomini.
 * Un assistente è un utente con ruolo `admin` e permessi ristretti.
 */
export const listAssistenti = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  if (utente.role !== 'admin' && utente.role !== 'superadmin') {
    throw forbidden('Operazione riservata agli amministratori');
  }

  const q = req.query as unknown as { page: number; limit: number; search?: string; sort: string; order: 'asc' | 'desc' };
  const { page, limit, sort, order } = paginazioneDa(q, 'cognome');

  // Gli assistenti sono gli utenti comparsi nell'elenco `assistenti` dei
  // condomini che l'interessato amministra.
  const mieiCondomini = await Condominio.find(
    utente.role === 'superadmin' ? {} : { amministratore: utente.sub },
  )
    .select('_id assistenti')
    .lean<Pick<CondominioDoc, '_id' | 'assistenti'>[]>();

  const perCondominio = new Map<string, string>();
  for (const c of mieiCondomini) {
    for (const a of c.assistenti) perCondominio.set(String(a), String(c._id));
  }
  const ids = [...perCondominio.keys()];
  if (ids.length === 0) {
    paginated(res, [], 0, page, limit);
    return;
  }

  const query: Record<string, unknown> = { _id: { $in: ids.map((i) => oid(i)) } };
  if (q.search) {
    query.$and = [
      { $or: [{ nome: regexDaTesto(q.search) }, { cognome: regexDaTesto(q.search) }, { email: regexDaTesto(q.search) }] },
    ];
  }

  const [documenti, totale] = await Promise.all([
    User.find(query)
      .sort({ [sort]: order === 'asc' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(query),
  ]);

  paginated(
    res,
    documenti.map((u) => ({ ...riepilogoCollaboratore(u), condominoDelegato: perCondominio.get(String(u._id)) })),
    totale,
    page,
    limit,
  );
});

/**
 * Crea un assistente. Se l'email corrisponde già a un utente esistente che non
 * ha ancora ruolo amministrativo, lo converte in assistente: evita di creare
 * account duplicati quando qualcuno è già un condòmino.
 */
export const creaAssistente = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  if (utente.role !== 'admin') {
    throw forbidden('Solo un amministratore può delegare un assistente');
  }

  const body = req.body as {
    email: string;
    nome?: string;
    cognome?: string;
    telefono?: string;
    password?: string;
    permessi: unknown;
  };

  const permessi = pulisciPermessi(body.permessi);
  const esistente = await User.findOne({ email: body.email });

  if (esistente && esistente.role !== 'condomino' && esistente.role !== 'portiere') {
    throw conflict('Questo utente ha già un ruolo amministrativo');
  }

  let assistente: UserDoc;
  let conferma: Awaited<ReturnType<typeof inviaConfermaA>> | null = null;
  if (esistente) {
    if (!body.nome) throw badRequest('Indica il nome per l’assistente');
    if (!body.cognome) throw badRequest('Indica il cognome per l’assistente');
    esistente.role = 'admin';
    esistente.permessi = permessi;
    esistente.delegatoDa = oid(utente.sub);
    esistente.dataDelega = new Date();
    esistente.tokenVersion += 1;
    await esistente.save();
    assistente = esistente;
  } else {
    if (!body.nome) throw badRequest('Nome obbligatorio');
    if (!body.cognome) throw badRequest('Cognome obbligatorio');
    const password = body.password ?? passwordTemporanea('Assistente');
    assistente = await User.create({
      email: body.email,
      nome: body.nome,
      cognome: body.cognome,
      telefono: body.telefono,
      password: await User.hashPassword(password),
      role: 'admin',
      permessi,
      delegatoDa: oid(utente.sub),
      dataDelega: new Date(),
      attivo: true,
      emailConfermato: false,
    });

    // La password provvisoria viaggia solo nell'email: prima finiva nel log di
    // audit, in chiaro, e non tornava in nessuna risposta, quindi nessuno
    // poteva consegnarla all'assistente.
    conferma = await inviaConfermaA(assistente, {
      passwordProvvisoria: body.password ? undefined : password,
      organizzazione: 'un amministratore di condominio',
    });

    await auditLog({
      attore: utente.sub,
      azione: 'creazione_assistente',
      entita: 'User',
      entitaId: String(assistente._id),
      dettagli: { email: body.email, permessi, confermaInviata: conferma.esito.inviato },
      req,
    });
  }

  await registraDelegazione(assistente, utente.sub);
  await allineaUtente(assistente._id);

  created(res, {
    ...riepilogoCollaboratore(assistente),
    // Se l'email non è partita, la password va consegnata a mano: senza di lei
    // l'assistente non potrebbe accedere.
    ...(conferma && !conferma.esito.inviato && !body.password
      ? { passwordDaConsegnare: true, motivoInvio: conferma.motivo ?? null }
      : {}),
    conferma: {
      emailConfermato: assistente.emailConfermato ?? true,
      inviata: conferma?.esito.inviato ?? false,
      motivo: conferma?.motivo ?? (conferma ? null : 'non_configurato'),
      scadenza: conferma?.scadenza ?? null,
    },
  });
});

export const aggiornaAssistente = asyncHandler(async (req, res) => {
  const delegante = currentUser(req);
  if (delegante.role !== 'admin') {
    throw forbidden('Solo un amministratore può modificare le deleghe');
  }

  const id = getObjectId(req.params.id ?? '', 'id');
  if (String(id) === delegante.sub) throw badRequest('Non puoi modificare le tue stesse deleghe');

  const assistente = await User.findById(id);
  if (!assistente) throw notFound('Assistente non trovato');

  const mio = await Condominio.findOne({ amministratore: delegante.sub, assistenti: id });
  if (!mio) throw forbidden('Questo assistente non è tuo');

  const body = req.body as {
    permessi?: unknown;
    nome?: string;
    cognome?: string;
    telefono?: string | null;
    attivo?: boolean;
  };

  if (body.permessi !== undefined) {
    assistente.permessi = pulisciPermessi(body.permessi);
    // Le sessioni aperte devono prendere subito i nuovi limiti.
    assistente.tokenVersion += 1;
  }
  if (body.nome !== undefined) assistente.nome = body.nome;
  if (body.cognome !== undefined) assistente.cognome = body.cognome;
  if (body.telefono !== undefined) assistente.telefono = body.telefono ?? undefined;
  if (body.attivo !== undefined) {
    assistente.attivo = body.attivo;
    assistente.tokenVersion += 1;
  }

  await assistente.save();
  await auditLog({
    condominio: String(mio._id),
    attore: delegante.sub,
    azione: 'aggiornamento_deleghe',
    entita: 'User',
    entitaId: String(assistente._id),
    dettagli: { permessi: assistente.permessi, attivo: assistente.attivo },
    req,
  });

  ok(res, riepilogoCollaboratore(assistente));
});

export const revocaAssistente = asyncHandler(async (req, res) => {
  const delegante = currentUser(req);
  if (delegante.role !== 'admin') {
    throw forbidden('Solo un amministratore può revocare un assistente');
  }

  const id = getObjectId(req.params.id ?? '', 'id');
  const assistente = await User.findById(id);
  if (!assistente) throw notFound('Assistente non trovato');

  const risultato = await Condominio.updateMany({ amministratore: delegante.sub }, { $pull: { assistenti: id } });
  if (risultato.modifiedCount === 0) throw forbidden('Questo assistente non è tuo');

  // Torna un semplice condòmino se lo era, altrimenti viene disattivato.
  const haRuolo = await Condomino.exists({ utente: id, attivo: true });
  if (haRuolo) {
    await User.updateOne({ _id: id }, { role: 'condomino', permessi: null, $unset: { delegatoDa: 1 } });
  } else {
    await User.updateOne(
      { _id: id },
      { role: 'condomino', permessi: null, attivo: false, tokenVersion: 1, $unset: { delegatoDa: 1 } },
    );
  }

  await allineaUtente(id);

  await auditLog({
    attore: delegante.sub,
    azione: 'revoca_delega',
    entita: 'User',
    entitaId: String(id),
    dettagli: { condominiRimossi: risultato.modifiedCount },
    req,
  });

  noContent(res);
});

/** Rende un utente assistente su tutti i condomini che l'interessato amministra. */
async function registraDelegazione(assistente: UserDoc, deleganteId: string): Promise<void> {
  await Condominio.updateMany(
    { amministratore: deleganteId },
    { $addToSet: { assistenti: assistente._id } },
  );
}

/** Ambiti delegabili, per costruire l'interfaccia senza duplicare la lista. */
export const catalogoAmbiti = asyncHandler(async (_req, res) => {
  ok(res, {
    ambiti: AMBITI,
    permessi: TUTTI_I_PERMESSI,
    nota: 'Il permesso in scrittura implica quello in lettura.',
  });
});
/** Reinvia la conferma dell'indirizzo a un amministratore. */
export const reinviaConfermaAmministratore = asyncHandler(async (req, res) => {
  const attore = currentUser(req);
  if (attore.role !== 'superadmin') throw forbidden('Operazione riservata all’amministratore di sistema');

  const id = getObjectId(req.params.id ?? '', 'id');
  const target = await User.findById(id);
  if (!target) throw notFound('Amministratore non trovato');
  if (target.role !== 'admin' && target.role !== 'superadmin') {
    throw badRequest('L’utente indicato non è un amministratore');
  }

  const risultato = await reinviaConferma(target);
  if (!risultato.esito.inviato) {
    throw new AppError(
      risultato.motivo === 'non_configurato'
        ? 'L’invio delle email non è configurato su questo server'
        : 'Invio non riuscito: riprova tra qualche minuto',
      503,
      'EMAIL_NON_DISPONIBILE',
    );
  }

  await auditLog({
    attore: attore.sub,
    azione: 'conferma_email_rinviata',
    entita: 'User',
    entitaId: String(target._id),
    dettagli: { email: target.email, da: 'superadmin' },
    req,
  });

  ok(res, { inviato: true, scadenza: risultato.scadenza });
});

/**
 * Reimposta la password di un amministratore e reinvia l'email di conferma.
 *
 * La nuova password non la sceglie chi preme il pulsante: viene generata e
 * consegnata solo nell'email, come alla creazione dell'account. Nessuno la
 * vede e nessuno la trasmette a voce, quindi non può finire in un log né in una
 * chat.
 */
export const reimpostaPasswordAmministratore = asyncHandler(async (req, res) => {
  const attore = currentUser(req);
  if (attore.role !== 'superadmin') throw forbidden('Operazione riservata all’amministratore di sistema');

  const id = getObjectId(req.params.id ?? '', 'id');
  // Il proprio account si cambia dal profilo: qui la nuova password tornerebbe
  // via email a chi sta già dentro, e le sessioni aperte resterebbero valide
  // fino al primo logout.
  if (String(id) === attore.sub) throw badRequest('Non puoi reimpostare la password del tuo stesso account');

  // `+password`: il campo è `select: false` e serve per tornare indietro.
  const target = await User.findById(id).select('+password');
  if (!target) throw notFound('Amministratore non trovato');
  if (target.role !== 'admin' && target.role !== 'superadmin') {
    throw badRequest('L’utente indicato non è un amministratore');
  }

  const password = passwordTemporanea('Admin');
  const precedente = {
    password: target.password,
    tokenVersion: target.tokenVersion,
    emailConfermato: target.emailConfermato,
    emailConfermatoIl: target.emailConfermatoIl,
  };

  target.password = await User.hashPassword(password);
  // Le sessioni già aperte cadono subito: la password è cambiata e chi le aveva
  // non deve continuare a usare un accesso vecchio.
  target.tokenVersion += 1;
  // L'indirizzo torna da verificare: la nuova password è arrivata per email,
  // quindi la casella va ripercorso come alla creazione dell'account.
  target.emailConfermato = false;
  target.emailConfermatoIl = undefined;
  await target.save();

  const conferma = await inviaConfermaA(target, {
    passwordProvvisoria: password,
    organizzazione: 'l’amministratore di sistema',
  });

  if (!conferma.esito.inviato) {
    // Si torna indietro: se l'email non parte l'amministratore resterebbe con
    // una password che non conosce e che nessuno ha ricevuto, cioè fuori
    // accesso senza via d'uscita. Il reinvio si ripete premendo il pulsante.
    target.password = precedente.password;
    target.tokenVersion = precedente.tokenVersion;
    target.emailConfermato = precedente.emailConfermato;
    target.emailConfermatoIl = precedente.emailConfermatoIl;
    await target.save();

    throw new AppError(
      conferma.motivo === 'non_configurato'
        ? 'L’invio delle email non è configurato su questo server'
        : 'Invio non riuscito: la password non è stata cambiata, riprova tra qualche minuto',
      503,
      'EMAIL_NON_DISPONIBILE',
    );
  }

  await auditLog({
    attore: attore.sub,
    azione: 'reset_password_amministratore',
    entita: 'User',
    entitaId: String(target._id),
    // Nessuna password nel log: l'audit è letto da più persone e finisce in
    // chiaro sul database. La password esiste solo nell'email appena inviata.
    dettagli: { email: target.email, da: 'superadmin' },
    req,
  });

  ok(res, { inviato: true, scadenza: conferma.scadenza });
});

/** Reinvia la conferma dell'indirizzo a un assistente del proprio team. */
export const reinviaConfermaAssistente = asyncHandler(async (req, res) => {
  const delegante = currentUser(req);
  if (delegante.role !== 'admin') throw forbidden('Solo un amministratore può gestire il proprio team');

  const id = getObjectId(req.params.id ?? '', 'id');
  const assistente = await User.findById(id);
  if (!assistente) throw notFound('Assistente non trovato');

  // Stesso controllo della modifica: l'assistente deve essere nei propri
  // condomini, altrimenti si potrebbe rinviare a chiunque.
  const mio = await Condominio.findOne({ amministratore: delegante.sub, assistenti: id });
  if (!mio) throw forbidden('Questo assistente non è tuo');

  const risultato = await reinviaConferma(assistente);
  if (!risultato.esito.inviato) {
    throw new AppError(
      risultato.motivo === 'non_configurato'
        ? 'L’invio delle email non è configurato su questo server'
        : 'Invio non riuscito: riprova tra qualche minuto',
      503,
      'EMAIL_NON_DISPONIBILE',
    );
  }

  await auditLog({
    attore: delegante.sub,
    azione: 'conferma_email_rinviata',
    entita: 'User',
    entitaId: String(assistente._id),
    dettagli: { email: assistente.email, da: 'amministratore' },
    req,
  });

  ok(res, { inviato: true, scadenza: risultato.scadenza });
});