export const USER_ROLES = ['superadmin', 'admin', 'portiere', 'condomino'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Ambiti delegabili a un assistente.
 *
 * Ogni ambito può essere concesso in sola lettura o anche in scrittura. Sono
 * gli stessi raggruppamenti usati dal menu, così quello che si vede nella
 * navigazione corrisponde a quello che si può delegare.
 */
export const AMBITI = [
  {
    chiave: 'unita',
    etichetta: 'Unità immobiliari',
    descrizione: 'Anagrafica degli immobili: creazione, modifica e disattivazione.',
  },
  {
    chiave: 'iscritti',
    etichetta: 'Condòmini iscritti',
    descrizione: 'Registro delle posizioni, con regime e quota di proprietà.',
  },
  {
    chiave: 'tabella',
    etichetta: 'Quote millesimali',
    descrizione: 'Tabella millesimale e nuove revisioni deliberate.',
  },
  {
    chiave: 'bilanci',
    etichetta: 'Bilanci',
    descrizione: 'Voci di spesa da cui dipendono le quote mensili.',
  },
  {
    chiave: 'assemblee',
    etichetta: 'Assemblee',
    descrizione: 'Convocazioni, presenze, votazioni e delibere.',
  },
  {
    chiave: 'verbali',
    etichetta: 'Verbali',
    descrizione: 'Redazione, modifica e approvazione dei verbali.',
  },
  {
    chiave: 'versamenti',
    etichetta: 'Quote e versamenti',
    descrizione: 'Calcolo delle quote e registrazione dei pagamenti.',
  },
  {
    chiave: 'comunicazioni',
    etichetta: 'Comunicazioni',
    descrizione: 'Avvisi ai condòmini e risposte ai loro messaggi.',
  },
  {
    chiave: 'amministrazione',
    etichetta: 'Amministrazione',
    descrizione: 'Assegnazione di assistenti e servizi. Riservata agli amministratori.',
  },
] as const;

export type Ambito = (typeof AMBITI)[number]['chiave'];

export const AZIONI = ['leggere', 'scrivere'] as const;
export type Azione = (typeof AZIONI)[number];

/** Un ambito e un'azione, per esempio `unita:scrivere`. */
export type Permesso = `${Ambito}:${Azione}`;

export const TUTTI_I_PERMESSI: Permesso[] = AMBITI.flatMap((a) =>
  AZIONI.map((z) => `${a.chiave}:${z}` as Permesso),
);

export function isPermesso(valore: string): valore is Permesso {
  return TUTTI_I_PERMESSI.includes(valore as Permesso);
}

export function permessoDi(ambito: Ambito, azione: Azione): Permesso {
  return `${ambito}:${azione}`;
}

/**
 * Un permesso in scrittura implica quello in lettura: chi registra un
 * versamento deve poter vedere la tabella delle quote, altrimenti l'interfaccia
 * mostrerebbe dati incoerenti. Così non serve spuntare entrambe le caselle.
 */
export function haPermesso(assegnati: Permesso[] | null, richiesto: Permesso): boolean {
  if (!assegnati) return true; // nessun elenco significa accesso pieno
  if (assegnati.includes(richiesto)) return true;
  const [ambito] = richiesto.split(':') as [Ambito, Azione];
  return assegnati.includes(permessoDi(ambito, 'scrivere'));
}

export const REGIMES = ['proprietario', 'inquilino', 'comodatario', 'nuda_proprieta'] as const;
export type Regime = (typeof REGIMES)[number];

export const TIPI_UNITA = ['appartamento', 'ufficio', 'negozio', 'garage', 'cantina', 'soffitta', 'altro'] as const;
export type TipoUnita = (typeof TIPI_UNITA)[number];

export const RIPARTIZIONI = ['diritto', 'uso', 'spese', 'scale', 'ascensore'] as const;
export type Ripartizione = (typeof RIPARTIZIONI)[number];

export const TIPI_ASSEMBLEA = ['ordinaria', 'straordinaria'] as const;
export type TipoAssemblea = (typeof TIPI_ASSEMBLEA)[number];

export const STATI_ASSEMBLEA = ['bozza', 'convocata', 'in_corso', 'annullata', 'conclusa'] as const;
export type StatoAssemblea = (typeof STATI_ASSEMBLEA)[number];

export const METODI_PAGAMENTO = ['bonifico', 'contanti', 'carta', 'addebito_direct', 'altro'] as const;
export type MetodoPagamento = (typeof METODI_PAGAMENTO)[number];

export const TIPI_COMUNICAZIONE = [
  'avviso',
  'richiesta',
  'reclamo',
  'segnalazione',
  'risposta',
  'convocazione',
] as const;
export type TipoComunicazione = (typeof TIPI_COMUNICAZIONE)[number];

export const STATI_COMUNICAZIONE = ['bozza', 'inviata', 'letta', 'risposta'] as const;
export type StatoComunicazione = (typeof STATI_COMUNICAZIONE)[number];

// ---------- Bilancio ----------

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

/** Base di ripartizione di una voce di bilancio, distinta dalla tabella millesimale. */
export const RIPARTIZIONI_BILANCIO = ['diritto', 'uso', 'spese', 'criterio'] as const;
export type RipartizioneBilancio = (typeof RIPARTIZIONI_BILANCIO)[number];

export interface JwtUserPayload {
  sub: string;
  email: string;
  role: UserRole;
  name: string;
  /** Condomini in cui l'utente ha un ruolo operativo. */
  condominiIds: string[];
  /**
   * Permessi delegati all'assistente; `null` indica accesso pieno.
   * Va riletto dal database a ogni richiesta (vedi `requireAuth`), perché
   * l'amministratore può revocare una delega mentre l'assistente è collegato.
   */
  permessi: Permesso[] | null;
  tokenVersion: number;
}

export interface RefreshTokenPayload {
  sub: string;
  tokenVersion: number;
  type: 'refresh';
}
