import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireCondominioAccess, requirePermesso, requirePermessoLettura } from '../middleware/auth.js';
import { controllaServizio } from '../middleware/servizio.js';
import { upload, leggiMetaAllegati } from '../middleware/upload.js';
import * as v from '../controllers/versamento.controller.js';
import {
  annoQuery,
  condominioParams,
  entitaParams,
  periodoQuery,
  versamentoCreateSchema,
  versamentoListQuery,
  versamentoUpdateSchema,
} from '../validators/schemas.js';

/** Montato su `/condomini/:condominioId/versamenti`. */
const router = Router({ mergeParams: true });

router.use(requireAuth, validate(condominioParams, 'params'), requireCondominioAccess);

router.get('/', requirePermessoLettura('versamenti:leggere'), validate(versamentoListQuery, 'query'), v.list);
router.get('/quote', requirePermessoLettura('versamenti:leggere'), validate(periodoQuery, 'query'), v.quote);
router.get('/riepilogo', requirePermessoLettura('bilanci:leggere'), validate(annoQuery, 'query'), v.riepilogoAnnuo);
router.post('/', controllaServizio, requirePermesso('versamenti:scrivere'), validate(versamentoCreateSchema), v.create);
router.patch(
  '/:id',
  controllaServizio, requirePermesso('versamenti:scrivere'),
  validate(entitaParams, 'params'),
  validate(versamentoUpdateSchema),
  v.update,
);
router.delete('/:id', controllaServizio, requirePermesso('versamenti:scrivere'), validate(entitaParams, 'params'), v.remove);

// La quietanza è l'unico allegato del versamento: qui non c'è un id dell'allegato
// nella rotta di rimozione, perché il campo è singolo e basta il versamento.
router.post(
  '/:id/allegato',
  upload.array('allegati', 1),
  leggiMetaAllegati,
  controllaServizio, requirePermesso('versamenti:scrivere'),
  validate(entitaParams, 'params'),
  v.allegaQuietanza,
);
router.delete(
  '/:id/allegato',
  controllaServizio, requirePermesso('versamenti:scrivere'),
  validate(entitaParams, 'params'),
  v.togliQuietanza,
);

export default router;
