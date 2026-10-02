import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/http.js';
import { unauthorized, badRequest, AppError } from '../utils/errors.js';
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
import { auditLog } from '../services/audit.service.js';
import { allineaUtente, condominiDiRuolo } from '../services/ruolo.service.js';
import { confermaConToken, reinviaConferma } from '../services/confermaEmail.service.js';
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
}

/**
 * Profilo completo: identità, ruolo e posizioni nei condomini.
 *
 * Login, refresh e `/auth/me` restituiscono tutti questa stessa struttura: il
 * frontend ne ha bisogno subito per sapere quali condomini può selezionare,
 * senza dover fare una seconda richiesta.
 */
async function profiloCompleto(u: UtenteDaProfilare) {
  const [legami, amministrati, servito] = await Promise.all([
    Condomino.find({ utente: u._id, attivo: true })
      .populate('condominio', 'nome codice')
      .populate('unita', 'codice piano')
      .lean(),
    // L'amministratore e il suo assistente non compaiono in `Condomino`: i
    // condomini si ricavano dal condominio stesso.
    u.role === 'superadmin'
      ? Condominio.find().select('nome codice amministratore').lean()
      : u.role === 'admin'
        ? Condominio.find({ $or: [{ amministratore: u._id }, { assistenti: u._id }] })
            .select('nome codice amministratore')
            .lean()
        : Promise.resolve([]),
    u.role === 'portiere'
      ? Condominio.find({ condominiServito: u._id }).select('nome codice amministratore').lean()
      : Promise.resolve([]),
  ]);

  const posizioniDaLegame = legami.map((l) => {
    const c = l.condominio as unknown as { _id: unknown; nome?: string; codice?: string } | string;
    return {
      condominioId: String(typeof c === 'string' ? c : c._id),
      nome: typeof c === 'string' ? undefined : c.nome,
      codice: typeof c === 'string' ? undefined : c.codice,
      regime: l.regime,
      quota: l.quota,
      unita: (l.unita as unknown as { codice: string }[]).map((x) => x.codice),
    };
  });

  const giaPresenti = new Set(posizioniDaLegame.map((p) => p.condominioId));
  const posizioniDaRuolo = [...amministrati, ...servito]
    .filter((c) => !giaPresenti.has(String(c._id)))
    .map((c) => ({
      condominioId: String(c._id),
      nome: c.nome,
      codice: c.codice,
      // `quota: 0` segnala una posizione puramente operativa: non ci sono unità
      // di proprietà da mostrare nel riepilogo quote.
      regime: 'proprietario' as const,
      quota: 0,
      unita: [] as string[],
      /**
       * `true` quando l'utente non è il titolare: per l'assistente è il
       * condominio in cui opera per delega, per il superadmin uno dei tanti
       * stabili che vede ma non amministra. Il confronto non guarda il ruolo,
       * altrimenti il superadmin avrebbe `assistito: false` ovunque e le
       * sezioni di condominio gli offrirebbero strade che rispondono 403.
       */
      assistito: String(c.amministratore ?? '') !== String(u._id),
    }));

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
