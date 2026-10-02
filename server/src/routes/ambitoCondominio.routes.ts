import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireCondominioAccess } from '../middleware/auth.js';
import { condominioParams } from '../validators/schemas.js';
import unitaRoutes from './unita.routes.js';
import tabellaRoutes from './tabellaMillesimale.routes.js';
import condominoRoutes from './condomino.routes.js';
import assembleaRoutes from './assemblea.routes.js';
import verbaleRoutes from './verbale.routes.js';
import bilancioRoutes from './bilancio.routes.js';
import versamentoRoutes from './versamento.routes.js';
import comunicazioneRoutes from './comunicazione.routes.js';

/**
 * Router di ambito: raccoglie tutte le risorse che vivono dentro un condominio.
 * Ogni dominio è montato su un prefisso proprio, così nessun `/:id` generico
 * può intercettare una risorsa di un altro dominio.
 */
const router = Router({ mergeParams: true });

router.use(validate(condominioParams, 'params'), requireCondominioAccess);

router.use('/unita', unitaRoutes);
router.use('/tabella-millesimi', tabellaRoutes);
router.use('/condomini', condominoRoutes);
router.use('/assemblee', assembleaRoutes);
router.use('/verbali', verbaleRoutes);
router.use('/bilanci', bilancioRoutes);
router.use('/versamenti', versamentoRoutes);
router.use('/comunicazioni', comunicazioneRoutes);

export default router;
