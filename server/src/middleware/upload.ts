import type { Request, RequestHandler } from 'express';
import multer from 'multer';
import { badRequest } from '../utils/errors.js';
import { currentUser } from '../middleware/auth.js';
import { salvaAllegato } from '../services/allegato.service.js';

export interface MetaAllegati {
  oggetto?: string;
  descrizione?: string;
  fonte?: string;
  riferimento?: string;
}

/**
 * I campi degli allegati sono **prefixati** perché il corpo della richiesta può
 * già avere un `oggetto` proprio: è quello della comunicazione o del verbale.
 */
const CAMPI_META = ['allegatiOggetto', 'allegatiDescrizione', 'allegatiFonte', 'allegatiRiferimento'] as const;

/**
 * Raccoglie i metadati degli allegati **prima** della validazione.
 *
 * Va montata dopo `upload` e prima di `validate`, perché `validate` *sostituisce*
 * `req.body` con il risultato di Zod, che scarta le chiavi non dichiarate: se il
 * controller li leggesse da lì, `allegatiOggetto` arriverebbe vuoto e ogni file
 * prenderebbe per oggetto il titolo del documento padre. Qui i campi vengono
 * anche **tolti** dal corpo, così Zod non li vede e non deve conoscerli.
 */
export const leggiMetaAllegati: RequestHandler = (req, _res, next) => {
  const corpo = (req.body ?? {}) as Record<string, unknown>;

  const testo = (chiave: string): string | undefined => {
    const valore = String(corpo[chiave] ?? '').trim();
    delete corpo[chiave];
    return valore || undefined;
  };

  req.allegatiMeta = {
    oggetto: testo(CAMPI_META[0]),
    descrizione: testo(CAMPI_META[1]),
    fonte: testo(CAMPI_META[2]),
    riferimento: testo(CAMPI_META[3]),
  };
  next();
};

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
 * Scrive in MongoDB i file appena caricati e restituisce gli id da mettere nel
 * documento che li referenzia.
 *
 * Il documento tiene **solo gli id**: i metadati si leggono da `Allegato` a ogni
 * richiesta, perché l'URL firmato vale 24 ore e non può stare dentro il
 * documento senza scadere.
 *
 * I metadati dell'allegato viaggiano in campi con prefisso `allegati`, perché il
 * corpo della richiesta può già avere un `oggetto` proprio: è quello della
 * comunicazione o del verbale. Se non arriva `allegatiOggetto` si usa quello del
 * documento padre, che di solito è la risposta giusta; se non c'è nessuno dei due
 * è un errore esplicito, non un file senza descrizione.
 *
 * Se un salvataggio fallisce a metà, gli allegati già scritti restano orfani: non
 * è un danno, l'indice TTL li cancella dopo 24 ore. Preferibile a cancellare a
 * cascata, che richiederebbe di sapere quali documenti li hanno già referenziati.
 */
export async function toAllegati(req: Request): Promise<string[]> {
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

  // I metadati arrivano da `leggiMetaAllegati`, non dal corpo: la validazione li
  // ha già scartati. `oggetto` del corpo è invece ancora leggibile, perché fa
  // parte dello schema del documento padre, e serve da ripiego.
  const meta = req.allegatiMeta ?? {};
  const corpo = (req.body ?? {}) as Record<string, unknown>;
  const oggetto = meta.oggetto ?? String(corpo.oggetto ?? '').trim();
  if (!oggetto) {
    throw badRequest("Indica l'oggetto degli allegati: serve a distinguerli nella lista");
  }

  const utente = currentUser(req);
  const condominio = String(req.params.condominioId ?? corpo.condominio ?? '');
  if (!condominio) throw badRequest('Non è possibile allegare un file fuori da un condominio');

  const salvati: string[] = [];
  for (const f of lista) {
    salvati.push(
      await salvaAllegato({
        nome: f.originalname,
        oggetto,
        descrizione: meta.descrizione ?? '',
        fonte: meta.fonte,
        riferimento: meta.riferimento,
        tipo: f.mimetype,
        dati: f.buffer,
        size: f.size,
        mittente: utente.sub,
        condominio,
      }),
    );
  }
  return salvati;
}