import { randomBytes } from 'node:crypto';
import { Condominio } from '../models/index.js';
import { conflict } from '../utils/errors.js';

/** Come il modello: 12 caratteri di nome, un trattino, 6 di suffisso. */
const MAX_CODICE = 20;

/**
 * Codice autogenerato per un condominio.
 *
 * Il campo è univoco e compare nei contratti, quindi non può essere lasciato a
 * chi lo digita: due amministratori che creano stabili con lo stesso nome
 * produrrebbero lo stesso codice, e il secondo si troverebbe un errore 500
 * dall'indice univoco invece di un conflitto dichiarato.
 *
 * Il codice non è modificabile dopo la creazione: è l'identificativo con cui lo
 * stabilo compare nei contratti, e cambiarlo renderebbero false le
 * comunicazioni già emesse. Per questo `condominioUpdateSchema` è `strict` e un
 * `codice` in una `PATCH` è un errore, non una modifica ignorata.
 *
 * Il nome serve solo a rendere il codice riconoscibile: `Residenza Aurora` dà
 * `RESIDENZAA-3F9A2C`. Il suffisso casuale porta l'univocità, perché due
 * stabili con nomi diversi possono condividere i primi dodici caratteri.
 */
export async function generaCodiceCondominio(nome: string): Promise<string> {
  const base =
    nome
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '')
      .slice(0, MAX_CODICE - 7) || 'CONDOMINIO';
  for (let tentativo = 0; tentativo < 20; tentativo += 1) {
    const codice = `${base}-${randomBytes(3).toString('hex').toUpperCase()}`;
    if (!(await Condominio.exists({ codice }))) return codice;
  }
  throw conflict('Non è stato possibile generare un codice univoco per il condominio: riprova');
}
