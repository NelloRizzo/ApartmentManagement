import { Types } from 'mongoose';
import {
  Condominio,
  Contratto,
  PagamentoContratto,
  Unita,
  User,
  MESI_PER_PERIODICITA,
  type ContrattoDoc,
  type ContrattoDocumento,
  type StatoContratto,
} from '../models/index.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { auditLog } from './audit.service.js';

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Aggiunge mesi a una data.
 *
 * Il metodo `setMonth` di `Date` può "scivolare" (31 gennaio + 1 mese =
 * 3 marzo), quindi il giorno viene riportato all'ultimo giorno del mese
 * di destinazione.
 */
export function aggiungiMesi(data: Date, mesi: number): Date {
  const risultato = new Date(data.getTime());
  const giorno = risultato.getDate();
  risultato.setDate(1);
  risultato.setMonth(risultato.getMonth() + mesi);
  const ultimoGiorno = new Date(
    risultato.getFullYear(),
    risultato.getMonth() + 1,
    0,
  ).getDate();
  risultato.setDate(Math.min(giorno, ultimoGiorno));
  return risultato;
}

export function prossimoCodiceContratto(): Promise<string> {
  const anno = new Date().getFullYear();
  return Contratto.countDocuments({ codice: new RegExp(`^CTR-${anno}-`) })
    .then((n) => `CTR-${anno}-${String(n + 1).padStart(3, '0')}`);
}

/** Numero di unità che l'amministratore amministra davvero, su tutti i condomini. */
export async function unitaInCarico(amministratoreId: string): Promise<number> {
  const condomini = await Condominio.find({ amministratore: amministratoreId }).select('_id').lean();
  if (condomini.length === 0) return 0;
  return Unita.countDocuments({
    condominio: { $in: condomini.map((c) => c._id) },
    attiva: true,
  });
}

export interface StatoServizio {
  contratto: ContrattoDoc | null;
  stato: StatoContratto | 'nessuno';
  unitaMassime: number;
  unitaInUso: number;
  /** Restano unità aggiungibili: zero se il contratto non è utilizzabile. */
  unitaDisponibili: number;
  /** Il contratto è in stato "attivo" e non ancora scaduto. */
  utilizzabile: boolean;
  /** Solo temporale: la data di scadenza è passata. */
  scaduto: boolean;
  giorniAllaScadenza: number | null;
}

/**
 * Contratto che regge l'operatività di un utente.
 *
 * Un assistente non ha un contratto proprio: la sua posizione è regolata dal
 * contratto dell'amministratore che lo ha delegato, altrimenti la delega
 * sopravviverebbe alla sospensione del servizio.
 */
export async function contrattoDiRiferimento(utenteId: string): Promise<string | null> {
  const utente = await User.findById(utenteId).select('delegatoDa role').lean();
  if (!utente) return null;
  if (utente.delegatoDa) return String(utente.delegatoDa);
  return null;
}

/**
 * Situazione del servizio per un amministratore: contratto vigente, capacità e
 * avvicinamento alla scadenza.
 *
 * Un contratto scaduto non viene modificato qui: resta in stato "attivo" fino a
 * che qualcuno lo chiude. Lo stato effettivo è ricavato dalla data, così non
 * serve un job schedulato che faccia scadere i contratti.
 */
export async function statoServizio(amministratoreId: string): Promise<StatoServizio> {
  const titolare = (await contrattoDiRiferimento(amministratoreId)) ?? amministratoreId;

  const [contratto, inUso] = await Promise.all([
    Contratto.findOne({
      amministratore: titolare,
      stato: { $in: ['attivo', 'sospeso', 'scaduto'] },
    }).sort({ dataScadenza: -1 }),
    // La capacità è unica per contratto: se la richiesta arriva da un
    // assistente, le unità contate sono quelle amministrate dal delegante, non
    // un eventuale pool separato. Altrimenti l'assistente vedrebbe un
    // contratto con tutte le unità disponibili e potrebbe superarlo.
    unitaInCarico(titolare),
  ]);

  if (!contratto) {
    return {
      contratto: null,
      stato: 'nessuno',
      unitaMassime: 0,
      unitaInUso: inUso,
      unitaDisponibili: 0,
      utilizzabile: false,
      scaduto: true,
      giorniAllaScadenza: null,
    };
  }

  const scaduto = new Date(contratto.dataScadenza) < new Date();
  const utilizzabile = contratto.stato === 'attivo' && !scaduto;
  const giorni = Math.ceil((new Date(contratto.dataScadenza).getTime() - Date.now()) / 86_400_000);

  return {
    contratto,
    stato: contratto.stato,
    unitaMassime: contratto.unitaMassime,
    unitaInUso: inUso,
    unitaDisponibili: utilizzabile ? Math.max(0, contratto.unitaMassime - inUso) : 0,
    utilizzabile,
    scaduto,
    giorniAllaScadenza: giorni,
  };
}

/**
 * Verifica che l'amministratore possa aggiungere nuove unità immobiliari.
 *
 * Un contratto sospeso o scaduto congela l'espansione: l'amministratore
 * continua a gestire ciò che ha già, ma non può accrescere il carico.
 */
export async function verificaCapacita(
  amministratoreId: string,
  nuoveUnita: number,
): Promise<StatoServizio> {
  const stato = await statoServizio(amministratoreId);

  if (!stato.contratto) {
    throw conflict(
      'Non risulta alcun contratto attivo: contatta l’amministratore di piattaforma per attivare il servizio',
    );
  }

  if (stato.contratto.stato === 'sospeso') {
    throw forbidden('Il contratto è sospeso: le operazioni sono bloccate fino alla riattivazione');
  }

  if (stato.contratto.stato === 'cessato') {
    throw forbidden('Il contratto è cessato');
  }

  if (stato.contratto.stato !== 'attivo') {
    throw forbidden('Non risultano contratti attivi');
  }

  if (stato.scaduto) {
    throw conflict(
      `Il contratto è scaduto il ${new Date(stato.contratto.dataScadenza).toLocaleDateString('it-IT')}: non è possibile aggiungere nuove unità finché non viene rinnovato`,
    );
  }

  if (stato.unitaInUso + nuoveUnita > stato.unitaMassime) {
    throw conflict(
      `Capacità contrattuale superata: il contratto prevede ${stato.unitaMassime} unità immobiliari e ne sono già in carico ${stato.unitaInUso}`,
      {
        unitaMassime: stato.unitaMassime,
        unitaInUso: stato.unitaInUso,
        richieste: nuoveUnita,
        disponibili: Math.max(0, stato.unitaMassime - stato.unitaInUso),
      },
    );
  }

  return stato;
}

export interface DatiContratto {
  amministratore: string;
  unitaMassime: number;
  costo: number;
  periodicita: 'mensile' | 'trimestrale' | 'semestrale' | 'annuale';
  durataMesi: number;
  dataInizio: Date;
  mesiProroga?: number;
  rinnovoAutomatico?: boolean;
  note?: string;
  stato?: StatoContratto;
}

/** Genera (o completa) il piano rateale di un contratto. */
export async function generaRate(
  contratto: ContrattoDocumento,
  dalProgressivo: number,
  mesiDaCoprire: number,
): Promise<void> {
  const mesiPerRata = MESI_PER_PERIODICITA[contratto.periodicita];
  const numeroRate = Math.max(0, Math.floor(mesiDaCoprire / mesiPerRata));
  if (numeroRate === 0) return;

  const esistenti = await PagamentoContratto.find({ contratto: contratto._id })
    .select('progressivo')
    .lean();
  const numeriUsati = new Set(esistenti.map((p) => p.progressivo));

  const nuove = [];
  for (let i = 0; i < numeroRate; i++) {
    const progressivo = dalProgressivo + i;
    if (numeriUsati.has(progressivo)) continue;
    nuove.push({
      contratto: contratto._id,
      progressivo,
      scadenza: aggiungiMesi(contratto.dataInizio, progressivo * mesiPerRata),
      importo: round2(contratto.costo),
      stato: 'da_pagare' as const,
    });
  }

  if (nuove.length > 0) await PagamentoContratto.insertMany(nuove);
}

export async function creaContratto(dati: DatiContratto, operatoreId: string): Promise<ContrattoDoc> {
  const amministratore = await User.findById(dati.amministratore);
  if (!amministratore) throw notFound('Amministratore non trovato');
  if (amministratore.role !== 'admin') {
    throw badRequest('Il contratto può essere stipulato solo con un amministratore di condominio');
  }

  const contrattoAttivo = await Contratto.findOne({
    amministratore: dati.amministratore,
    stato: { $in: ['bozza', 'attivo', 'sospeso'] },
  });
  if (contrattoAttivo) {
    throw conflict('Esiste già un contratto non concluso per questo amministratore', {
      contrattoId: String(contrattoAttivo._id),
      stato: contrattoAttivo.stato,
    });
  }

  const codice = await prossimoCodiceContratto();
  const dataScadenza = aggiungiMesi(dati.dataInizio, dati.durataMesi);

  const contratto = await Contratto.create({
    codice,
    amministratore: dati.amministratore,
    stato: dati.stato ?? 'attivo',
    unitaMassime: dati.unitaMassime,
    costo: dati.costo,
    periodicita: dati.periodicita,
    durataMesi: dati.durataMesi,
    dataInizio: dati.dataInizio,
    dataScadenza,
    mesiProroga: dati.mesiProroga ?? 12,
    rinnovoAutomatico: dati.rinnovoAutomatico ?? false,
    note: dati.note,
    creatoDa: operatoreId,
    storico: [
      {
        data: new Date(),
        azione: 'stipula',
        a: dati.stato ?? 'attivo',
        nota: `${dati.unitaMassime} unità immobiliari a ${dati.costo} € per ${dati.durataMesi} mesi`,
        operatore: new Types.ObjectId(String(operatoreId)),
      },
    ],
  });

  await generaRate(contratto, 1, dati.durataMesi);

  await auditLog({
    attore: operatoreId,
    azione: 'stipula_contratto',
    entita: 'Contratto',
    entitaId: String(contratto._id),
    dettagli: {
      codice,
      amministratore: dati.amministratore,
      unitaMassime: dati.unitaMassime,
      costo: dati.costo,
    },
  });

  return contratto;
}

/** Transizioni consentite fra stati del contratto. */
const TRANSIZIONI: Record<StatoContratto, StatoContratto[]> = {
  bozza: ['attivo', 'cessato'],
  attivo: ['sospeso', 'cessato'],
  sospeso: ['attivo', 'cessato'],
  // Uno scaduto si riporta ad attivo solo con una proroga, non con una riattivazione.
  scaduto: ['attivo', 'cessato'],
  cessato: [],
};

export function puoTransizionareContratto(da: StatoContratto, a: StatoContratto): boolean {
  return TRANSIZIONI[da].includes(a);
}

const ETICHETTE_STATO: Record<StatoContratto, string> = {
  bozza: 'Bozza',
  attivo: 'Attivo',
  sospeso: 'Sospeso',
  scaduto: 'Scaduto',
  cessato: 'Cessato',
};

export function etichettaStato(stato: string): string {
  return ETICHETTE_STATO[stato as StatoContratto] ?? stato;
}

/**
 * Estende la durata del contratto di un numero di mesi e genera le rate
 * conseguenti. La capacità viene aggiornata solo se esplicitamente richiesto.
 *
 * `dataInizio` non viene spostata: le rate restano ancorate all'anniversario
 * della data di inizio, così una proroga non allinea le scadenze al mese in cui
 * è stata firmata.
 */
export async function proroga(
  contratto: ContrattoDocumento,
  mesi: number,
  operatoreId: string,
  opzioni: { nuovaCapacita?: number; nota?: string } = {},
): Promise<ContrattoDoc> {
  if (contratto.stato === 'cessato') throw conflict('Un contratto cessato non può essere prorogato');
  if (mesi < 1) throw badRequest('La proroga deve essere di almeno un mese');

  const nuovaScadenza = aggiungiMesi(contratto.dataScadenza, mesi);
  const rateDa = await ratePrecedenti(contratto);

  if (opzioni.nuovaCapacita !== undefined) {
    if (opzioni.nuovaCapacita < 1) throw badRequest('La capacità deve essere almeno 1 unità immobiliare');
    contratto.unitaMassime = opzioni.nuovaCapacita;
  }

  const precedente = contratto.stato;
  contratto.dataScadenza = nuovaScadenza;
  contratto.durataMesi += mesi;
  contratto.stato = 'attivo';
  contratto.sospesoIl = undefined;
  contratto.sospesoMotivo = undefined;
  contratto.storico.push({
    data: new Date(),
    azione: 'proroga',
    da: precedente,
    a: 'attivo',
    nota:
      opzioni.nota ??
      `Proroga di ${mesi} mesi fino al ${nuovaScadenza.toLocaleDateString('it-IT')}`,
    operatore: new Types.ObjectId(String(operatoreId)),
  });

  await contratto.save();
  await generaRate(contratto, rateDa + 1, mesi);

  await auditLog({
    attore: operatoreId,
    azione: 'proroga_contratto',
    entita: 'Contratto',
    entitaId: String(contratto._id),
    dettagli: { mesi, nuovaScadenza, nuovaCapacita: opzioni.nuovaCapacita },
  });

  return contratto;
}

async function ratePrecedenti(contratto: ContrattoDoc): Promise<number> {
  const ultimo = await PagamentoContratto.findOne({ contratto: contratto._id })
    .sort({ progressivo: -1 })
    .select('progressivo')
    .lean();
  return ultimo?.progressivo ?? 0;
}

/** Sospende il contratto: l'amministratore non può più scrivere. */
export async function sospendi(
  contratto: ContrattoDocumento,
  motivo: string,
  operatoreId: string,
): Promise<ContrattoDoc> {
  if (!puoTransizionareContratto(contratto.stato, 'sospeso')) {
    throw conflict(`Transizione non consentita da "${contratto.stato}" a "sospeso"`);
  }

  contratto.stato = 'sospeso';
  contratto.sospesoIl = new Date();
  contratto.sospesoMotivo = motivo;
  contratto.storico.push({
    data: new Date(),
    azione: 'sospensione',
    da: contratto.stato,
    a: 'sospeso',
    nota: motivo,
    operatore: new Types.ObjectId(String(operatoreId)),
  });
  await contratto.save();

  await auditLog({
    attore: operatoreId,
    azione: 'sospensione_contratto',
    entita: 'Contratto',
    entitaId: String(contratto._id),
    dettagli: { motivo },
  });

  return contratto;
}

/** Riattiva un contratto sospeso. È l'unica via per sbloccare l'amministratore. */
export async function riattiva(
  contratto: ContrattoDocumento,
  operatoreId: string,
  nota?: string,
): Promise<ContrattoDoc> {
  if (!puoTransizionareContratto(contratto.stato, 'attivo')) {
    throw conflict(`Transizione non consentita da "${contratto.stato}" a "attivo"`);
  }

  const precedente = contratto.stato;
  contratto.stato = 'attivo';
  contratto.sospesoIl = undefined;
  contratto.sospesoMotivo = undefined;
  contratto.storico.push({
    data: new Date(),
    azione: 'riattivazione',
    da: precedente,
    a: 'attivo',
    nota,
    operatore: new Types.ObjectId(String(operatoreId)),
  });
  await contratto.save();

  await auditLog({
    attore: operatoreId,
    azione: 'riattivazione_contratto',
    entita: 'Contratto',
    entitaId: String(contratto._id),
    dettagli: { nota },
  });

  return contratto;
}

/** Chiude definitivamente il contratto. */
export async function cessa(
  contratto: ContrattoDocumento,
  motivo: string,
  operatoreId: string,
): Promise<ContrattoDoc> {
  if (!puoTransizionareContratto(contratto.stato, 'cessato')) {
    throw conflict(`Transizione non consentita da "${contratto.stato}" a "cessato"`);
  }

  contratto.stato = 'cessato';
  contratto.cessatoIl = new Date();
  contratto.cessatoMotivo = motivo;
  contratto.storico.push({
    data: new Date(),
    azione: 'cessazione',
    da: contratto.stato,
    a: 'cessato',
    nota: motivo,
    operatore: new Types.ObjectId(String(operatoreId)),
  });

  // Le rate non ancora scadute perdono senso.
  await PagamentoContratto.updateMany(
    { contratto: contratto._id, stato: 'da_pagare', scadenza: { $gte: new Date() } },
    { $set: { stato: 'annullato' } },
  );

  await contratto.save();

  await auditLog({
    attore: operatoreId,
    azione: 'cessazione_contratto',
    entita: 'Contratto',
    entitaId: String(contratto._id),
    dettagli: { motivo },
  });

  return contratto;
}

/** Sospende o riattiva in un colpo solo, in base allo stato corrente. */
export async function cambiaStatoServizio(
  contratto: ContrattoDocumento,
  azione: 'sospendi' | 'riattiva',
  operatoreId: string,
  motivo?: string,
): Promise<ContrattoDoc> {
  if (azione === 'sospendi') {
    return sospendi(contratto, motivo?.trim() || 'Sospensione non motivata', operatoreId);
  }
  return riattiva(contratto, operatoreId, motivo);
}