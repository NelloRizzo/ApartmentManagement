import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireCondominioAccess, requireRole } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import * as auth from '../controllers/auth.controller.js';
import {
  cambiaEmailSchema,
  changePasswordSchema,
  confermaEmailSchema,
  loginSchema,
  updateProfileSchema,
} from '../validators/schemas.js';

const router = Router();

router.post('/login', authLimiter, validate(loginSchema), auth.login);
router.post('/refresh', auth.refresh);
router.post('/logout', auth.logout);

/*
 * Conferma dell'indirizzo email. Pubblica e limitata: chi riceve l'email non è
 * ancora collegato, e l'antispam dei provider apre i link in anteprima, quindi
 * il token non può viaggiare in una GET.
 */
router.post('/conferma-email', authLimiter, validate(confermaEmailSchema), auth.confermaEmail);

router.use(requireAuth);

router.get('/me', auth.me);
router.patch('/me', validate(updateProfileSchema), auth.updateProfile);
router.post('/cambia-password', authLimiter, validate(changePasswordSchema), auth.changePassword);
/*
 * Cambio di indirizzo: ogni tentativo manda due email, quindi finisce sotto
 * `authLimiter` come le altre rotte che scrivono sulla casella. `annulla-cambio`
 * non ne manda e non ha bisogno del limite.
 */
router.post('/cambia-email', authLimiter, validate(cambiaEmailSchema), auth.cambiaEmail);
router.post('/annulla-cambio-email', auth.annullaCambioEmail);
router.post('/reinvia-conferma', authLimiter, auth.reinviaConfermaEmail);

export { requireCondominioAccess, requireRole };
export default router;
