import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as c from '../controllers/amministrazione.controller.js';
import {
  aggiornaAmministratoreSchema,
  aggiornaAssistenteSchema,
  creaAmministratoreSchema,
  creaAssistenteSchema,
  listaStaffQuery,
  sempliceId,
} from '../validators/schemas.js';

/**
 * Gestione di utenti e deleghe. Montata su `/staff`, fuori dal perimetro di un
 * condominio: riguarda gli operatori, non i dati di una singola amministrazione.
 */
const router = Router();

router.use(requireAuth);

router.get('/ambiti', c.catalogoAmbiti);

/** Amministratori di sistema: possono creare altri amministratori. */
router.get('/amministratori', requireRole('superadmin'), validate(listaStaffQuery, 'query'), c.listAmministratori);
router.post(
  '/amministratori',
  requireRole('superadmin'),
  validate(creaAmministratoreSchema),
  c.creaAmministratore,
);
router.patch(
  '/amministratori/:id',
  requireRole('superadmin'),
  validate(sempliceId, 'params'),
  validate(aggiornaAmministratoreSchema),
  c.aggiornaAmministratore,
);
router.delete(
  '/amministratori/:id',
  requireRole('superadmin'),
  validate(sempliceId, 'params'),
  c.rimuoviAmministratore,
);
router.post(
  '/amministratori/:id/reinvia-conferma',
  requireRole('superadmin'),
  validate(sempliceId, 'params'),
  c.reinviaConfermaAmministratore,
);

/** Deleghe: assistenti con permessi ristretti sui propri condomini. */
router.get(
  '/assistenti',
  requireRole('admin', 'superadmin'),
  validate(listaStaffQuery, 'query'),
  c.listAssistenti,
);
router.post(
  '/assistenti',
  requireRole('admin'),
  validate(creaAssistenteSchema),
  c.creaAssistente,
);
router.patch(
  '/assistenti/:id',
  requireRole('admin'),
  validate(sempliceId, 'params'),
  validate(aggiornaAssistenteSchema),
  c.aggiornaAssistente,
);
router.delete(
  '/assistenti/:id',
  requireRole('admin'),
  validate(sempliceId, 'params'),
  c.revocaAssistente,
);
router.post(
  '/assistenti/:id/reinvia-conferma',
  requireRole('admin'),
  validate(sempliceId, 'params'),
  c.reinviaConfermaAssistente,
);

export default router;