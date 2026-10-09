import type { NextFunction, Request, RequestHandler, Response } from 'express';
import mongoose from 'mongoose';
import { User } from '../models/user.model.js';
import { Condominio } from '../models/condominio.model.js';
import { Condomino } from '../models/condomino.model.js';
import { verifyAccessToken } from './token.js';
import { condominiDiRuolo } from '../services/ruolo.service.js';
import { haPermesso, type Permesso } from '../types/domain.js';
import { forbidden, notFound, unauthorized } from '../utils/errors.js';
import type { UserRole } from '../types/domain.js';

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/**
 * Verifica il token e ricarica l'utente dal database a ogni richiesta.
 *
 * I permessi non vengono letti dal token: una delega revocata deve avere effetto
 * immediato, senza attendere la scadenza dell'access token.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const token = extractBearer(req);
    if (!token) throw unauthorized();

    const payload = verifyAccessToken(token);

    const user = await User.findById(payload.sub).select('+tokenVersion');
    if (!user) throw unauthorized('Utente non trovato');
    if (!user.attivo) throw forbidden('Account disattivato');
    if (user.tokenVersion !== payload.tokenVersion) throw unauthorized('Sessione non più valida');

    req.user = {
      sub: String(user._id),
      email: user.email,
      role: user.role,
      name: `${user.nome} ${user.cognome}`.trim(),
      condominiIds: await condominiDiRuolo(user._id, user.role),
      permessi: (user.permessi as Permesso[] | null) ?? null,
      tokenVersion: user.tokenVersion,
    };

    next();
  } catch (err) {
    next(err);
  }
};

export const requireRole =
  (...roles: UserRole[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(forbidden(`Ruolo ${req.user.role} non autorizzato per questa operazione`));
    }
    next();
  };

/**
 * Richiede uno dei permessi indicati.
 *
 * - il superadmin passa sempre;
 * - un amministratore senza elenco di permessi ha accesso pieno;
 * - un assistente deve avere il permesso, e `scrivere` implica `leggere`.
 *
 * Applicarlo solo alle rotte che modificano dati: per le letture il controllo
 * di condominio basta e il permesso di lettura è comunque implicato.
 */
export const requirePermesso =
  (...permessi: Permesso[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role === 'superadmin') return next();

    if (req.user.role !== 'admin') {
      return next(forbidden(`Ruolo ${req.user.role} non autorizzato per questa operazione`));
    }

    const assegnati = req.user.permessi;
    if (assegnati === null) return next();

    if (permessi.some((p) => haPermesso(assegnati, p))) return next();

    return next(
      forbidden('Non sei autorizzato a questa operazione: l’amministratore non ti ha delegato questo ambito'),
    );
  };

/**
 * Richiede il permesso di lettura su un ambito, senza vietare la rotta agli altri
 * ruoli.
 *
 * `requirePermesso` è pensato per le scritture e quindi esclude condòmini e
 * portieri. Sulle liste, invece, il filtro per utente è già dentro il controller e
 * ignorare l'ambito significherebbe mostrare a un assistente dati che l'amministratore
 * non gli ha delegato.
 *
 * **L'elenco di permessi si controlla per `admin` e per `portiere`.** Non è solo
 * la delega dell'assistente: è la lista di ciò che quell'utente può leggere, e
 * per il portiere è anche il suo perimetro dentro lo stabile. Senza questo controllo
 * il portiere passava da tutte le rotte di lettura, e i controller filtrano solo
 * il `condomino`: avrebbe letto versamenti, quote mensili con gli importi, bilanci
 * e verbali dello stabile in cui serve. Il condòmino resta fuori perché non
 * amministra e i suoi controller già filtrano.
 */
export const requirePermessoLettura =
  (...permessi: Permesso[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (req.user.role !== 'admin' && req.user.role !== 'portiere') return next();

    const assegnati = req.user.permessi;
    if (assegnati === null) {
      // `null` è il modo con cui viene salvato l'amministratore senza delega, e
      // significa accesso pieno. Per il portiere non è un caso ammesso: la sua
      // lista è sempre compilata, e trattare `null` come pieno gli aprirebbe
      // tutto lo stabile.
      if (req.user.role === 'portiere') {
        return next(forbidden('Account del personale dello stabile non configurato: chiedi all’amministratore'));
      }
      return next();
    }

    if (permessi.some((p) => haPermesso(assegnati, p))) return next();

    return next(
      forbidden('Non sei autorizzato a consultare questi dati: l’amministratore non ti ha delegato questo ambito'),
    );
  };

/**
 * Richiede il permesso a chi amministra, lasciando passare i partecipanti.
 *
 * Serve dove la stessa scrittura è legittima per due soggetti diversi: il
 * condòmino scrive all'amministratore, l'amministratore scrive ai condòmini.
 * Applicare `requirePermesso` vieterebbe al condòmino di scrivere, che è
 * proprio il diritto che l'applicazione gli riconosce, e gli lascerebbe
 * leggere senza poter rispondere.
 *
 * Chi non amministra passa, ma non è libero: `requireCondominioAccess` gli
 * chiede una posizione nel condominio e i controller ne verificano la proprietà
 * (`mittente`, `bozza`). Qui il controllo serve solo sul lato amministrativo.
 */
export const requirePermessoOPartecipante =
  (...permessi: Permesso[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(unauthorized());

    const ruolo = req.user.role;
    if (ruolo === 'superadmin') return next();
    if (ruolo === 'portiere') {
      return next(forbidden('Il personale dello stabile non scrive ai residenti: è l’amministratore a scrivere'));
    }
    if (ruolo !== 'admin') return next();

    const assegnati = req.user.permessi;
    if (assegnati === null) return next();

    if (permessi.some((p) => haPermesso(assegnati, p))) return next();

    return next(
      forbidden('Non sei autorizzato a questa operazione: l’amministratore non ti ha delegato questo ambito'),
    );
  };

/**
 * Chi può leggere la rubrica dei residenti.
 *
 * L'amministratore deve avere il permesso sugli iscritti. Il personale dello
 * stabile passa perché **serve** quello stabile, e non perché ha un permesso:
 * questo è il punto del perimetro. Un permesso non può bastare, perché la rubrica
 * e la lista degli iscritti sono due letture diverse e il secondo elenco contiene
 * anche i millesimi: un permesso condiviso avrebbe dato al portiere la posizione
 * economica di ogni residente insieme al cognome e al telefono.
 *
 * Il condòmino è escluso qui e non nel controller: è il guard il posto in cui si
 * dichiara chi entra, e la regola è la stessa per tutti.
 */
export const requireRubrica: RequestHandler = (req, res, next) => {
  if (!req.user) return next(unauthorized());
  if (req.user.role === 'portiere') return next();
  if (req.user.role !== 'admin') {
    return next(forbidden('La rubrica dello stabile è riservata a chi lo amministra'));
  }
  return requirePermessoLettura('iscritti:leggere')(req, res, next);
};

/**
 * Richiede di essere l'amministratore di almeno uno stabile, non solo un `admin`.
 *
 * `requireRole('admin')` non basta, perché un assistente **è** un `admin`: ha il
 * ruolo `admin` con permessi ristretti e `delegatoDa` valorizzato. Su `/staff/assistenti`
 * questo non è una differenza teorica: `registraDelegazione` collega la persona
 * creata agli stabili di cui il creatore è **amministratore**, quindi un assistente
 * che crea un assistente gli producebbe un account senza nessuno stabile — account
 * che però passa lo stesso `requireRole` della bacheca, dove `filtroVisibile` gli
 * mostrerebbe i compiti che gli sono stati affidati.
 *
 * Il confronto è quindi su un fatto, non sul ruolo: amministrare almeno uno stabile.
 * È la condizione che rende significativa una delega.
 */
export const requireAmministratore: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw unauthorized();
    if (req.user.role === 'superadmin') return next();
    if (req.user.role !== 'admin') {
      return next(forbidden('Operazione riservata agli amministratori di condominio'));
    }
    const amministra = await Condominio.exists({ amministratore: req.user.sub });
    if (!amministra) {
      return next(
        forbidden('Solo un amministratore di condominio può gestire il proprio team: gli assistenti ricevono i compiti, non li distribuiscono'),
      );
    }
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Richiede di non essere un assistente: vale dove l'atto è una **titolarietà**.
 *
 * Su `POST /condomini` il condominio nasce intestato a chi lo crea e consuma la
 * capacità del contratto di quel titolare. Delegare `amministrazione:scrivere` non
 * può voler dire anche «diventa titolare di uno stabile»: l'assistente che lo
 * faceva si trovava amministratore di un condominio creato con la capacità di chi
 * aveva delegato, e da lì il team e tutto il resto che ne segue.
 *
 * Il confronto è su `delegatoDa`, che è ciò che distingue l'amministratore dal suo
 * assistente, non sul ruolo: entrambi sono `admin`. Non basta `requireAmministratore`,
 * che chiede di amministrare almeno uno stabile e sarebbe quindi soddisfatto proprio
 * da quello che ha appena creato.
 */
export const requireNonAssistente: RequestHandler = async (req, res, next) => {
  try {
    if (!req.user) throw unauthorized();
    if (req.user.role === 'superadmin') return next();
    if (req.user.role !== 'admin') {
      return next(forbidden('Operazione riservata agli amministratori'));
    }
    const autore = await User.findById(req.user.sub).select('delegatoDa').lean<{ delegatoDa?: unknown }>();
    if (!autore) throw notFound('Utente non trovato');
    if (autore.delegatoDa) {
      return next(
        forbidden('Gli assistenti non possono creare condomini: la creazione è una titolarità, non una delega'),
      );
    }
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Verifica che l'utente abbia accesso al condominio indicato.
 * Gli amministratori devono essere il titolare o un assistente delegato; i
 * portieri devono servire il condominio; i condomini devono avere una posizione.
 */
export const requireCondominioAccess: RequestHandler = async (req, _res, next) => {
  try {
    if (!req.user) throw unauthorized();

    const id = req.params.condominioId ?? (req.body?.condominio as string | undefined);
    if (!id) throw forbidden('Condominio non specificato');
    if (!mongoose.isValidObjectId(String(id))) throw forbidden('Condominio non valido');

    const condominioId = String(id);
    const { sub, role } = req.user;

    if (role === 'superadmin') {
      // Il superadmin non è titolare di nessun condominio: il filtro per
      // proprietario lo avrebbe escluso da tutti, restituendo "non trovato"
      // anche per stabili che esistono. Qui basta che lo stabile ci sia, e
      // l'assenza è un 404 vero, non un permesso.
      const esiste = await Condominio.exists({ _id: condominioId });
      if (!esiste) throw notFound('Condominio non trovato');
    } else if (role === 'admin') {
      const ok = await Condominio.exists({
        _id: condominioId,
        $or: [{ amministratore: sub }, { assistenti: sub }],
      });
      if (!ok) throw forbidden("Non sei l'amministratore di questo condominio n\u00e9 un suo assistente");
    } else if (role === 'portiere') {
      const serves = await Condominio.exists({ _id: condominioId, condominiServito: sub });
      if (!serves) throw forbidden('Non operi in questo condominio');
    } else {
      const linked = await Condomino.exists({ condominio: condominioId, utente: sub, attivo: true });
      if (!linked) throw forbidden('Non sei un condòmino di questo condominio');
    }

    next();
  } catch (err) {
    next(err);
  }
};

/** Impedisce a un condomino di leggere dati di altri condomini. */
export async function assertCondominoSelf(
  condominoId: string,
  userId: string,
  role: UserRole,
): Promise<void> {
  if (role === 'superadmin' || role === 'admin' || role === 'portiere') return;
  const found = await Condomino.findOne({ _id: condominoId, utente: userId }).select('_id');
  if (!found) throw forbidden('Risorsa non assegnata a te');
}

export function currentUser(req: Request): NonNullable<Request['user']> {
  if (!req.user) throw unauthorized();
  return req.user;
}

/** Verifica se l'utente corrente può eseguire un permesso. */
export function puoEseguire(utente: NonNullable<Request['user']>, permesso: Permesso): boolean {
  if (utente.role === 'superadmin') return true;
  if (utente.role !== 'admin') return false;
  return haPermesso(utente.permessi, permesso);
}

export type { NextFunction, Request, Response };