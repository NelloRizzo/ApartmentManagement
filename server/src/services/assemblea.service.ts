import { Assemblea, Condomino, type AssembleaDoc } from '../models/index.js';
import { STATI_ASSEMBLEA } from '../types/domain.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';

/** Testo standard della convocazione, usato per email e PDF. */
export function testoConvocazione(a: {
  numero: number;
  tipo: string;
  data: Date;
  oraInizio?: string;
  luogo: string;
  condomini: { nome: string; cognome: string }[];
  unita: { unita: string; codice: string }[];
  ordineDelGiorno: { ordine: number; titolo: string; descrizione?: string }[];
  amministratore: { nome: string; cognome: string };
  condominio: { nome: string; indirizzo: { via: string; civico?: string; citta?: string } };
}): string {
  const fmtData = (d: Date) =>
    new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);

  const righe: string[] = [];

  righe.push(`CONVOCAZIONE ASSEMBLEA ${a.tipo === 'straordinaria' ? 'STRAORDINARIA' : 'ORDINARIA'}`);
  righe.push(`Assemblea n. ${a.numero} del condominio "${a.condominio.nome}"`);
  righe.push('');
  righe.push('Gentile condomino,');
  righe.push(
    `è indetta per il giorno di ${fmtData(a.data)}${a.oraInizio ? ` alle ore ${a.oraInizio}` : ''} presso ${a.luogo} l'assemblea ${a.tipo} del condominio, per deliberare sui punti indicati nell'ordine del giorno che segue.`,
  );
  righe.push('');
  righe.push('ORDINE DEL GIORNO');
  a.ordineDelGiorno
    .slice()
    .sort((x, y) => x.ordine - y.ordine)
    .forEach((p) => {
      righe.push(`${p.ordine}. ${p.titolo}`);
      if (p.descrizione) righe.push(`   ${p.descrizione}`);
    });
  righe.push('');
  righe.push('Si ricorda che:');
  righe.push('- è ammesso il voto per delega, da rilasciarsi per iscritto e corredato di documento di identità del delegato;');
  righe.push('- il condomino che non può partecipare può farsi sostituire da un proprio familiare o da un proprio ospite;');
  righe.push('- per la validità dell’assemblea in prima convocazione è necessaria la presenza di condomini titolari di almeno un terzo dei millesimi;');
  righe.push('- in caso di mancato raggiungimento del quorum, si terrà una seconda convocazione entro trenta giorni.');
  righe.push('');
  righe.push('Cordiali saluti,');
  righe.push(`l’amministratore ${a.amministratore.nome} ${a.amministratore.cognome}`);

  return righe.join('\n');
}

export function nextNumeroAssemblea(ultimo: number | undefined): number {
  return (ultimo ?? 0) + 1;
}

const ordineStati: Record<(typeof STATI_ASSEMBLEA)[number], number> = {
  bozza: 0,
  convocata: 1,
  in_corso: 2,
  conclusa: 3,
  annullata: 3,
};

export function puoTransizionare(
  da: (typeof STATI_ASSEMBLEA)[number],
  a: (typeof STATI_ASSEMBLEA)[number],
): boolean {
  return ordineStati[a] >= ordineStati[da] && !(da === 'conclusa') && !(da === 'annullata');
}

/**
 * Stati raggiungibili da quello corrente, escluso quello corrente.
 *
 * Va sulla risposta del server perché la UI deve offrire esattamente le
 * transizioni valide: duplicare `ordineStati` nel client farebbe divergere i
 * due elenchi al primo cambiamento.
 */
export function transizioniConsentite(
  da: (typeof STATI_ASSEMBLEA)[number],
): (typeof STATI_ASSEMBLEA)[number][] {
  return STATI_ASSEMBLEA.filter((a) => a !== da && puoTransizionare(da, a));
}

/**
 * Stati in cui l'assemblea è visibile a chi non amministra.
 *
 * È la lista che `list` e `getOne` usano per il condòmino: qui sta in un posto
 * solo perché visibilità e elenco dei convocati devono dire la stessa cosa, e
 * divergerebbero al primo stato aggiunto. Il badge (`contaDaVedere`) ne usa una
 * parte: `conclusa` non conta più, perché dopo l'assemblea il documento che
 * conta è il verbale.
 */
export const STATI_VISIBILI = ['convocata', 'in_corso', 'conclusa'] as const;

export function visibileAlCondomino(stato: string): boolean {
  return (STATI_VISIBILI as readonly string[]).includes(stato);
}

/**
 * L'elenco dei convocati nasce con la convocazione.
 *
 * Una riga di `presenze` indica **chi è convocato**, non solo chi è presente:
 * è il filtro con cui la lista e il badge riconoscono le assemblee in cui il
 * condòmino ha una riga. Senza queste righe la convocazione resterebbe invisibile
 * a chi deve vederla, perché il foglio delle presenze viene compilato di norma
 * durante l'assemblea, non prima.
 *
 * Aggiunge solo i membri mancanti: un foglio già compilato in bozza resta com'è.
 */
export async function completaConvocati(assemblea: AssembleaDoc): Promise<void> {
  const iscritti = await Condomino.find({ condominio: assemblea.condominio, attivo: true })
    .select('_id')
    .lean();
  const giaConvocati = new Set(assemblea.presenze.map((p) => String(p.condomino)));
  for (const iscritto of iscritti) {
    if (!giaConvocati.has(String(iscritto._id))) {
      assemblea.presenze.push({ condomino: iscritto._id, presente: false });
    }
  }
}

/**
 * Un'assemblea conclusa non si tocca più.
 *
 * Come per il bilancio approvato: dopo la chiusura i punti all'ordine del giorno
 * e i loro allegati sono il documento che l'assemblea ha deliberato, e cambiarli
 * significherebbe riscrivere la delibera.
 */
export function assicuraAssembleaModificabile(assemblea: AssembleaDoc): void {
  if (assemblea.stato === 'conclusa' || assemblea.stato === 'annullata') {
    throw conflict(
      `L'assemblea è ${assemblea.stato}: non è più modificabile. Per correggere i suoi allegati, riportala indietro.`,
    );
  }
}

export async function validaChiusura(assemblea: AssembleaDoc): Promise<void> {
  if (!assemblea.ordineDelGiorno || assemblea.ordineDelGiorno.length === 0) {
    throw badRequest('Impossibile concludere un’assemblea senza ordine del giorno');
  }

  const votazioni = new Set((assemblea.votazioni ?? []).map((v) => v.ordine));
  const senzaEsito = assemblea.ordineDelGiorno.filter((p) => !votazioni.has(p.ordine));
  if (senzaEsito.length > 0) {
    throw badRequest('Ogni punto dell’ordine del giorno deve avere una votazione registrata', {
      punti: senzaEsito.map((p) => p.ordine),
    });
  }

  const senzaDelibera = assemblea.ordineDelGiorno.filter(
    (p) => (assemblea.votazioni ?? []).find((v) => v.ordine === p.ordine)?.esito === 'approvato' && !p.delibera,
  );
  if (senzaDelibera.length > 0) {
    throw badRequest('I punti approvati devono riportare il testo della delibera', {
      punti: senzaDelibera.map((p) => p.ordine),
    });
  }

  if ((assemblea.presenze ?? []).filter((p) => p.presente).length === 0) {
    throw badRequest('Impossibile concludere un’assemblea senza presenze registrate');
  }
}

export async function getAssembleaOrThrow(id: string): Promise<AssembleaDoc> {
  const assemblea = await Assemblea.findById(id);
  if (!assemblea) throw notFound('Assemblea non trovata');
  return assemblea;
}
