import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getObjectId } from '../utils/pagination.js';
import { allegatoDaUrl } from '../services/allegato.service.js';

/**
 * Download degli allegati.
 *
 * Montata fuori da `/api`, senza `requireAuth`: l'accesso è garantito dalla
 * firma presente nell'URL, non da un token. Serve perché un `<img src>` o un
 * `<a download>` non possono portare l'intestazione `Authorization`, e aprire
 * una sessione con cookie accessibile a ogni pagina annullerebbe la scelta di
 * tenere il token di accesso solo in memoria.
 */
const router = Router();

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = String(getObjectId(req.params.id ?? '', 'id'));
    const allegato = await allegatoDaUrl(id, String(req.query.t ?? ''), String(req.query.s ?? ''));

    res.setHeader('Content-Type', allegato.tipo);
    res.setHeader('Content-Length', String(allegato.size));
    // `attachment` forza il download e impedisce che il browser interpreti
    // l'allegato come documento: un HTML caricato come immagine potrebbe
    // eseguire script nel contesto dell'origine dell'API.
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(allegato.nome)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');

    res.end(allegato.dati);
  }),
);

export default router;