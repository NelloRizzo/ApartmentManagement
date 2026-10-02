import type { RequestHandler } from 'express';
import { Types } from 'mongoose';
import { Condominio } from '../models/index.js';
import { currentUser } from './auth.js';
import { statoServizio, verificaCapacita, type StatoServizio } from '../services/contratto.service.js';
import { badRequest, forbidden } from '../utils/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /**
       * Stato del servizio calcolato da `controllaServizio`, riusato da
       * `verificaCapacitaPerUnita` per non ripetere le query.
       */
      servizio?: StatoServizio;
    }
  }
}

/**
 * Blocca ogni scrittura se il contratto è sospeso o cessato.
 *
 * Da montare sulle rotte che modificano dati e solo per gli amministratori:
 * il superadmin non è soggetto al proprio contratto, i condomini non ne hanno
 * uno. Lo stato viene calcolato una volta per richiesta.
 */
export const controllaServizio: RequestHandler = async (req, _res, next) => {
  try {
    const utente = currentUser(req);
    if (utente.role !== 'admin') return next();

    const servizio = await statoServizio(utente.sub);
    req.servizio = servizio;

    if (servizio.contratto?.stato === 'sospeso') {
      throw forbidden(
        `Il contratto è sospeso dal ${new Date(servizio.contratto.sospesoIl ?? Date.now()).toLocaleDateString('it-IT')}: le operazioni sono bloccate fino alla riattivazione`,
      );
    }
    if (servizio.contratto?.stato === 'cessato') {
      throw forbidden('Il contratto è cessato: le operazioni non sono più disponibili');
    }

    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Verifica la capacità contrattuale prima di aggiungere unità immobiliari.
 *
 * Da usare solo sulle rotte che creano unità o condomini: un contratto scaduto
 * continua a permettere la gestione di ciò che esiste già, ma non l'espansione.
 */
export const verificaCapacitaPerUnita = (quante: number): RequestHandler =>
  async (req, _res, next) => {
    try {
      const utente = currentUser(req);
      if (utente.role !== 'admin') return next();

      if (req.servizio) {
        const s = req.servizio;
        if (s.contratto?.stato === 'sospeso') return next();
        if (!s.contratto) {
          return next(
            badRequest('Non risulta alcun contratto attivo per questo amministratore'),
          );
        }
        if (s.scaduto) {
          return next(
            badRequest(
              `Il contratto è scaduto: non è possibile aggiungere unità immobiliari finché non viene rinnovato`,
            ),
          );
        }
        if (s.unitaInUso + quante > s.unitaMassime) {
          return next(
            badRequest(
              `Capacità contrattuale superata: il contratto prevede ${s.unitaMassime} unità e ne sono in carico ${s.unitaInUso}`,
            ),
          );
        }
        return next();
      }

      await verificaCapacita(utente.sub, quante);
      next();
    } catch (err) {
      next(err);
    }
  };

/** Numero di unità che il condominio aggiungerebbe, per il controllo capacità. */
export async function contaUnitaNuove(condominioId: string): Promise<number> {
  return Condominio.findById(condominioId)
    .then((c) => c ? 1 : 0)
    .catch(() => 0);
}

export const oid = (v: string): Types.ObjectId => new Types.ObjectId(String(v));