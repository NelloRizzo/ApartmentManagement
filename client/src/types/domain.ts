export type UserRole = 'superadmin' | 'admin' | 'portiere' | 'condomino';

// ---------- Permessi delegabili ----------

export const AMBITI = [
  { chiave: 'unita', etichetta: 'Unità immobiliari', descrizione: 'Anagrafica degli immobili.' },
  { chiave: 'iscritti', etichetta: 'Condòmini iscritti', descrizione: 'Registro delle posizioni.' },
  { chiave: 'tabella', etichetta: 'Quote millesimali', descrizione: 'Tabella e nuove revisioni.' },
  { chiave: 'bilanci', etichetta: 'Bilanci', descrizione: 'Voci di spesa da cui dipendono le quote.' },
  { chiave: 'assemblee', etichetta: 'Assemblee', descrizione: 'Convocazioni, presenze, votazioni.' },
  { chiave: 'verbali', etichetta: 'Verbali', descrizione: 'Redazione e approvazione.' },
  { chiave: 'versamenti', etichetta: 'Quote e versamenti', descrizione: 'Calcolo quote e pagamenti.' },
  { chiave: 'comunicazioni', etichetta: 'Comunicazioni', descrizione: 'Avvisi e risposte ai condòmini.' },
  { chiave: 'amministrazione', etichetta: 'Amministrazione', descrizione: 'Delega assistenti e servizi.' },
] as const;

export type Ambito = (typeof AMBITI)[number]['chiave'];
export type Azione = 'leggere' | 'scrivere';
export type Permesso = `${Ambito}:${Azione}`;

/** Carico di un contratto: quanto della capacità acquistata è in uso. */
export interface CaricoContratto {
  contratto: string;
  codice: string;
  amministratore: string;
  email: string;
  stato: StatoContratto;
  condominiMassimi: number;
  condominiInUso: number;
  percentualeUtilizzo: number;
  scadenza: string;
}

/** Riepilogo di piattaforma: numeri e contratti in scadenza. */
export interface RiepilogoPiattaforma {
  amministratori: number;
  assistenti: number;
  contrattiAttivi: number;
  contrattiSospesi: number;
  incassato: number;
  incassatoMese: number;
  inScadenza: { contratto: string; codice: string; scadenza: string; giorni: number }[];
}

export interface Collaboratore {
  id: string;
  email: string;
  nome: string;
  cognome: string;
  nomeCompleto: string;
  role: UserRole;
  attivo: boolean;
  telefono?: string;
  accessoPieno: boolean;
  permessi: Permesso[];
  delegatoDa?: string | null;
  dataDelega?: string | null;
  ultimoAccesso?: string | null;
  /** `false` finché l'indirizzo non è stato confermato con il link ricevuto. */
  emailConfermato: boolean;
  confermaInviataIl?: string | null;
  creatoIl?: string;
  condominoDelegato?: string;
}

/** Esito dell'invio della conferma, come lo restituisce la creazione. */
export interface EsitoConferma {
  emailConfermato: boolean;
  inviata: boolean;
  motivo: string | null;
  scadenza: string | null;
}

// ---------- Contratti ----------

export type StatoContratto = 'bozza' | 'attivo' | 'sospeso' | 'scaduto' | 'cessato';
export type Periodicita = 'mensile' | 'trimestrale' | 'semestrale' | 'annuale';

export interface RataContratto {
  id: string;
  progressivo: number;
  scadenza: string;
  importo: number;
  stato: 'da_pagare' | 'pagato' | 'annullato';
  scaduta: boolean;
  dataPagamento: string | null;
  metodo: MetodoPagamento;
  identificativoTransazione?: string;
  quietanza?: string;
  note?: string;
}

export interface Contratto {
  id: string;
  codice: string;
  amministratore: string;
  amministratoreId?: string;
  amministratoreEmail?: string;
  stato: StatoContratto;
  condominiMassimi: number;
  condominiInUso: number;
  costo: number;
  periodicita: Periodicita;
  durataMesi: number;
  dataInizio: string;
  dataScadenza: string;
  giorniAllaScadenza: number | null;
  scaduto: boolean;
  rinnovoAutomatico: boolean;
  mesiProroga: number;
  note?: string;
  sospesoIl?: string;
  sospesoMotivo?: string;
  cessatoIl?: string;
  cessatoMotivo?: string;
  creatoIl: string;
  proroghe: number;
  condomini?: { id: string; nome: string; codice: string }[];
  rate?: RataContratto[];
  incassato?: number;
  dovuto?: number;
  saldo?: number;
  storico?: {
    data: string;
    azione: string;
    da?: string;
    a?: string;
    nota?: string;
    /** Valori cambiati, quando l'azione è una modifica o una proroga. */
    modifiche?: { campo: string; da: string; a: string }[];
    operatore?: string | null;
    operatoreNome?: string | null;
  }[];
  messaggi?: MessaggioPiattaforma[];
}

export interface MessaggioPiattaforma {
  id: string;
  contratto: string | null;
  mittente: { id: string; nome: string; cognome: string };
  destinatario: { id: string; nome: string; cognome: string };
  tipo: 'info' | 'avviso' | 'sollecito';
  oggetto: string;
  corpo: string;
  letto: boolean;
  creatoIl: string;
}

export interface MioStatoContratto {
  ruolo: UserRole;
  stato?: StatoContratto | 'nessuno';
  contratto?: {
    id: string;
    codice: string;
    condominiMassimi: number;
    condominiInUso: number;
    condominiDisponibili: number;
    costo: number;
    periodicita: Periodicita;
    dataScadenza: string;
    giorniAllaScadenza: number | null;
    scaduto: boolean;
    utilizzabile: boolean;
  } | null;
  prossimaRata?: { id: string; scadenza: string; importo: number } | null;
  contrattiAttivi?: number;
  inScadenzaEntro30Giorni?: number;
}

export type Regime = 'proprietario' | 'inquilino' | 'comodatario' | 'nuda_proprieta';

export type TipoUnita = 'appartamento' | 'ufficio' | 'negozio' | 'garage' | 'cantina' | 'soffitta' | 'altro';

export type Ripartizione = 'diritto' | 'uso' | 'spese' | 'scale' | 'ascensore';

export type TipoAssemblea = 'ordinaria' | 'straordinaria';

export type StatoAssemblea = 'bozza' | 'convocata' | 'in_corso' | 'annullata' | 'conclusa';

export type MetodoPagamento = 'bonifico' | 'contanti' | 'carta' | 'addebito_direct' | 'altro';

export type TipoComunicazione =
  | 'avviso'
  | 'richiesta'
  | 'reclamo'
  | 'segnalazione'
  | 'risposta'
  | 'convocazione';

export type StatoComunicazione = 'bozza' | 'inviata' | 'letta' | 'risposta';

export interface ApiEnvelope<T> {
  success: true;
  data: T;
  meta?: PageMeta;
}

export interface ApiErrorEnvelope {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface Profilo {
  id: string;
  email: string;
  nome: string;
  cognome: string;
  nomeCompleto: string;
  role: UserRole;
  telefono?: string;
  /** Condomini su cui l'utente ha un ruolo operativo. */
  condominiIds: string[];
  /**
   * Permessi delegati; `null` indica accesso pieno. Gli amministratori senza
   * restrizioni ricevono `null`, gli assistenti l'elenco degli ambiti concessi.
   */
  permessi: Permesso[] | null;
  /** `false` finché l'indirizzo email non è stato confermato. */
  emailConfermato: boolean;
  isSuperadmin: boolean;
}

export interface CondominioPosizione {
  condominioId: string;
  nome?: string;
  codice?: string;
  regime: Regime;
  /** Quota di proprietà in percentuale. Vale 0 per le posizioni puramente operative. */
  quota: number;
  unita: string[];
  /** Vero quando il condominio è seguito per delega e non per titolarità. */
  assistito?: boolean;
}

export interface ProfiloCompleto extends Profilo {
  condomini: CondominioPosizione[];
}

export interface Condominio {
  _id: string;
  nome: string;
  codice: string;
  indirizzo: { via: string; civico?: string; citta?: string; cap?: string; provincia?: string };
  amministratore: string;
  condominiServito?: string[];
  deliberaRipartizione?: string;
  dataDeliberaRipartizione?: string;
  totaleMillesimi: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RiepilogoCondominio {
  unita: number;
  condomini: number;
  assembleeAperte: number;
  morosiMeseCorrente: number | null;
  /** Presente solo se l'utente può leggere l'ambito `tabella`. */
  tabella?: {
    revisione: number;
    valida: boolean;
    totaleDiritto: number;
    delibera?: string;
  };
}

export type Quote = Record<Ripartizione, number>;

export interface Unita {
  _id: string;
  condominio: string;
  codice: string;
  piano: number;
  numero?: string;
  tipo: TipoUnita;
  metratura?: number;
  vani?: number;
  descrizione?: string;
  attiva: boolean;
  note?: string;
}

export interface UnitaConQuote extends Unita {
  millesimi?: Partial<Quote> & { revisione: number };
  titolari?: { nome: string; regime: Regime; quota: number }[];
}

export interface RigaTabella {
  unitaId: string;
  codice: string;
  piano: number;
  tipo: TipoUnita;
  metratura?: number;
  quote: Quote;
  totale: number;
}

export interface TabellaMillesimale {
  condominioId: string;
  revisione: number;
  /** Somme per ripartizione, limitate a quelle effettivamente in uso. */
  totale: Partial<Quote>;
  /** Ripartizioni presenti: solo queste devono sommare a 1000. */
  ripartizioniAttive: Ripartizione[];
  valida: boolean;
  problemi: { ripartizione: Ripartizione; totale: number; scarto: number }[];
  righe: RigaTabella[];
  delibera?: string;
  dataDelibera?: string;
  generataIl: string;
}

export interface RevisioneTabella {
  revisione: number;
  delibera?: string;
  dataDelibera?: string;
  validFrom: string;
  validTo: string | null;
  totaleDiritto: number;
}

export interface Condomino {
  _id: string;
  condominio: string;
  utente: { _id: string; nome: string; cognome: string; email: string; telefono?: string; attivo?: boolean };
  unita: { _id: string; codice: string; piano: number; tipo: TipoUnita }[];
  regime: Regime;
  quota: number;
  primario: boolean;
  attivo: boolean;
  dataInizio: string;
  dataFine: string | null;
  note?: string;
  millesimi?: number;
}

export interface PuntoOrdine {
  ordine: number;
  titolo: string;
  descrizione?: string;
  delibera?: string;
  riservata?: boolean;
  /** Bilancio cui il punto si riferisce: le cifre finiscono nel verbale. */
  bilancio?: string;
  allegati: Allegato[];
}

export interface Presenza {
  condomino: string;
  presente: boolean;
  delegaA?: string | null;
  motivazioneAstenuto?: string;
  note?: string;
}

export interface Votazione {
  ordine: number;
  esito: 'approvato' | 'respinto' | 'rinviato' | 'dibattuto' | null;
  votiFavorevoli: number;
  votiContrari: number;
  astenuti: number;
  segreta: boolean;
  motivoRinvio?: string;
}

export interface Assemblea {
  _id: string;
  condominio: string;
  numero: number;
  tipo: TipoAssemblea;
  stato: StatoAssemblea;
  data: string;
  oraInizio?: string;
  oraChiusura?: string;
  luogo: string;
  secondaConvocazione: boolean;
  quattordiciGgiorni: boolean;
  presiedutaDa?: { nome: string; cognome: string };
  segretario?: { nome: string; cognome: string };
  ordineDelGiorno: PuntoOrdine[];
  presenze: Presenza[];
  votazioni: Votazione[];
  millesimiPresenti: number;
  millesimiTotali: number;
  /** Presenti registrati: lo calcola la lista, che non rimanda le righe di presenza. */
  numeroPresenti?: number;
  dataConvocazione?: string;
  dataChiusura?: string;
  allegati: Allegato[];
  note?: string;
  verbale?: { assemblea: string; numero: number; approvato: boolean } | null;
}

export interface Allegato {
  nome: string;
  url: string;
  tipo?: string;
  size?: number;
}

export interface Verbale {
  _id: string;
  condominio: string;
  assemblea: string | { _id: string; numero: number; tipo: TipoAssemblea; data: string; stato: StatoAssemblea };
  numero: number;
  data: string;
  testo: string;
  snapshot: {
    millesimiTotali: number;
    millesimiPresenti: number;
    presenze: { numeroCondomini: number; numeroDeleghe: number };
    punti: unknown[];
  };
  generatoDa?: { nome: string; cognome: string };
  generatoIl: string;
  modificatoManualmente: boolean;
  approvato: boolean;
  approvatoIl?: string;
  allegati: Allegato[];
}

export const TIPI_BILANCIO = ['preventivo', 'consuntivo'] as const;
export type TipoBilancio = (typeof TIPI_BILANCIO)[number];

export const CATEGORIE_BILANCIO = [
  'gestione',
  'pulizie',
  'manutenzione',
  'ascensore',
  'riscaldamento',
  'illuminazione',
  'acqua',
  'energia',
  'assicurazione',
  'imposte',
  'fondo',
  'altro',
] as const;
export type CategoriaBilancio = (typeof CATEGORIE_BILANCIO)[number];

export const RIPARTIZIONI_BILANCIO = ['diritto', 'uso', 'spese', 'criterio'] as const;
export type RipartizioneBilancio = (typeof RIPARTIZIONI_BILANCIO)[number];

/** Fattura o movimento che compone una voce di spesa. */
export interface DettaglioSpesa {
  _id?: string;
  fornitore?: string;
  fattura?: string;
  data?: string;
  importo?: number;
  pagato?: boolean;
}

export interface VoceBilancio {
  _id?: string;
  categoria: CategoriaBilancio;
  descrizione: string;
  /** Previsto nel preventivo, realizzato nel consuntivo. */
  importo: number;
  /** Importo del preventivo cui la voce si riferisce: solo nel consuntivo. */
  previsto?: number;
  ripartizione: RipartizioneBilancio;
  valorePerMillesimo?: number;
  voci: DettaglioSpesa[];
}

export interface Bilancio {
  _id: string;
  condominio: string;
  anno: number;
  tipo: TipoBilancio;
  descrizione?: string;
  voci: VoceBilancio[];
  totale: number;
  /** Totale che il preventivo dello stesso anno prevedeva: solo nel consuntivo. */
  totalePrevisto?: number;
  daBilancio?: string;
  deliberaAssemblea?: string;
  approvato: boolean;
  note?: string;
}

export interface Versamento {
  _id: string;
  condominio: string;
  unita: { _id: string; codice: string; piano: number };
  condomino?: { _id: string; nome: string; cognome: string };
  periodo: { anno: number; mese: number };
  importo: number;
  dataVersamento: string;
  dataValuta?: string;
  metodo: MetodoPagamento;
  causale?: string;
  identificativoTransazione?: string;
  allegato?: Allegato;
  note?: string;
}

export interface RigaQuota {
  unitaId: string;
  codice: string;
  nome?: string | null;
  utenteId?: string | null;
  piano?: number;
  millesimi: number;
  voci: { voce: string; importo: number }[];
  totale: number;
  versato: number;
  saldo: number;
  stato: 'pagato' | 'parziale' | 'non_pagato';
}

export interface RiepilogoQuote {
  condominioId: string;
  anno: number;
  mese: number;
  totaleDovuto: number;
  totaleVersato: number;
  saldo: number;
  morosi: RigaQuota[];
  righe: RigaQuota[];
  soloMie: boolean;
}

export interface Comunicazione {
  _id: string;
  condominio?: string;
  assemblea?: string;
  tipo: TipoComunicazione;
  stato: StatoComunicazione;
  mittente: { _id: string; nome: string; cognome: string; email?: string };
  destinatario?: { _id: string; nome: string; cognome: string; email?: string };
  oggetto: string;
  corpo: string;
  threadId?: string;
  dataInvio?: string;
  dataLettura?: string;
  allegati: Allegato[];
  richiedeRisposta: boolean;
  rispostaA?: string;
  createdAt: string;
  thread?: Comunicazione[];
}
