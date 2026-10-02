import type { Request } from 'express';
import multer from 'multer';
import { badRequest } from '../utils/errors.js';
import { currentUser } from './auth.js';
import { salvaAllegato, type NuovoAllegato } from '../services/allegato.service.js';

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/**
 * I file restano in memoria e vengono scritti in MongoDB.
 *
 * Prima si scrivevano in `server/uploads`, che su Render è un filesystem
 * temporaneo: al primo riavvio gli allegati sparivano. In memoria si caricano
 * solo i file della richiesta corrente, e il limite di 10 MB sotto è anche il
 * tetto di memoria per richiesta.
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(badRequest(`Tipo file non consentito: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

export interface Allegato {
  nome: string;
  url: string;
  tipo?: string;
  size?: number;
}

/**
 * Scrive in MongoDB i file appena caricati e restituisce i descrittori da mettere
 * nel documento che li referenzia.
 *
 * Se un salvataggio fallisce a metà, gli allegati già scritti restano orfani: non
 * è un danno, l'indice TTL li cancella dopo 24 ore. Preferibile a cancellare a
 * cascata, che richiederebbe di sapere quali documenti li hanno già referenziati.
 */
export async function toAllegati(req: Request): Promise<Allegato[]> {
  // `Express.Multer.File` vive solo nel sistema di tipi: non è un valore che
// Node possa risolvere a runtime, quindi ESLint lo segnala come non definito.
  // eslint-disable-next-line no-undef
  const lista: Express.Multer.File[] = [];

  // `single()` e `array()` non riempiono lo stesso campo: il primo scrive in
  // `req.file`, il secondo in `req.files`. Leggere solo il secondo faceva fallire
  // ogni caricamento singolo con "nessun file ricevuto".
  if (req.file) lista.push(req.file);
  if (req.files) {
    if (Array.isArray(req.files)) lista.push(...req.files);
    else lista.push(...Object.values(req.files).flat());
  }
  if (lista.length === 0) return [];

  const utente = currentUser(req);
  const condominio = String(req.params.condominioId ?? req.body?.condominio ?? '');
  if (!condominio) throw badRequest('Non è possibile allegare un file fuori da un condominio');

  const salvati: Allegato[] = [];
  for (const f of lista) {
    const descrittore: NuovoAllegato = {
      nome: f.originalname,
      tipo: f.mimetype,
      dati: f.buffer,
      size: f.size,
      mittente: utente.sub,
      condominio,
    };
    salvati.push(await salvaAllegato(descrittore));
  }
  return salvati;
}