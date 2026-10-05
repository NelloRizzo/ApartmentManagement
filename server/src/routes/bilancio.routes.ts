import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireCondominioAccess, requirePermesso, requirePermessoLettura } from '../middleware/auth.js';
import { controllaServizio } from '../middleware/servizio.js';
import { upload, leggiMetaAllegati } from '../middleware/upload.js';
import * as b from '../controllers/bilancio.controller.js';
import {
  approvaSchema,
  bilancioCreateSchema,
  bilancioUpdateSchema,
  bilancioVoceAllegatoParams,
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

// Allegati della singola voce: la quietanza o la fattura di quella spesa.
// `leggiMetaAllegati` sta prima di `validate` per lo stesso motivo delle
// comunicazioni: i metadati degli allegati non fanno parte dello schema del
// bilancio e verrebbero scartati.
router.post(
  '/:id/voci/:voceId/allegati',
  upload.array('allegati', 5),
  leggiMetaAllegati,
  controllaServizio, requirePermesso('bilanci:scrivere'),
  validate(bilancioVoceParams, 'params'),
  b.allegaVoce,
);
router.delete(
  '/:id/voci/:voceId/allegati/:allegatoId',
  controllaServizio, requirePermesso('bilanci:scrivere'),
  validate(bilancioVoceAllegatoParams, 'params'),
  b.staccaVoce,
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
