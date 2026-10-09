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

  // Due popolazioni diverse: chi è in `assistenti` è del team su tutti gli
  // stabili, chi è in `condominiServito` è personale di **quello** stabile. La
  // pagina del team le mostra insieme perché nascono dallo stesso form, ma non le
  // confonde: la lista porta il ruolo e gli stabili di ciascuno.
  const mieiCondomini = await Condominio.find(
    utente.role === 'superadmin' ? {} : { amministratore: utente.sub },
  )
    .select('_id nome codice assistenti condominiServito')
    .lean<Pick<CondominioDoc, '_id' | 'nome' | 'codice' | 'assistenti' | 'condominiServito'>[]>();

  const perPersona = new Map<string, { ruolo: 'admin' | 'portiere'; stabili: { id: string; nome: string; codice: string }[] }>();
  const annota = (personaId: string, ruolo: 'admin' | 'portiere', stabile: { id: string; nome: string; codice: string }) => {
    const voce = perPersona.get(personaId) ?? { ruolo, stabili: [] };
    if (!voce.stabili.some((s) => s.id === stabile.id)) voce.stabili.push(stabile);
    perPersona.set(personaId, voce);
  };
  for (const c of mieiCondomini) {
    const stabile = { id: String(c._id), nome: c.nome, codice: c.codice };
    for (const a of c.assistenti) annota(String(a), 'admin', stabile);
    for (const p of c.condominiServito) annota(String(p), 'portiere', stabile);
  }

  const ids = [...perPersona.keys()];
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
    documenti.map((u) => {
      const voce = perPersona.get(String(u._id))!;
      return {
        ...riepilogoCollaboratore(u),
        ruolo: voce.ruolo,
        stabili: voce.stabili,
        // Tenuto per il form dell'assistente, che mostra lo stabile delegato.
        condominoDelegato: voce.stabili[0]?.id,
      };
    }),
    totale,
    page,
    limit,
  );
});

/**
 * Crea una persona del team: un **assistente**, che lavora su tutti gli stabili
 * dell'amministratore con gli ambiti che gli sono delegati, oppure il **personale
 * di un solo stabile**, che vede la rubrica dei residenti e i compiti che gli
 * vengono affidati.
 *
 * Le due forme sono alternative e nascono dallo stesso form, che chiede il ruolo con
 * un radio. Non è una comodità dell'interfaccia: è la scelta che evita due modi di
 * dire la stessa cosa. `registraDelegazione` aggiunge l'assistente a **tutti** gli
 * stabili del delegante, cosa che per il personale sarebbe sbagliato — quindi qui il
 * portiere viene collegato a **uno** stabile solo, e non passa da quella funzione.
 *
 * Se l'email corrisponde già a un utente esistente che non ha ancora ruolo
 * amministrativo, lo converte: evita di creare account duplicati quando qualcuno è
 * già un condòmino.
 */
export const creaAssistente = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  if (utente.role !== 'admin') {
    throw forbidden('Solo un amministratore può aggiungere una persona al proprio team');
  }

  const body = req.body as {
    ruolo: 'admin' | 'portiere';
    email: string;
    nome?: string;
    cognome?: string;
    telefono?: string;
    password?: string;
    condominioId?: string;
    permessi?: unknown;
  };
  const ruolo = body.ruolo ?? 'admin';
  const portiere = ruolo === 'portiere';
  const permessi = portiere ? [] : pulisciPermessi(body.permessi);

  // Il portiere va legato a uno stabilo **di chi lo crea**: senza questo controllo
  // si potrebbe assegnare personale a uno stabile altrui.
  if (portiere) {
    const stabile = await Condominio.exists({ _id: oid(body.condominioId!), amministratore: utente.sub });
    if (!stabile) throw notFound('Condominio non trovato o non amministrato da te');
  }

  const esistente = await User.findOne({ email: body.email });

  if (esistente && esistente.role !== 'condomino' && esistente.role !== 'portiere') {
    throw conflict('Questo utente ha già un ruolo amministrativo');
  }

  let assistente: UserDoc;
  let conferma: Awaited<ReturnType<typeof inviaConfermaA>> | null = null;
  if (esistente) {
    if (!body.nome) throw badRequest('Indica il nome della persona');
    if (!body.cognome) throw badRequest('Indica il cognome della persona');
    esistente.role = ruolo;
    esistente.permessi = permessi;
    esistente.attivo = true;
    esistente.tokenVersion += 1;
    // Il legame con il delegante è ciò che distingue l'assistente, e non compete al
    // personale dello stabile: lasciarlo su un account convertito darebbe a un
    // portiere l'accesso a **tutti** gli stabili dell'amministratore.
    if (portiere) {
      esistente.delegatoDa = undefined;
      esistente.dataDelega = undefined;
    } else {
      esistente.delegatoDa = oid(utente.sub);
      esistente.dataDelega = new Date();
    }
    await esistente.save();
    assistente = esistente;
  } else {
    if (!body.nome) throw badRequest('Nome obbligatorio');
    if (!body.cognome) throw badRequest('Cognome obbligatorio');
    const password = body.password ?? passwordTemporanea(portiere ? 'Personale' : 'Assistente');
    assistente = await User.create({
      email: body.email,
      nome: body.nome,
      cognome: body.cognome,
      telefono: body.telefono,
      password: await User.hashPassword(password),
      role: ruolo,
      // Lista vuota per il personale: è il perimetro più stretto, e `null` qui
      // aprirebbe tutto lo stabile. Vedi `requirePermessoLettura`.
      permessi,
      ...(portiere ? {} : { delegatoDa: oid(utente.sub), dataDelega: new Date() }),
      attivo: true,
      emailConfermato: false,
    });

    // La password provvisoria viaggia solo nell'email: prima finiva nel log di
    // audit, in chiaro, e non tornava in nessuna risposta, quindi nessuno
    // poteva consegnarla a chi l'aveva ricevuta.
    conferma = await inviaConfermaA(assistente, {
      passwordProvvisoria: body.password ? undefined : password,
      organizzazione: 'un amministratore di condominio',
    });

    await auditLog({
      attore: utente.sub,
      azione: portiere ? 'assegnazione_personale' : 'creazione_assistente',
      entita: 'User',
      entitaId: String(assistente._id),
      dettagli: {
        email: body.email,
        ruolo,
        ...(portiere ? { condominio: body.condominioId } : { permessi }),
        confermaInviata: conferma.esito.inviato,
      },
      ...(portiere ? { condominio: body.condominioId } : {}),
      req,
    });
  }

  if (portiere) {
    await Condominio.updateOne(
      { _id: oid(body.condominioId!), amministratore: utente.sub },
      { $addToSet: { condominiServito: assistente._id } },
    );
  } else {
    await registraDelegazione(assistente, utente.sub);
  }
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
    throw forbidden('Solo un amministratore può revocare una persona dal proprio team');
  }

  const id = getObjectId(req.params.id ?? '', 'id');
  const persona = await User.findById(id);
  if (!persona) throw notFound('Persona non trovata');

  // Il personale di uno stabile è legato da `condominiServito` e non da
  // `assistenti`: revocarne il legame dall'elenco degli assistenti non
  // toccerebbe niente e lascerebbe l'incarico in piedi.
  if (persona.role === 'portiere') {
    const risultato = await Condominio.updateMany(
      { amministratore: delegante.sub },
      { $pull: { condominiServito: id } },
    );
    if (risultato.modifiedCount === 0) throw forbidden('Questa persona non serve uno dei tuoi stabili');

    // Un portiere che non serve più nessuno stabile viene disattivato, come
    // l'assistente che non è più di nessuno: l'account resta e i compiti che ha
    // svolto restano, ma non c'è più una password in mano a chi non serve più.
    const serveAltro = await Condominio.exists({ condominiServito: id });
    if (!serveAltro) {
      await User.updateOne({ _id: id }, { attivo: false, tokenVersion: 1 });
    }
    await allineaUtente(id);

    await auditLog({
      attore: delegante.sub,
      azione: 'revoca_personale',
      entita: 'User',
      entitaId: String(id),
      dettagli: { stabiliRimossi: risultato.modifiedCount, disattivato: !serveAltro },
      req,
    });

    noContent(res);
    return;
  }

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