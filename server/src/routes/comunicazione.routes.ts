import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireCondominioAccess, requirePermesso, requirePermessoLettura, requirePermessoOPartecipante } from '../middleware/auth.js';
import { controllaServizio } from '../middleware/servizio.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest } from '../utils/errors.js';
import { upload, toAllegati } from '../middleware/upload.js';
import * as c from '../controllers/comunicazione.controller.js';
import {
  comunicazioneCreateSchema,
  comunicazioneListQuery,
  condominioParams,
  entitaParams,
  rispostaSchema,
} from '../validators/schemas.js';

/** Montato su `/condomini/:condominioId/comunicazioni`. */
const router = Router({ mergeParams: true });

router.use(requireAuth, validate(condominioParams, 'params'), requireCondominioAccess);

router.get('/', requirePermessoLettura('comunicazioni:leggere'), validate(comunicazioneListQuery, 'query'), c.list);
router.get('/non-lette', c.nonLette);

// Ogni scrittura chiede `comunicazioni:scrivere` a chi amministra, e lascia
// passare i partecipanti: il condòmino che scrive all'amministratore e
// l'amministratore che scrive ai condòmini usano la stessa rotta.
// `/:id/letti` è l'azione del destinatario e resta senza permesso.
router.post(
  '/',
  // `upload` va prima di `validate`: con richiesta JSON semplice multer lascia
  // passare il body invariato, quindi lo schema Zod lo valida correttamente.
  upload.array('allegati', 5),
  controllaServizio,
  requirePermessoOPartecipante('comunicazioni:scrivere'),
  validate(comunicazioneCreateSchema),
  c.create,
);
router.get('/:id', validate(entitaParams, 'params'), c.getOne);
router.patch(
  '/:id',
  upload.array('allegati', 5),
  controllaServizio,
  requirePermessoOPartecipante('comunicazioni:scrivere'),
  validate(comunicazioneCreateSchema.partial()),
  c.update,
);
router.post('/:id/invia', controllaServizio, requirePermessoOPartecipante('comunicazioni:scrivere'), validate(entitaParams, 'params'), c.invia);
router.post('/:id/letti', validate(entitaParams, 'params'), c.segnaLetta);
router.post('/:id/risposte', controllaServizio, requirePermessoOPartecipante('comunicazioni:scrivere'), validate(entitaParams, 'params'), validate(rispostaSchema), c.rispondi);
router.delete('/:id', controllaServizio, requirePermessoOPartecipante('comunicazioni:scrivere'), c.remove);

/** Carica un allegato e restituisce il descrittore da usare nelle comunicazioni. */
router.post(
  '/upload',
  controllaServizio,
  requirePermesso('comunicazioni:scrivere'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const [allegato] = await toAllegati(req);
    if (!allegato) throw badRequest('Nessun file ricevuto');
    res.status(201).json({ success: true, data: allegato });
  }),
);

export default router;
