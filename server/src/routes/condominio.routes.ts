import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireCondominioAccess, requirePermesso } from '../middleware/auth.js';
import { controllaServizio, verificaCapacitaPerCondominio } from '../middleware/servizio.js';
import * as c from '../controllers/condominio.controller.js';
import {
  condominioCreateSchema,
  condominioParams,
  condominioUpdateSchema,
  servizioCreateSchema,
  servizioParams,
} from '../validators/schemas.js';

const router = Router();

router.use(requireAuth);

router.get('/', c.list);
// La capacità contrattuale è contata in condomìni: è qui che si consuma.
router.post(
  '/',
  controllaServizio,
  requirePermesso('amministrazione:scrivere'),
  verificaCapacitaPerCondominio(1),
  validate(condominioCreateSchema),
  c.create,
);

router.get('/:condominioId', validate(condominioParams, 'params'), requireCondominioAccess, c.getOne);
router.get(
  '/:condominioId/riepilogo',
  validate(condominioParams, 'params'),
  requireCondominioAccess,
  c.summary,
);
router.patch(
  '/:condominioId',
  controllaServizio, requirePermesso('amministrazione:scrivere'),
  validate(condominioParams, 'params'),
  validate(condominioUpdateSchema),
  c.update,
);
router.delete('/:condominioId', controllaServizio, requirePermesso('amministrazione:scrivere'), validate(condominioParams, 'params'), c.remove);

// Il personale dello stabile. `GET` elenca chi serve, `POST` assegna (creando
// l'account), `DELETE` revoca. Le rotte sono sull'amministratore del condominio:
// assegnare personale è l'atto con cui si decide chi vede i dati dei residenti.
router.get(
  '/:condominioId/servizi',
  controllaServizio, requirePermesso('amministrazione:leggere'),
  validate(condominioParams, 'params'),
  c.listServizi,
);
router.post(
  '/:condominioId/servizi',
  controllaServizio, requirePermesso('amministrazione:scrivere'),
  validate(condominioParams, 'params'),
  requireCondominioAccess,
  validate(servizioCreateSchema),
  c.addServizio,
);
router.delete(
  '/:condominioId/servizi/:utenteId',
  controllaServizio, requirePermesso('amministrazione:scrivere'),
  validate(servizioParams, 'params'),
  c.removeServizio,
);

export default router;
