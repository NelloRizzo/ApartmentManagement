import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireCondominioAccess, requirePermesso, requirePermessoLettura } from '../middleware/auth.js';
import { controllaServizio } from '../middleware/servizio.js';
import * as t from '../controllers/tabellaMillesimale.controller.js';
import { condominioParams, tabellaQuery, tabellaSchema } from '../validators/schemas.js';

/** Montato su `/condomini/:condominioId/tabella-millesimi`. */
const router = Router({ mergeParams: true });

router.use(requireAuth, validate(condominioParams, 'params'), requireCondominioAccess);

router.get('/', requirePermessoLettura('tabella:leggere'), validate(tabellaQuery, 'query'), t.getTabella);
router.get('/revisioni/variazioni', requirePermessoLettura('tabella:leggere'), t.variazioni);
router.get('/revisioni', requirePermessoLettura('tabella:leggere'), t.revisioni);
router.get('/attiva', requirePermessoLettura('tabella:leggere'), t.attiva);
router.post('/verifica', validate(tabellaSchema), t.verifica);
router.post('/', controllaServizio, requirePermesso('tabella:scrivere'), validate(tabellaSchema), t.salvaRevisione);

export default router;
