import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireCondominioAccess, requireNonAssistente, requirePermesso } from '../middleware/auth.js';
import { controllaServizio, verificaCapacitaPerCondominio } from '../middleware/servizio.js';
import * as c from '../controllers/condominio.controller.js';
import {
  condominioCreateSchema,
  condominioParams,
  condominioUpdateSchema,
} from '../validators/schemas.js';

const router = Router();

router.use(requireAuth);

router.get('/', c.list);
// Creare un condominio è diventarlo amministratore: `requireNonAssistente`, non
// `requirePermesso` da solo, perché delegare `amministrazione:scrivere` non può
// voler dire diventare titolare di uno stabile con la capacità di chi ha delegato.
router.post(
  '/',
  controllaServizio,
  requireNonAssistente,
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

// Il personale di uno stabile non ha rotte qui: nasce e viene revocato dalla pagina
// del team (`POST /staff/assistenti` con `ruolo: 'portiere'` e
// `DELETE /staff/assistenti/:id`). Tenere anche `/servizi` sarebbe un secondo modo
// di dire la stessa cosa, e i due potrebbero divergere.

export default router;
