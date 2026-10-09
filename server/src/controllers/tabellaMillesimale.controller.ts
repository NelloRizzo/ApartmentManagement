import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/http.js';
import { currentUser } from '../middleware/auth.js';
import { RIPARTIZIONI } from '../types/domain.js';
import {
  buildTabella,
  nuovaRevisione,
  storicoRevisioni,
  variazioniRevisioni,
  getRevisioneAttiva,
} from '../services/tabellaMillesimale.service.js';

export const getTabella = asyncHandler(async (req, res) => {
  const revisione = req.query.revisione ? Number(req.query.revisione) : undefined;
  ok(res, await buildTabella(req.params.condominioId!, revisione));
});

export const revisioni = asyncHandler(async (req, res) => {
  ok(res, await storicoRevisioni(req.params.condominioId!));
});

export const variazioni = asyncHandler(async (req, res) => {
  ok(res, await variazioniRevisioni(req.params.condominioId!));
});

export const attiva = asyncHandler(async (req, res) => {
  ok(res, { revisione: await getRevisioneAttiva(req.params.condominioId!) });
});

export const salvaRevisione = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const body = req.body as {
    delibera?: string;
    dataDelibera?: Date;
    righe: { unitaId: string; quote: Record<string, number> }[];
  };

  const tabella = await nuovaRevisione(req.params.condominioId!, body.righe, {
    delibera: body.delibera,
    dataDelibera: body.dataDelibera,
    attoreId: utente.sub,
  });

  ok(res, tabella);
});

/** Verifica la tabella corrente senza salvarla: utile per un anteprima in UI. */
export const verifica = asyncHandler(async (req, res) => {
  const body = req.body as { righe: { unitaId: string; quote: Record<string, number> }[] };

  const totale = Object.fromEntries(RIPARTIZIONI.map((r) => [r, 0])) as Record<string, number>;
  for (const riga of body.righe) {
    for (const [k, v] of Object.entries(riga.quote ?? {})) {
      if (k in totale && typeof v === 'number') totale[k] = (totale[k] ?? 0) + v;
    }
  }

  const scarti = Object.entries(totale)
    .filter(([, v]) => Math.abs(v - 1000) > 0.0001)
    .map(([k, v]) => ({ ripartizione: k, totale: v, scarto: Number((v - 1000).toFixed(4)) }));

  ok(res, { valida: scarti.length === 0, totale, problemi: scarti });
});
