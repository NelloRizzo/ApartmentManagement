import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireCondominioAccess, requirePermesso, requirePermessoLettura, requireRubrica } from '../middleware/auth.js';
import { controllaServizio } from '../middleware/servizio.js';
import * as c from '../controllers/condomino.controller.js';
import { condominoCreateSchema, condominoListQuery, condominoUpdateSchema, condominioParams, entitaParams } from '../validators/schemas.js';

const router = Router({ mergeParams: true });

router.use(requireAuth, validate(condominioParams, 'params'), requireCondominioAccess);

router.get('/', requirePermessoLettura('iscritti:leggere'), validate(condominoListQuery, 'query'), c.list);
router.post('/', controllaServizio, requirePermesso('iscritti:scrivere'), validate(condominoCreateSchema), c.create);
// La rubrica dei residenti: la vista del personale dello stabile. Va dichiarata
// **prima** di `/:id`, o `rubrica` verrebbe letta come un id.
router.get('/rubrica', requireRubrica, c.rubrica);
router.get('/mie-quote', c.mieQuote);
router.get('/:id', validate(entitaParams, 'params'), c.getOne);
router.patch('/:id', controllaServizio, requirePermesso('iscritti:scrivere'), validate(entitaParams, 'params'), validate(condominoUpdateSchema), c.update);
router.delete('/:id', controllaServizio, requirePermesso('iscritti:scrivere'), validate(entitaParams, 'params'), c.remove);

export default router;
