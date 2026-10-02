import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireCondominioAccess, requirePermesso, requirePermessoLettura } from '../middleware/auth.js';
import { controllaServizio } from '../middleware/servizio.js';
import * as c from '../controllers/assemblea.controller.js';
import * as v from '../controllers/verbale.controller.js';
import {
  assembleaCreateSchema,
  assembleaListQuery,
  assembleaParams,
  assembleaUpdateSchema,
  assembleaVerbaleParams,
  condominioParams,
  deliberaParams,
  deliberaSchema,
  modelliOrdineQuery,
  presenzeSchema,
  statoAssembleaSchema,
  votazioniSchema,
} from '../validators/schemas.js';

/** Montato su `/condomini/:condominioId/assemblee`. */
const router = Router({ mergeParams: true });

router.use(requireAuth, validate(condominioParams, 'params'), requireCondominioAccess);

router.get('/', requirePermessoLettura('assemblee:leggere'), validate(assembleaListQuery, 'query'), c.list);
// Prima di `/:id`: dichiarata dopo, la parola "modelli" verrebbe letta come id.
router.get('/modelli', requirePermessoLettura('assemblee:leggere'), validate(modelliOrdineQuery, 'query'), c.modelli);
router.post('/', controllaServizio, requirePermesso('assemblee:scrivere'), validate(assembleaCreateSchema), c.create);
router.get('/:id', requirePermessoLettura('assemblee:leggere'), validate(assembleaParams, 'params'), c.getOne);
router.patch(
  '/:id',
  controllaServizio, requirePermesso('assemblee:scrivere'),
  validate(assembleaParams, 'params'),
  validate(assembleaUpdateSchema),
  c.update,
);
router.delete('/:id', controllaServizio, requirePermesso('assemblee:scrivere'), validate(assembleaParams, 'params'), c.deleteOne);

router.post(
  '/:id/stato',
  controllaServizio, requirePermesso('assemblee:scrivere'),
  validate(assembleaParams, 'params'),
  validate(statoAssembleaSchema),
  c.changeState,
);
router.put(
  '/:id/presenze',
  controllaServizio, requirePermesso('assemblee:scrivere'),
  validate(assembleaParams, 'params'),
  validate(presenzeSchema),
  c.salvaPresenze,
);
router.put(
  '/:id/votazioni',
  controllaServizio, requirePermesso('assemblee:scrivere'),
  validate(assembleaParams, 'params'),
  validate(votazioniSchema),
  c.salvaVotazioni,
);
router.put(
  '/:id/delibere/:ordine',
  controllaServizio, requirePermesso('assemblee:scrivere'),
  validate(deliberaParams, 'params'),
  validate(deliberaSchema),
  c.salvaDelibera,
);
router.post(
  '/:id/millesimi/ricalcola',
  controllaServizio, requirePermesso('assemblee:scrivere'),
  validate(assembleaParams, 'params'),
  c.ricalcolaMillesimi,
);
router.get(
  '/:id/dettaglio-verbale',
  controllaServizio, requirePermesso('assemblee:scrivere'),
  validate(assembleaParams, 'params'),
  c.dettaglioVerbale,
);
router.get(
  '/:id/convocazione/anteprima',
  controllaServizio, requirePermesso('assemblee:scrivere'),
  validate(assembleaParams, 'params'),
  c.anteprimaConvocazione,
);

router.get('/:assembleaId/verbale/anteprima', validate(assembleaVerbaleParams, 'params'), v.anteprima);
router.post(
  '/:assembleaId/verbale',
  controllaServizio, requirePermesso('assemblee:scrivere'),
  validate(assembleaVerbaleParams, 'params'),
  v.genera,
);
router.post(
  '/:assembleaId/verbale/rigenera',
  controllaServizio, requirePermesso('assemblee:scrivere'),
  validate(assembleaVerbaleParams, 'params'),
  v.rigenera,
);

export default router;
