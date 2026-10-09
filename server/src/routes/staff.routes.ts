import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAmministratore, requireAuth, requireRole } from '../middleware/auth.js';
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
/** Genera una nuova password e la consegna con l'email di conferma. */
router.post(
  '/amministratori/:id/reimposta-password',
  requireRole('superadmin'),
  validate(sempliceId, 'params'),
  c.reimpostaPasswordAmministratore,
);

/**
 * Deleghe: assistenti con permessi ristretti sui propri condomini, e il personale
 * che serve uno stabile.
 *
 * Le rotte sono su `requireAmministratore` e non su `requireRole('admin')`: un
 * assistente è un `admin`, e su `/staff/assistenti` la differenza è concreta perché
 * `registraDelegazione` collega la persona creata agli stabili di cui il creatore è
 * amministratore.
 */
router.get(
  '/assistenti',
  requireAmministratore,
  validate(listaStaffQuery, 'query'),
  c.listAssistenti,
);
router.post(
  '/assistenti',
  requireAmministratore,
  validate(creaAssistenteSchema),
  c.creaAssistente,
);
router.patch(
  '/assistenti/:id',
  requireAmministratore,
  validate(sempliceId, 'params'),
  validate(aggiornaAssistenteSchema),
  c.aggiornaAssistente,
);
router.delete(
  '/assistenti/:id',
  requireAmministratore,
  validate(sempliceId, 'params'),
  c.revocaAssistente,
);
router.post(
  '/assistenti/:id/reinvia-conferma',
  requireAmministratore,
  validate(sempliceId, 'params'),
  c.reinviaConfermaAssistente,
);

export default router;
