import { Condominio } from '../models/index.js';
import { conflict } from '../utils/errors.js';

/** Tre lettere del nome più tre cifre: `RES001`. Vedi `generaCodiceCondominio`. */
const MAX_CODICE = 6;

/** Quante volte si ricalcola il progressivo prima di dichiarare impossibile. */
const MAX_TENTATIVI = 20;

/**
 * Prefissi da provare, dal più corto nome al più corto prefisso.
 *
 * Tre lettere con tre cifre danno 999 codici (`RES001`…`RES999`). Oltre,
 * una lettera del prefisso cede il posto a una cifra in più (`RE0001`), così il
 * campo resta lungo 6 caratteri invece di crescere.
 */
export function prefissiDaNome(nome: string): string[] {
  const lettere = nome.toUpperCase().match(/[A-Z]/g)?.join('') ?? '';
  const base = lettere.slice(0, MAX_CODICE - 3) || 'CON';
  return Array.from(base, (_, i) => base.slice(0, base.length - i));
}

/**
 * Il codice che segue l'ultimo emesso per un prefisso, o `null` se le cifre non
 * bastano più: `RES` regge fino a `RES999`, e oltre serve un prefisso più corto.
 */
export function codiceSuccessivo(prefisso: string, occupato: number): string | null {
  const cifre = MAX_CODICE - prefisso.length;
  const prossimo = occupato + 1;
  if (prossimo >= 10 ** cifre) return null;
  return `${prefisso}${String(prossimo).padStart(cifre, '0')}`;
}

/**
 * Numero più alto già emesso per ciascun prefisso.
 *
 * I codici del vecchio formato (`RESIDENZAA-3F9A2C`) non hanno cifre in coda e
 * non vengono contati: non occupano progressivi e restano validi per sempre,
 * perché il campo non li richiama da nessuna parte.
 */
async function numeriInUso(prefissi: string[]): Promise<Map<string, number>> {
  const richiesta = new RegExp(`^(${prefissi.join('|')})\\d+$`);
  const codici = await Condominio.find({ codice: richiesta }, { codice: 1, _id: 0 }).lean();

  const numeri = new Map<string, number>();
  for (const { codice } of codici) {
    const trovato = /^([A-Z]+)(\d+)$/.exec(codice);
    if (!trovato) continue;
    const numero = Number(trovato[2]);
    if (numero > (numeri.get(trovato[1]!) ?? 0)) numeri.set(trovato[1]!, numero);
  }
  return numeri;
}

/**
 * Codice autogenerato per un condominio: tre lettere del nome e tre cifre di
 * progressivo, `RES001`.
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
 * Le tre lettere rendono il codice riconoscibile (`Residenza Aurora` dà
 * `RES…`), le tre cifre portano l'univocità anche fra stabili con lo stesso
 * nome. Il numero non è casuale: con `RES001` si legge a prima vista che è il
 * primo stabile con quel nome, cosa che un suffisso casuale rendeva impossibile.
 *
 * Il progressivo si ricalcola a ogni tentativo perché fra la lettura e la
 * creazione un altro amministratore può aver preso lo stesso numero: la prova
 * `exists` è la rete di sicurezza, non il meccanismo.
 */
export async function generaCodiceCondominio(nome: string): Promise<string> {
  const prefissi = prefissiDaNome(nome);

  for (let tentativo = 0; tentativo < MAX_TENTATIVI; tentativo += 1) {
    const occupati = await numeriInUso(prefissi);
    let esaurito = true;

    for (const prefisso of prefissi) {
      const codice = codiceSuccessivo(prefisso, occupati.get(prefisso) ?? 0);
      // `null` vuol dire che le cifre non bastano più: si passa al prefisso più
      // corto, che ne ha una in più.
      if (!codice) continue;
      esaurito = false;

      if (!(await Condominio.exists({ codice }))) return codice;
    }

    if (esaurito) break;
  }

  throw conflict('Non è stato possibile generare un codice univoco per il condominio: riprova');
}
