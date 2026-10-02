import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireCondominioAccess, requirePermesso, requirePermessoLettura } from '../middleware/auth.js';
import { controllaServizio } from '../middleware/servizio.js';
import * as b from '../controllers/bilancio.controller.js';
import {
  approvaSchema,
  bilancioCreateSchema,
  bilancioUpdateSchema,
  bilancioVoceParams,
  condominioParams,
  entitaParams,
  voceBilancioCreateSchema,
  voceBilancioUpdateSchema,
} from '../validators/schemas.js';

/** Montato su `/condomini/:condominioId/bilanci`. */
const router = Router({ mergeParams: true });

router.use(requireAuth, validate(condominioParams, 'params'), requireCondominioAccess);

router.get('/', requirePermessoLettura('bilanci:leggere'), b.list);
router.post('/', controllaServizio, requirePermesso('bilanci:scrivere'), validate(bilancioCreateSchema), b.create);
router.get('/:id', requirePermessoLettura('bilanci:leggere'), validate(entitaParams, 'params'), b.getOne);
router.patch(
  '/:id',
  controllaServizio, requirePermesso('bilanci:scrivere'),
  validate(entitaParams, 'params'),
  validate(bilancioUpdateSchema),
  b.update,
);

// Le voci si modificano una alla volta: obbligare a rispedire l'intero elenco
// per correggere un importo significa che ogni correzione può perdere le voci
// aggiunte nel frattempo da qualcun altro.
router.post(
  '/:id/voci',
  controllaServizio, requirePermesso('bilanci:scrivere'),
  validate(entitaParams, 'params'),
  validate(voceBilancioCreateSchema),
  b.aggiungi,
);
router.patch(
  '/:id/voci/:voceId',
  controllaServizio, requirePermesso('bilanci:scrivere'),
  validate(bilancioVoceParams, 'params'),
  validate(voceBilancioUpdateSchema),
  b.modifica,
);
router.delete(
  '/:id/voci/:voceId',
  controllaServizio, requirePermesso('bilanci:scrivere'),
  validate(bilancioVoceParams, 'params'),
  b.elimina,
);

router.post(
  '/:id/consuntivo',
  controllaServizio, requirePermesso('bilanci:scrivere'),
  validate(entitaParams, 'params'),
  b.generaConsuntivo,
);
router.post(
  '/:id/approva',
  controllaServizio, requirePermesso('bilanci:scrivere'),
  validate(entitaParams, 'params'),
  validate(approvaSchema),
  b.approva,
);
router.delete('/:id', controllaServizio, requirePermesso('bilanci:scrivere'), validate(entitaParams, 'params'), b.remove);

export default router;
