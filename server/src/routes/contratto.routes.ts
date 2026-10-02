import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as c from '../controllers/contratto.controller.js';
import {
  cessazioneSchema,
  creaContrattoSchema,
  listaContrattiQuery,
  messaggioPiattaformaSchema,
  pagamentoRataSchema,
  prorogaSchema,
  sempliceId,
  statoContrattoSchema,
  contrattoParam,
  rataParam,
} from '../validators/schemas.js';

/**
 * Contratti di fornitura, rate e messaggi fra piattaforma e amministratori.
 * Montata su `/contratti`.
 *
 * Le rotte di lettura sono aperte a chi è direttamente coinvolto (il
 * superadmin vede tutto, l'amministratore solo il proprio contratto); le
 * scritture sono riservate al superadmin.
 */
const router = Router();

router.use(requireAuth);

router.get('/piattaforma', requireRole('superadmin'), c.piattaforma);
router.get('/carico', requireRole('superadmin'), c.caricoPerContratto);
router.get('/mio-stato', c.mioStato);

// I messaggi hanno una rotta propria: vanno dichiarati prima di `/:id`, altrimenti
// "messaggi" verrebbe letto come identificatore di un contratto.
router.get('/messaggi', c.listMessaggi);
router.post('/messaggi', requireRole('superadmin'), validate(messaggioPiattaformaSchema), c.inviaMessaggio);
router.post(
  '/messaggi/:id/letti',
  requireRole('admin', 'superadmin'),
  validate(sempliceId, 'params'),
  c.segnaLetto,
);

router.get('/', validate(listaContrattiQuery, 'query'), c.list);
router.get(
  '/:id',
  requireRole('superadmin', 'admin'),
  validate(contrattoParam, 'params'),
  c.getOne,
);
router.post('/', requireRole('superadmin'), validate(creaContrattoSchema), c.create);
router.post(
  '/:id/proroga',
  requireRole('superadmin'),
  validate(contrattoParam, 'params'),
  validate(prorogaSchema),
  c.prorogaContratto,
);
router.post(
  '/:id/stato',
  requireRole('superadmin'),
  validate(contrattoParam, 'params'),
  validate(statoContrattoSchema),
  c.cambiaStato,
);
router.post(
  '/:id/cessazione',
  requireRole('superadmin'),
  validate(contrattoParam, 'params'),
  validate(cessazioneSchema),
  c.cessaContratto,
);

// ---------- Rate ----------
router.get('/:id/rate', requireRole('superadmin', 'admin'), validate(contrattoParam, 'params'), c.listRate);
router.post(
  '/:id/rate/:rataId/pagamento',
  requireRole('superadmin'),
  validate(rataParam, 'params'),
  validate(pagamentoRataSchema),
  c.registraPagamento,
);
router.delete(
  '/:id/rate/:rataId',
  requireRole('superadmin'),
  validate(rataParam, 'params'),
  c.annullaRata,
);

export default router;