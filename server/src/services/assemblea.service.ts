import { Assemblea, type AssembleaDoc } from '../models/index.js';
import type { STATI_ASSEMBLEA } from '../types/domain.js';
import { badRequest, notFound } from '../utils/errors.js';

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
