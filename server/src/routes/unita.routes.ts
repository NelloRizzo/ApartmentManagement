import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireCondominioAccess, requirePermesso } from '../middleware/auth.js';
import { controllaServizio, verificaCapacitaPerUnita } from '../middleware/servizio.js';
import * as c from '../controllers/unita.controller.js';
import { condominioParams, unitaCreateSchema, unitaListQuery, unitaParams, unitaUpdateSchema } from '../validators/schemas.js';

/** Montato su `/condomini/:condominioId/unita`. */
const router = Router({ mergeParams: true });

router.use(requireAuth, validate(condominioParams, 'params'), requireCondominioAccess);

// Ogni scrittura passa dal controllo del contratto: se è sospeso, l'amministratore
// non può più operare; aggiungere unità verifica anche la capacità contrattuale.
router.post(
  '/',
  controllaServizio,
  requirePermesso('unita:scrivere'),
  verificaCapacitaPerUnita(1),
  validate(unitaCreateSchema),
  c.create,
);
router.patch('/:id', controllaServizio, requirePermesso('unita:scrivere'), validate(unitaParams, 'params'), validate(unitaUpdateSchema), c.update);
router.delete('/:id', controllaServizio, requirePermesso('unita:scrivere'), validate(unitaParams, 'params'), c.remove);

// Solo chi amministra: il condòmino conosce la propria unità da /auth/me e non
// deve poter sfogliare lo stabile.
router.get('/', requirePermesso('unita:leggere'), validate(unitaListQuery, 'query'), c.list);
router.get('/:id', requirePermesso('unita:leggere'), validate(unitaParams, 'params'), c.getOne);

export default router;
