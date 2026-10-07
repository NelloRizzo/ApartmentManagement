import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireCondominioAccess, requirePermesso, requirePermessoLettura } from '../middleware/auth.js';
import { controllaServizio } from '../middleware/servizio.js';
import { upload, leggiMetaAllegati } from '../middleware/upload.js';
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
  puntoOrdineAllegatoParams,
  puntoOrdineParams,
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
/*
 * Badge della sezione Assemblee e segnatura di lettura.
 *
 * `da-vedere` sta **prima** di `/:id` per lo stesso motivo per cui `modelli` sta
 * prima: dichiarata dopo, la parola verrebbe letta come un id e risponderebbe
 * 400 su una rotta che non ha niente a che fare con le assemblee.
 *
 * Non c'è `requirePermesso`: il badge e la segnatura riguardano anche il
 * condòmino, per cui il confine è dentro il controller, come per `list`.
 */
router.get('/da-vedere', c.contaDaVedere);
router.get('/:id', requirePermessoLettura('assemblee:leggere'), validate(assembleaParams, 'params'), c.getOne);
router.post('/:id/odg-visto', validate(assembleaParams, 'params'), c.segnaVisto);
router.patch(
  '/:id',
  controllaServizio, requirePermesso('assemblee:scrivere'),
  validate(assembleaParams, 'params'),
  validate(assembleaUpdateSchema),
  c.update,
);
router.delete('/:id', controllaServizio, requirePermesso('assemblee:scrivere'), validate(assembleaParams, 'params'), c.deleteOne);

// Allegati del singolo punto all'ordine del giorno. I punti non hanno un `_id`
// proprio, quindi si indicano col numero d'ordine.
router.post(
  '/:id/ordine/:ordine/allegati',
  upload.array('allegati', 5),
  leggiMetaAllegati,
  controllaServizio, requirePermesso('assemblee:scrivere'),
  validate(puntoOrdineParams, 'params'),
  c.allegaPunto,
);
router.delete(
  '/:id/ordine/:ordine/allegati/:allegatoId',
  controllaServizio, requirePermesso('assemblee:scrivere'),
  validate(puntoOrdineAllegatoParams, 'params'),
  c.staccaPunto,
);

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
