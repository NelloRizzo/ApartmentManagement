import { Router } from 'express';
import authRoutes from './auth.routes.js';
import condominioRoutes from './condominio.routes.js';
import ambitoCondominioRoutes from './ambitoCondominio.routes.js';
import staffRoutes from './staff.routes.js';
import attivitaRoutes from './attivita.routes.js';
import contrattoRoutes from './contratto.routes.js';
import { apiLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.use(apiLimiter);

router.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } });
});

router.use('/auth', authRoutes);
router.use('/staff', staffRoutes);
router.use('/staff/attivita', attivitaRoutes);
router.use('/contratti', contrattoRoutes);

// `/condomini` gestisce il condominio come risorsa; tutto ciò che è interno
// a un condominio è montato sotto `/condomini/:condominioId`.
router.use('/condomini', condominioRoutes);
router.use('/condomini/:condominioId', ambitoCondominioRoutes);

export default router;
