import type { Types } from 'mongoose';
import { Bilancio } from '../models/index.js';
import type { TipoBilancio } from '../types/domain.js';

/**
 * Punti all'ordine già scritti, con la delibera collegata.
 *
 * Il segretario sceglie il modello e il verbale esce già con la formulazione
 * legally corretta e le cifre del bilancio. Scrivere la delibera a mano è il
 * modo in cui il verbale finisce per non corrispondere al bilancio allegato.
 *
 * Nei testi restano i segnaposto `{anno}`, `{totale}` e `{totaleMensile}`:
 * vengono risolti alla generazione del verbale, quando le cifre sono definitive.
 */
export interface ModelloOrdine {
  chiave: string;
  etichetta: string;
  titolo: string;
  descrizione: string;
  delibera: string;
  richiede: TipoBilancio;
  /** Vero solo se esiste un bilancio di quel tipo per l'anno indicato. */
  disponibile: boolean;
  bilancioId?: string;
  totale?: number;
}

interface ModelloBase {
  chiave: string;
  etichetta: string;
  richiede: TipoBilancio;
  titolo: (anno: number) => string;
  descrizione: (anno: number) => string;
  delibera: (anno: number) => string;
}

export const MODELLI_ORDINE: ModelloBase[] = [
  {
    chiave: 'bilancio_preventivo',
    etichetta: 'Approvazione del bilancio preventivo',
    richiede: 'preventivo',
    titolo: (anno) => `Approvazione del bilancio preventivo ${anno}`,
    descrizione: (anno) =>
      `Esame e approvazione del bilancio preventivo relativo all'esercizio ${anno}, con le previsioni di spesa e la loro ripartizione fra i condomini secondo i millesimi di diritto. Il bilancio è depositato presso l'amministratore e può essere consultato su richiesta.`,
    delibera: (anno) =>
      `approvato il bilancio preventivo dell'esercizio ${anno}, che chiude con un totale di spese preventivate di {totale}, corrispondenti a {totaleMensile} mensili, e confermata la ripartizione di dette spese fra i condomini in proporzione ai millesimi di diritto di ciascuna unità immobiliare.`,
  },
  {
    chiave: 'bilancio_consuntivo',
    etichetta: 'Approvazione del bilancio consuntivo',
    richiede: 'consuntivo',
    titolo: (anno) => `Approvazione del bilancio consuntivo ${anno}`,
    descrizione: (anno) =>
      `Esame del bilancio consuntivo dell'esercizio ${anno}, con il confronto fra le spese effettivamente sostenute e quelle preventivate e la ratifica definitiva delle ripartizioni.`,
    delibera: (anno) =>
      `preso atto del bilancio consuntivo dell'esercizio ${anno}, che chiude con un totale di spese effettivamente sostenute di {totale}, e approvate in via definitiva le relative ripartizioni fra i condomini, con gli eventuali conguagli da recuperare sulle quote del successivo esercizio.`,
  },
];

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Formato italiano con separatore delle migliaia, per le cifre nelle delibere. */
function importoPerDelibera(n: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(round2(n));
}

/**
 * Modelli pronti per l'anno indicato, con il bilancio collegato quando esiste.
 *
 * Un modello resta nell'elenco anche senza bilancio, con `disponibile: false`:
 * l'amministratore può così comporre l'ordine del giorno prima di aver
 * chiuso i conti, e il verbale segnalerà comunque che le cifre mancano.
 */
export async function modelliOrdineDelGiorno(
  condominioId: string,
  anno: number,
): Promise<ModelloOrdine[]> {
  const bilanci = await Bilancio.find({ condominio: condominioId, anno })
    .select('tipo totale')
    .lean<{ _id: Types.ObjectId; tipo: TipoBilancio; totale: number }[]>();

  const perTipo = new Map(bilanci.map((b) => [b.tipo, b]));

  return MODELLI_ORDINE.map((m) => {
    const bilancio = perTipo.get(m.richiede);
    return {
      chiave: m.chiave,
      etichetta: m.etichetta,
      titolo: m.titolo(anno),
      descrizione: m.descrizione(anno),
      delibera: m.delibera(anno),
      richiede: m.richiede,
      disponibile: Boolean(bilancio),
      bilancioId: bilancio ? String(bilancio._id) : undefined,
      totale: bilancio?.totale,
    };
  });
}

/**
 * Compone il punto all'ordine da un modello.
 *
 * La delibera viene arricchita subito con le cifre disponibili, così
 * l'amministratore la vede già leggibile; i segnaposto rimasti saranno risolti
 * dal verbale.
 */
export function puntoDaModello(modello: ModelloOrdine): {
  titolo: string;
  descrizione: string;
  delibera: string;
  bilancio?: string;
} {
  return {
    titolo: modello.titolo,
    descrizione: modello.descrizione,
    delibera: compiaDelibera(modello.delibera, modello.totale),
    bilancio: modello.bilancioId,
  };
}

/** Sostituisce i segnaposto rimasti con i valori conosciuti. */
export function compiaDelibera(testo: string, totale?: number): string {
  return testo
    .replaceAll('{totale}', totale !== undefined ? importoPerDelibera(totale) : '€ …')
    .replaceAll('{totaleMensile}', totale !== undefined ? importoPerDelibera(round2(totale / 12)) : '€ …');
}
