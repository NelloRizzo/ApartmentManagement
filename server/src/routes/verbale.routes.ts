import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireCondominioAccess, requirePermesso, requirePermessoLettura } from '../middleware/auth.js';
import { controllaServizio } from '../middleware/servizio.js';
import { upload, leggiMetaAllegati } from '../middleware/upload.js';
import * as v from '../controllers/verbale.controller.js';
import {
  allegatoParams,
  approvaSchema,
  condominioParams,
  entitaParams,
  verbaleListQuery,
  verbaleTestoSchema,
} from '../validators/schemas.js';

/** Montato su `/condomini/:condominioId/verbali`. */
const router = Router({ mergeParams: true });

router.use(requireAuth, validate(condominioParams, 'params'), requireCondominioAccess);

router.get('/', requirePermessoLettura('verbali:leggere'), validate(verbaleListQuery, 'query'), v.list);
router.get('/:id', validate(entitaParams, 'params'), v.getOne);
router.patch(
  '/:id/testo',
  controllaServizio, requirePermesso('verbali:scrivere'),
  validate(entitaParams, 'params'),
  validate(verbaleTestoSchema),
  v.updateTesto,
);
router.post(
  '/:id/approva',
  controllaServizio, requirePermesso('verbali:scrivere'),
  validate(entitaParams, 'params'),
  validate(approvaSchema),
  v.approva,
);
router.delete('/:id', controllaServizio, requirePermesso('verbali:scrivere'), validate(entitaParams, 'params'), v.remove);

// Allegati del verbale: il verbale è un solo documento, quindi qui c'è un solo
// elenco e non una voce per deliberazione come nei bilanci.
router.post(
  '/:id/allegati',
  upload.array('allegati', 5),
  leggiMetaAllegati,
  controllaServizio, requirePermesso('verbali:scrivere'),
  validate(entitaParams, 'params'),
  v.allega,
);
router.delete(
  '/:id/allegati/:allegatoId',
  controllaServizio, requirePermesso('verbali:scrivere'),
  validate(allegatoParams, 'params'),
  v.stacca,
);

export default router;
