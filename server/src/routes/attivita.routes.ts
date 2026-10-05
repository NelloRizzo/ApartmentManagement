import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import * as c from '../controllers/attivita.controller.js';
import {
  aggiornaAttivitaSchema,
  creaAttivitaSchema,
  fattoAttivitaSchema,
  listaAttivitaQuery,
  sempliceId,
} from '../validators/schemas.js';

/**
 * Attività della bacheca del team.
 *
 * Montata su `/staff/attivita`, fuori dal perimetro di un condominio: l'attività
 * è un compito che l'amministratore affida ai propri assistenti, quindi non
 * appartiene a uno stabile. È l'unico router che non sta sotto
 * `/condomini/:condominioId`, e per lo stesso motivo non usa i guard di permesso:
 * non esiste un ambito delegabile, l'accesso dipende da chi possiede e da chi ha
 * ricevuto l'attività, ed è il service a stabilirlo.
 *
 * `requireRole('admin')` è insufficiente da solo, perché anche un assistente è
 * un `admin`: chi crea è l'amministratore delegante, e la verifica sta in
 * `assicuraCreatore`.
 */
const router = Router();

router.use(requireAuth);
router.use(requireRole('admin'));

/** Il team, per il form di assegnazione. Va prima di `/:id`. */
router.get('/team', c.listTeam);

router.get('/', validate(listaAttivitaQuery, 'query'), c.list);
router.post('/', validate(creaAttivitaSchema), c.crea);

router.get('/:id', validate(sempliceId, 'params'), c.getOne);
router.get('/:id/thread', validate(sempliceId, 'params'), c.thread);
router.patch('/:id', validate(sempliceId, 'params'), validate(aggiornaAttivitaSchema), c.aggiorna);
router.post('/:id/fatto', validate(sempliceId, 'params'), validate(fattoAttivitaSchema), c.segnaFatto);
router.delete('/:id', validate(sempliceId, 'params'), c.elimina);

export default router;