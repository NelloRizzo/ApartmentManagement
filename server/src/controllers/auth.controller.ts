import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/http.js';
import { unauthorized, badRequest, conflict, AppError } from '../utils/errors.js';
import { Condomino, Condominio, User } from '../models/index.js';
import {
  signAccessToken,
  signRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  verifyRefreshToken,
} from '../middleware/token.js';
import { currentUser } from '../middleware/auth.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { auditLog } from '../services/audit.service.js';
import { allineaUtente, condominiDiRuolo } from '../services/ruolo.service.js';
import { confermaConToken, inviaConfermaConToken, reinviaConferma } from '../services/confermaEmail.service.js';
import { avvisaCambioIndirizzo, nuovoTokenConferma } from '../services/email.service.js';
import type { JwtUserPayload, Permesso, UserRole } from '../types/domain.js';

interface UtenteDaProfilare {
  _id: unknown;
  email: string;
  nome: string;
  cognome: string;
  role: UserRole;
  telefono?: string;
  /** `null` indica accesso pieno; un elenco limita le operazioni. */
  permessi?: Permesso[] | null;
  /** `false` finché l'indirizzo non è stato confermato: il frontend mostra un avviso. */
  emailConfermato?: boolean;
  /** Indirizzo proposto e ancora da confermare: il frontend lo mostra con l'annulla. */
  emailInAttesa?: string;
}

/**
 * Profilo completo: identità, ruolo e posizioni nei condomini.
 *
 * Login, refresh e `/auth/me` restituiscono tutti questa stessa struttura: il
 * frontend ne ha bisogno subito per sapere quali condomini può selezionare,
 * senza dover fare una seconda richiesta.
 *
 * Il superadmin non riceve posizioni: amministra la piattaforma e nessuno
 * stabile, quindi non ha condomìni da selezionare. Resta vero che le sue
 * richieste alle API dei condomini passano (`requireCondominioAccess` lo
 * lascia entrare per scelta e i test lo coprono): cambia solo ciò che il
 * profilo gli presenta come suo.
 */
async function profiloCompleto(u: UtenteDaProfilare) {
  const [legami, amministrati, servito] = await Promise.all([
    Condomino.find({ utente: u._id, attivo: true })
      .populate('condominio', 'nome codice amministratore')
      .populate('unita', 'codice piano')
      .lean(),
    // L'amministratore e il suo assistente non compaiono in `Condomino`: i
    // condomini si ricavano dal condominio stesso. Il superadmin resta fuori
    // per la ragione scritta sopra, non perché gli manchi un permesso: dargli
    // qui l'elenco completo li avrebbe presentati come posizioni sue, ed è
    // esattamente il difetto che doveva sparire.
    u.role === 'admin'
      ? Condominio.find({ $or: [{ amministratore: u._id }, { assistenti: u._id }] })
          .select('nome codice amministratore')
          .lean()
      : Promise.resolve([]),
    u.role === 'portiere'
      ? Condominio.find({ condominiServito: u._id }).select('nome codice amministratore').lean()
      : Promise.resolve([]),
  ]);

  const posizioniDaLegame = legami.map((l) => {
    const c = l.condominio as unknown as
      | { _id: unknown; nome?: string; codice?: string; amministratore?: unknown }
      | string;
    return {
      condominioId: String(typeof c === 'string' ? c : c._id),
      nome: typeof c === 'string' ? undefined : c.nome,
      codice: typeof c === 'string' ? undefined : c.codice,
      ruolo: 'condomino' as const,
      /**
       * `null` quando non è un legame di proprietà: un amministratore non è
       * "proprietario" del condominio che amministra, e dirglielo faceva
       * comparire un regime e una quota che non esistono. Prima qui finiva
       * `regime: 'proprietario'` come segnalatore, e il frontend non aveva modo
       * di distinguerlo da una posizione reale.
       */
      regime: l.regime,
      quota: l.quota,
      unita: (l.unita as unknown as { codice: string }[]).map((x) => x.codice),
      /**
       * `true` quando l'utente non è l'amministratore dello stabile: per
       * l'assistente è il condominio in cui opera per delega. Il confronto
       * guarda il solo campo `amministratore` e non il ruolo dell'utente, così
       * un amministratore che ha comprato un'altra unità resta comunque il
       * titolare di quell'unità.
       */
      assistito: String((c as { amministratore?: unknown }).amministratore ?? '') !== String(u._id),
    };
  });

  const giaPresenti = new Set(posizioniDaLegame.map((p) => p.condominioId));

  /**
   * Posizioni operative, cioè quelle che non vengono da un `Condomino`.
   *
   * Il ruolo è derivato dal confronto con `Condominio.amministratore` e non dal
   * ruolo dell'utente: un admin è amministratore in uno stabile e assistente in
   * un altro, e due righe con lo stesso testo sarebbero indistinguibili.
   */
  const posizioniDaRuolo = [...amministrati.map((c) => ({ c, servito: false })), ...servito.map((c) => ({ c, servito: true }))]
    .filter(({ c }) => !giaPresenti.has(String(c._id)))
    .map(({ c, servito: faServito }) => {
      const amministra = String(c.amministratore ?? '') === String(u._id);
      const ruolo = amministra ? 'amministratore' : faServito ? 'servito' : 'assistente';
      return {
        condominioId: String(c._id),
        nome: c.nome,
        codice: c.codice,
        ruolo: ruolo as 'amministratore' | 'servito' | 'assistente',
        regime: null as null,
        quota: 0,
        unita: [] as string[],
        assistito: !amministra,
      };
    });

  const condomini = [...posizioniDaLegame, ...posizioniDaRuolo];

  return {
    id: String(u._id),
    email: u.email,
    nome: u.nome,
    cognome: u.cognome,
    nomeCompleto: `${u.nome} ${u.cognome}`.trim(),
    role: u.role,
    telefono: u.telefono,
    // `null` = accesso pieno. Il frontend usa questo valore per nascondere le
    // sezioni non delegate e per disattivare i pulsanti di modifica.
    permessi: (u.permessi as Permesso[] | null) ?? null,
    isSuperadmin: u.role === 'superadmin',
    emailConfermato: u.emailConfermato ?? true,
    emailInAttesa: u.emailInAttesa ?? null,
    condominiIds: condomini.map((p) => p.condominioId),
    condomini,
  };
}

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

  const user = await User.findOne({ email }).select('+password +tokenVersion');
  if (!user) throw unauthorized('Credenziali non valide');
  if (!user.attivo) throw unauthorized('Account disattivato');
  if (!user.verifyPassword(password)) throw unauthorized('Credenziali non valide');

  user.ultimoAccesso = new Date();
  await user.save();

  const payload: JwtUserPayload = {
    sub: String(user._id),
    email: user.email,
    role: user.role,
    name: `${user.nome} ${user.cognome}`.trim(),
    condominiIds: await condominiDiRuolo(user._id, user.role),
    permessi: (user.permessi as Permesso[] | null) ?? null,
    tokenVersion: user.tokenVersion,
  };

  setRefreshCookie(res, signRefreshToken({ sub: payload.sub, tokenVersion: user.tokenVersion, type: 'refresh' }));

  await auditLog({
    condominio: payload.condominiIds[0],
    attore: String(user._id),
    azione: 'login',
    entita: 'User',
    entitaId: String(user._id),
    req,
  });

  res.json({ success: true, data: { accessToken: signAccessToken(payload), user: await profiloCompleto(user) } });
});

export const refresh = asyncHandler(async (_req, res) => {
  const token = _req.cookies?.[config.cookie.name] as string | undefined;
  if (!token) throw unauthorized('Refresh token mancante');

  const payload = verifyRefreshToken(token);
  const user = await User.findById(payload.sub).select('+tokenVersion');
  if (!user || !user.attivo) throw unauthorized('Sessione non valida');
  if (user.tokenVersion !== payload.tokenVersion) {
    clearRefreshCookie(res);
    throw unauthorized('Sessione revocata');
  }

  const next: JwtUserPayload = {
    sub: String(user._id),
    email: user.email,
    role: user.role,
    name: `${user.nome} ${user.cognome}`.trim(),
    condominiIds: await condominiDiRuolo(user._id, user.role),
    permessi: (user.permessi as Permesso[] | null) ?? null,
    tokenVersion: user.tokenVersion,
  };

  res.json({ success: true, data: { accessToken: signAccessToken(next), user: await profiloCompleto(user) } });
});

export const logout = asyncHandler(async (_req, res) => {
  clearRefreshCookie(res);
  ok(res, { message: 'Logout effettuato' });
});

export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(currentUser(req).sub);
  if (!user) throw unauthorized('Utente non trovato');

  // Gli utenti esistenti possono avere i campi denormalizzati disallineati.
  void allineaUtente(String(user._id));

  ok(res, await profiloCompleto(user));
});

export const updateProfile = asyncHandler(async (req, res) => {
  const dati = req.body as { nome?: string; cognome?: string; telefono?: string };
  const user = await User.findByIdAndUpdate(currentUser(req).sub, dati, { new: true, runValidators: true });
  ok(res, await profiloCompleto(user!));
});

export const changePassword = asyncHandler(async (req, res) => {
  const dati = req.body as { attuale: string; nuova: string };
  const user = await User.findById(currentUser(req).sub).select('+password');
  if (!user) throw unauthorized();
  if (!user.verifyPassword(dati.attuale)) throw badRequest('La password attuale non è corretta');
  if (dati.attuale === dati.nuova) throw badRequest('La nuova password deve essere diversa da quella attuale');

  user.password = await User.hashPassword(dati.nuova);
  user.tokenVersion += 1;
  await user.save();
  clearRefreshCookie(res);

  await auditLog({ attore: String(user._id), azione: 'password_cambiata', entita: 'User', entitaId: String(user._id), req });

  ok(res, { message: 'Password aggiornata, effettua nuovamente l’accesso' });
});

/**
 * Conferma l'indirizzo email con il token ricevuto.
 *
 * Rotta pubblica: chi clicca il link non è ancora collegato. Per questo il
 * frontend non richiama questa API navigando, ma passando il token con una
 * POST: i link delle email vengono aperti in anteprima dai filtri anti-spam,
 * e una GET consumerebbe il token senza che nessuno l'avesse ancora letto.
 */
export const confermaEmail = asyncHandler(async (req, res) => {
  const { token } = req.body as { token: string };
  const utente = await confermaConToken(token);

  await auditLog({
    attore: String(utente._id),
    azione: 'conferma_email_completata',
    entita: 'User',
    entitaId: String(utente._id),
    dettagli: { email: utente.email },
    req,
  });

  ok(res, { email: utente.email, emailConfermato: true });
});

/** Richiede un nuovo invio per il proprio indirizzo. */
export const reinviaConfermaEmail = asyncHandler(async (req, res) => {
  const utente = await User.findById(currentUser(req).sub);
  if (!utente) throw unauthorized();
  if (utente.emailConfermato) throw badRequest('L’indirizzo email è già confermato');

  const risultato = await reinviaConferma(utente);

  if (!risultato.esito.inviato) {
    throw new AppError(
      risultato.esito.motivo === 'non_configurato'
        ? 'L’invio delle email non è configurato su questo server'
        : 'Invio non riuscito: riprova tra qualche minuto',
      503,
      'EMAIL_NON_DISPONIBILE',
    );
  }

  await auditLog({
    attore: String(utente._id),
    azione: 'conferma_email_inviata',
    entita: 'User',
    entitaId: String(utente._id),
    req,
  });

  ok(res, { inviato: true, scadenza: risultato.scadenza });
});

/**
 * Propone un indirizzo email diverso da quello con cui si entra.
 *
 * **Il cambio non è immediato**: l'indirizzo nuovo sta in `emailInAttesa` e
 * diventa quello dell'account solo quando il token inviato a quella casella
 * viene usato. Il login è per indirizzo, quindi salvare subito significherebbe
 * che una cifra sbagliata tiene l'utente fuori e che oggi nessuno potrebbe
 * correggerla al posto suo: non esiste nessun altro modo di cambiare un'email.
 *
 * La password viene chiesta perché chi ha una sessione in mano non deve poter
 * dirottare anche il recupero dell'account.
 *
 * Un secondo tentativo sovrascrive il primo: c'è un solo `confermaEmailHash`, e
 * quindi un solo link valido.
 */
export const cambiaEmail = asyncHandler(async (req, res) => {
  const utente = await User.findById(currentUser(req).sub).select('+password');
  if (!utente) throw unauthorized();

  const body = req.body as { email: string; password: string };
  if (!utente.verifyPassword(body.password)) throw badRequest('La password non è corretta');
  // Un account non ancora confermato ha già una conferma in corso: accavallarle
  // lascerebbe due token per un solo hash, e uno dei due link morirebbe senza
  // che nessuno lo legga.
  if (!utente.emailConfermato) {
    throw badRequest('Conferma prima l’indirizzo attuale, poi ne potrai scegliere un altro');
  }
  if (body.email === utente.email) throw badRequest('È già il tuo indirizzo email');

  const occupato = await User.exists({ email: body.email, _id: { $ne: utente._id } });
  if (occupato) throw conflict('Esiste già un account con questo indirizzo email');

  // Il token è creato qui e non dentro `inviaConfermaConToken`: l'avviso alla
  // casella veccita porta il link di conferma e deve essere lo stesso.
  const token = nuovoTokenConferma();
  utente.emailInAttesa = body.email;
  await utente.save();

  const conferma = await inviaConfermaConToken(utente, token);

  // L'avviso alla casella precedente non blocca il cambio: è una difesa, non il
  // meccanismo. Se non parte resta un warn nel log.
  const avviso = await avvisaCambioIndirizzo({
    a: utente.email,
    nome: utente.nome,
    nuovo: body.email,
  });
  if (!avviso.inviato) {
    logger.warn(`Avviso di cambio indirizzo non arrivato a ${utente.email}: ${avviso.motivo}`);
  }

  if (!conferma.esito.inviato) {
    // La proposta resta, perché è innocua: senza il link non si conferma niente
    // e il pulsante per riprovare torna nel profilo.
    throw new AppError(
      conferma.motivo === 'non_configurato'
        ? 'L’invio delle email non è configurato su questo server'
        : 'Invio non riuscito: il cambio non è stato proposto, riprova tra qualche minuto',
      503,
      'EMAIL_NON_DISPONIBILE',
    );
  }

  await auditLog({
    attore: String(utente._id),
    azione: 'cambio_email_richiesto',
    entita: 'User',
    entitaId: String(utente._id),
    // Entrambi gli indirizzi in chiaro: il registro deve dire da dove si è partiti
    // e dove si voleva andare, ed è la tracciabilità di un cambio di accesso.
    dettagli: { da: utente.email, a: body.email, avvisoInviato: avviso.inviato },
    req,
  });

  ok(res, { email: utente.email, emailInAttesa: body.email, scadenza: conferma.scadenza });
});

/**
 * Annulla un cambio di indirizzo in corso.
 *
 * Senza questo il cambio si annullerebbe solo da sé, aspettando la scadenza del
 * token: chi ha sbagliato a digitare resterebbe davanti a un avviso che non può
 * togliere, e potrebbe pensare che l'indirizzo vecchio non valga più.
 */
export const annullaCambioEmail = asyncHandler(async (req, res) => {
  const utente = await User.findById(currentUser(req).sub);
  if (!utente) throw unauthorized();
  if (!utente.emailInAttesa) throw badRequest('Non c’è nessun cambio di indirizzo in corso');

  await User.updateOne(
    { _id: utente._id },
    { $unset: { emailInAttesa: '', confermaEmailHash: '', confermaEmailScadenza: '' } },
  );

  await auditLog({
    attore: String(utente._id),
    azione: 'cambio_email_annullato',
    entita: 'User',
    entitaId: String(utente._id),
    dettagli: { annullato: utente.emailInAttesa },
    req,
  });

  ok(res, { annullato: true, email: utente.email });
});
