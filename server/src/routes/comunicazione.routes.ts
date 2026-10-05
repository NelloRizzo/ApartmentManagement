import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireCondominioAccess, requirePermesso, requirePermessoLettura, requirePermessoOPartecipante } from '../middleware/auth.js';
import { controllaServizio } from '../middleware/servizio.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { badRequest } from '../utils/errors.js';
import { upload, toAllegati, leggiMetaAllegati } from '../middleware/upload.js';
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
  // L'ordine conta: `upload` mette i file in `req.files`, `leggiMetaAllegati`
  // mette in salvo i metadati prima che `validate` sostituisca il corpo, e solo
  // allora Zod può validare il resto. Con richiesta JSON semplice multer lascia
  // passare il body invariato, quindi lo schema lo vede correttamente.
  upload.array('allegati', 5),
  leggiMetaAllegati,
  controllaServizio,
  requirePermessoOPartecipante('comunicazioni:scrivere'),
  validate(comunicazioneCreateSchema),
  c.create,
);
router.get('/:id', validate(entitaParams, 'params'), c.getOne);
router.patch(
  '/:id',
  upload.array('allegati', 5),
  leggiMetaAllegati,
  controllaServizio,
  requirePermessoOPartecipante('comunicazioni:scrivere'),
  validate(comunicazioneCreateSchema.partial()),
  c.update,
);
router.post('/:id/invia', controllaServizio, requirePermessoOPartecipante('comunicazioni:scrivere'), validate(entitaParams, 'params'), c.invia);
router.post('/:id/letti', validate(entitaParams, 'params'), c.segnaLetta);
router.post(
  '/:id/risposte',
  // Una risposta può avere allegati: senza `upload` i file non arriverebbero mai
  // al controller, che li trasformerebbe in documenti.
  upload.array('allegati', 5),
  leggiMetaAllegati,
  controllaServizio,
  requirePermessoOPartecipante('comunicazioni:scrivere'),
  validate(entitaParams, 'params'),
  validate(rispostaSchema),
  c.rispondi,
);
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
