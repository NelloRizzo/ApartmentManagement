import { z } from 'zod';
import {
  RIPARTIZIONI,
  TIPI_UNITA,
  REGIMES,
  METODI_PAGAMENTO,
  TIPI_COMUNICAZIONE,
  STATI_COMUNICAZIONE,
  TIPI_ASSEMBLEA,
  STATI_ASSEMBLEA,
  TIPI_BILANCIO,
  CATEGORIE_BILANCIO,
  RIPARTIZIONI_BILANCIO,
} from '../types/domain.js';
import { PERIODICITA, STATI_CONTRATTO } from '../models/contratto.model.js';
import { TIPI_MESSAGGIO } from '../models/messaggioPiattaforma.model.js';

export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ObjectId non valido');

/**
 * Coercizione booleana per query string.
 *
 * `z.coerce.boolean()` applica `Boolean("false")`, che vale `true`: un filtro
 * `?approvato=false` selezionerebbe invece i documenti approvati. Qui i valori
 * "falsi" sono riconosciuti esplicitamente.
 */
const falsi = new Set(['false', '0', 'no', 'n', 'off', '']);
export const flagQuery = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : !falsi.has(v.trim().toLowerCase())));

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  sort: z.string().trim().max(40).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
  attivo: flagQuery.optional(),
  attiva: flagQuery.optional(),
});

/** Filtri comuni a molte liste. */
export const listQuery = paginationQuery.extend({
  attiva: flagQuery.optional(),
  sort: z.string().trim().max(40).default('createdAt'),
});

// ---------- Auth ----------
export const loginSchema = z.object({
  email: z.string().email('Email non valida').toLowerCase().trim(),
  password: z.string().min(8, 'Password troppo corta'),
});

/** Token di conferma dell'indirizzo: 32 caratteri esadecimali generati dal server. */
export const confermaEmailSchema = z.object({
  token: z.string().trim().min(32, 'Token di conferma non valido').max(128),
});

export const changePasswordSchema = z.object({
  attuale: z.string().min(1),  nuova: z.string().min(8, 'La nuova password deve avere almeno 8 caratteri'),
  conferma: z.string().min(1),
}).refine((d) => d.nuova === d.conferma, {
  message: 'La conferma non coincide con la nuova password',
  path: ['conferma'],
});

export const updateProfileSchema = z.object({
  nome: z.string().trim().min(1).max(80).optional(),
  cognome: z.string().trim().min(1).max(80).optional(),
  telefono: z.string().trim().max(30).optional(),
});

// ---------- Condominio ----------
export const condominioParams = z.object({ condominioId: objectId });

export const servizioParams = z.object({ condominioId: objectId, utenteId: objectId });

export const utenteBody = z.object({ utenteId: objectId });

export const unitaParams = z.object({ condominioId: objectId, id: objectId });

export const sempliceId = z.object({ id: objectId });

export const contrattoParam = z.object({ id: objectId });

export const rataParam = z.object({ id: objectId, rataId: objectId });

export const entitaParams = z.object({ condominioId: objectId, id: objectId });

export const assembleaParams = z.object({ condominioId: objectId, id: objectId });

export const verbaleParams = z.object({ condominioId: objectId, id: objectId });

export const assembleaVerbaleParams = z.object({ condominioId: objectId, assembleaId: objectId });

export const periodoQuery = z.object({
  anno: z.coerce.number().int().min(2000).max(2100).default(new Date().getFullYear()),
  mese: z.coerce.number().int().min(1).max(12).default(new Date().getMonth() + 1),
});

export const annoQuery = z.object({
  anno: z.coerce.number().int().min(2000).max(2100).default(new Date().getFullYear()),
});

export const tabellaQuery = z.object({
  revisione: z.coerce.number().int().min(1).optional(),
});

// ---------- Schemi di lista ----------
// Ogni rotta di lista dichiara qui i propri filtri: vengono uniti alla
// paginazione e sostituiscono `req.query` dopo la validazione.

export const unitaListQuery = paginationQuery.extend({
  attiva: flagQuery.optional(),
  tipo: z.enum(TIPI_UNITA).optional(),
  sort: z.string().default('codice'),
});

export const condominoListQuery = paginationQuery.extend({
  attivo: flagQuery.optional(),
  regime: z.enum(REGIMES).optional(),
  sort: z.string().default('utente.cognome'),
});

export const assembleaListQuery = paginationQuery.extend({
  stato: z.enum(STATI_ASSEMBLEA).optional(),
  tipo: z.enum(TIPI_ASSEMBLEA).optional(),
  sort: z.string().default('data'),
});

export const verbaleListQuery = paginationQuery.extend({
  approvato: flagQuery.optional(),
  search: z.string().max(300).optional(),
  sort: z.string().default('numero'),
});

export const versamentoListQuery = paginationQuery.extend({
  unita: objectId.optional(),
  anno: z.coerce.number().int().min(2000).max(2100).optional(),
  mese: z.coerce.number().int().min(1).max(12).optional(),
  dal: z.coerce.date().optional(),
  al: z.coerce.date().optional(),
  metodo: z.enum(METODI_PAGAMENTO).optional(),
  sort: z.string().default('dataVersamento'),
});

export const comunicazioneListQuery = paginationQuery.extend({
  bandiera: z.enum(['posta', 'inviate', 'bozze', 'tutte']).default('posta'),
  tipo: z.enum(TIPI_COMUNICAZIONE).optional(),
  stato: z.enum(STATI_COMUNICAZIONE).optional(),
});

export const bilancioListQuery = z.object({
  anno: z.coerce.number().int().min(2000).max(2100).optional(),
  tipo: z.enum(['preventivo', 'consuntivo']).optional(),
});

export const condominioCreateSchema = z.object({
  nome: z.string().trim().min(2).max(200),
  codice: z.string().trim().min(2).max(20).toUpperCase(),
  indirizzo: z.object({
    via: z.string().trim().min(1).max(200),
    civico: z.string().trim().max(20).optional(),
    citta: z.string().trim().max(100).optional(),
    cap: z.string().trim().max(10).optional(),
    provincia: z.string().trim().max(60).optional(),
  }),
  totaleMillesimi: z.number().int().positive().default(1000),
  deliberaRipartizione: z.string().trim().max(200).optional(),
  dataDeliberaRipartizione: z.coerce.date().optional(),
  note: z.string().trim().max(4000).optional(),
});

export const condominioUpdateSchema = condominioCreateSchema.partial();

// ---------- Unità ----------
export const unitaCreateSchema = z.object({
  codice: z.string().trim().min(1).max(50),
  piano: z.number().int().min(-10).max(200).default(0),
  numero: z.string().trim().max(20).optional(),
  tipo: z.enum(TIPI_UNITA).default('appartamento'),
  metratura: z.number().min(0).max(10_000).optional(),
  vani: z.number().int().min(0).max(100).optional(),
  descrizione: z.string().trim().max(500).optional(),
  attiva: z.boolean().default(true),
  note: z.string().trim().max(2000).optional(),
});

export const unitaUpdateSchema = unitaCreateSchema.partial();

// ---------- Quote millesimali ----------
export const tabellaSchema = z.object({
  delibera: z.string().trim().max(200).optional(),
  dataDelibera: z.coerce.date().optional(),
  righe: z
    .array(
      z.object({
        unitaId: objectId,
        quote: z.object(
          Object.fromEntries(RIPARTIZIONI.map((r) => [r, z.number().min(0).max(1000).optional()])) as Record<
            (typeof RIPARTIZIONI)[number],
            z.ZodOptional<z.ZodNumber>
          >,
        ),
      }),
    )
    .min(1, 'Servono almeno una riga'),
});

export const revisioneParams = z.object({
  condominioId: objectId,
  revisione: z.coerce.number().int().min(1),
});

// ---------- Condòmini ----------
export const condominoCreateSchema = z.object({
  utente: objectId.optional(),
  email: z.string().email().toLowerCase().trim().optional(),
  nome: z.string().trim().min(1).max(80).optional(),
  cognome: z.string().trim().min(1).max(80).optional(),
  telefono: z.string().trim().max(30).optional(),
  passwordProvvisoria: z.string().min(8).optional(),
  unita: z.array(objectId).min(1, 'Seleziona almeno un’unità immobiliare'),
  regime: z.enum(REGIMES).default('proprietario'),
  quota: z.number().min(0).max(100).default(100),
  primario: z.boolean().default(true),
  dataInizio: z.coerce.date().optional(),
  note: z.string().trim().max(2000).optional(),
}).refine((d) => d.utente || d.email, {
  message: 'Indica un utente esistente oppure un’email per creare il condòmino',
  path: ['utente'],
});

export const condominoUpdateSchema = z.object({
  unita: z.array(objectId).min(1).optional(),
  regime: z.enum(REGIMES).optional(),
  quota: z.number().min(0).max(100).optional(),
  primario: z.boolean().optional(),
  dataFine: z.coerce.date().nullable().optional(),
  attivo: z.boolean().optional(),
  note: z.string().trim().max(2000).optional(),
});

// ---------- Assemblee ----------
export const assembleaCreateSchema = z.object({
  tipo: z.enum(TIPI_ASSEMBLEA).default('ordinaria'),
  data: z.coerce.date(),
  oraInizio: z.string().trim().max(10).optional(),
  luogo: z.string().trim().min(1).max(300),
  secondaConvocazione: z.boolean().default(false),
  quattordiciGgiorni: z.boolean().default(false),
  presiedutaDa: objectId.optional(),
  segretario: objectId.optional(),
  ordineDelGiorno: z
    .array(
      z.object({
        ordine: z.number().int().min(1),
        titolo: z.string().trim().min(1).max(300),
        descrizione: z.string().trim().max(4000).optional(),
        // La delibera arriva già scritta quando il punto viene da un modello:
        // senza questi due campi Zod li scarterebbe in silenzio e la convocazione
        // perderebbe il testo da cui il verbale ricaverà le cifre del bilancio.
        delibera: z.string().trim().max(10_000).optional(),
        bilancio: objectId.optional(),
        riservata: z.boolean().default(false),
      }),
    )
    .default([]),
  note: z.string().trim().max(4000).optional(),
});

export const assembleaUpdateSchema = z.object({
  tipo: z.enum(TIPI_ASSEMBLEA).optional(),
  stato: z.enum(STATI_ASSEMBLEA).optional(),
  data: z.coerce.date().optional(),
  oraInizio: z.string().trim().max(10).optional(),
  oraChiusura: z.string().trim().max(10).optional(),
  luogo: z.string().trim().min(1).max(300).optional(),
  secondaConvocazione: z.boolean().optional(),
  quattordiciGgiorni: z.boolean().optional(),
  presiedutaDa: objectId.nullable().optional(),
  segretario: objectId.nullable().optional(),
  ordineDelGiorno: z
    .array(
      z.object({
        ordine: z.number().int().min(1),
        titolo: z.string().trim().min(1).max(300),
        descrizione: z.string().trim().max(4000).optional(),
        delibera: z.string().trim().max(10_000).optional(),
        riservata: z.boolean().default(false),
        bilancio: objectId.optional(),
        allegati: z
          .array(z.object({ nome: z.string().trim(), url: z.string().trim(), tipo: z.string().optional(), size: z.number().optional() }))
          .default([]),
      }),
    )
    .optional(),
  note: z.string().trim().max(4000).optional(),
});

export const statoAssembleaSchema = z.object({ stato: z.enum(STATI_ASSEMBLEA) });

export const verbaleTestoSchema = z.object({ testo: z.string().max(200_000) });

export const approvaSchema = z.object({ approvato: z.boolean() });

export const deliberaParams = z.object({
  condominioId: objectId,
  id: objectId,
  ordine: z.coerce.number().int().min(1),
});

export const presenzeSchema = z.object({
  presenze: z.array(
    z.object({
      condomino: objectId,
      presente: z.boolean().default(false),
      delegaA: objectId.nullable().optional(),
      motivazioneAstenuto: z.string().trim().max(500).optional(),
      note: z.string().trim().max(500).optional(),
    }),
  ),
});

export const votazioniSchema = z.object({
  votazioni: z.array(
    z.object({
      ordine: z.number().int().min(1),
      esito: z.enum(['approvato', 'respinto', 'rinviato', 'dibattuto']).nullable().default(null),
      votiFavorevoli: z.number().min(0).default(0),
      votiContrari: z.number().min(0).default(0),
      astenuti: z.number().min(0).default(0),
      segreta: z.boolean().default(false),
      motivoRinvio: z.string().trim().max(500).optional(),
    }),
  ),
});

export const deliberaSchema = z.object({
  ordine: z.number().int().min(1),
  delibera: z.string().trim().min(1).max(10_000),
});

export const convocazioneSchema = z.object({
  condomini: z.array(objectId).min(1, 'Seleziona almeno un destinatario'),
  inviaEmail: z.boolean().default(false),
  allegati: z.array(z.object({ nome: z.string(), url: z.string(), tipo: z.string().optional(), size: z.number().optional() })).default([]),
});

// ---------- Bilancio ----------
/** Anno cui riferire i modelli di punto all'ordine. */
export const modelliOrdineQuery = z.object({
  anno: z.coerce.number().int().min(2000).max(2100),
});

/** Una voce di spesa, riusata sia nel corpo completo sia nelle rotte singole. */
export const voceBilancioSchema = z.object({
  categoria: z.enum(CATEGORIE_BILANCIO).default('altro'),
  descrizione: z.string().trim().min(1).max(300),
  importo: z.number().min(0),
  previsto: z.number().min(0).optional(),
  ripartizione: z.enum(RIPARTIZIONI_BILANCIO).default('diritto'),
  valorePerMillesimo: z.number().min(0).optional(),
  voci: z
    .array(
      z.object({
        fornitore: z.string().trim().max(200).optional(),
        fattura: z.string().trim().max(100).optional(),
        data: z.coerce.date().optional(),
        importo: z.number().min(0).optional(),
        pagato: z.boolean().default(false),
      }),
    )
    .default([]),
});

export const bilancioCreateSchema = z.object({
  anno: z.number().int().min(2000).max(2100),
  tipo: z.enum(TIPI_BILANCIO).default('preventivo'),
  descrizione: z.string().trim().max(500).optional(),
  deliberaAssemblea: objectId.optional(),
  note: z.string().trim().max(4000).optional(),
  voci: z.array(voceBilancioSchema).default([]),
});

export const bilancioUpdateSchema = bilancioCreateSchema.partial().omit({ anno: true, tipo: true });

/**
 * Voce singola: `descrizione` e `importo` obbligatori in creazione, tutti i campi
 * facoltativi in modifica. Senza `.partial()` una modifica dovrebbe rimandare
 * l'intera voce, e ogni correzione a un importo perderebbe le fatture.
 */
export const voceBilancioCreateSchema = voceBilancioSchema.pick({
  categoria: true,
  descrizione: true,
  importo: true,
  ripartizione: true,
  valorePerMillesimo: true,
  previsto: true,
});

export const voceBilancioUpdateSchema = voceBilancioCreateSchema.partial();

/** Identifica una voce dentro un bilancio: l'id è quello del subdocumento. */
export const bilancioVoceParams = z.object({
  condominioId: objectId,
  id: objectId,
  voceId: objectId,
});

// ---------- Versamenti ----------
export const periodoSchema = z.object({
  anno: z.coerce.number().int().min(2000).max(2100),
  mese: z.coerce.number().int().min(1).max(12),
});

export const versamentoCreateSchema = z.object({
  unita: objectId,
  condomino: objectId.optional(),
  periodo: periodoSchema,
  importo: z.number().positive('L’importo deve essere positivo'),
  dataVersamento: z.coerce.date(),
  dataValuta: z.coerce.date().optional(),
  metodo: z.enum(METODI_PAGAMENTO).default('bonifico'),
  causale: z.string().trim().max(500).optional(),
  identificativoTransazione: z.string().trim().max(200).optional(),
  note: z.string().trim().max(2000).optional(),
  allegato: z.object({ nome: z.string(), url: z.string(), tipo: z.string().optional(), size: z.number().optional() }).optional(),
});


export const versamentoUpdateSchema = versamentoCreateSchema.partial().omit({ unita: true, periodo: true });

// ---------- Comunicazioni ----------
export const comunicazioneCreateSchema = z.object({
  tipo: z.enum(TIPI_COMUNICAZIONE).default('avviso'),
  oggetto: z.string().trim().min(1).max(300),
  corpo: z.string().trim().max(50_000).default(''),
  destinatario: objectId.optional(),
  destinatari: z.array(objectId).default([]),
  unita: z.array(objectId).default([]),
  assemblea: objectId.optional(),
  rispostaA: objectId.optional(),
  richiedeRisposta: z.boolean().default(false),
  allegati: z.array(z.object({ nome: z.string(), url: z.string(), tipo: z.string().optional(), size: z.number().optional() })).default([]),
  salvaComeBozza: z.boolean().default(false),
});

export const rispostaSchema = z.object({
  corpo: z.string().trim().min(1).max(50_000),
  allegati: z.array(z.object({ nome: z.string(), url: z.string(), tipo: z.string().optional(), size: z.number().optional() })).default([]),
});

// ---------- Amministrazione e ruoli ----------

/** Elenco di permessi: validato come lista di stringhe, i valori sono controllati nel controller. */
const listaPermessi = z.array(z.string().max(40));

export const listaStaffQuery = paginationQuery.extend({
  search: z.string().trim().max(200).optional(),
  sort: z.string().trim().max(40).default('cognome'),
});

export const creaAmministratoreSchema = z.object({
  email: z.string().email('Email non valida').toLowerCase().trim(),
  nome: z.string().trim().min(1).max(80),
  cognome: z.string().trim().min(1).max(80),
  telefono: z.string().trim().max(30).optional(),
  password: z
    .string()
    .min(10, 'La password deve avere almeno 10 caratteri')
    .regex(/[a-z]/, 'La password deve contenere una lettera minuscola')
    .regex(/[A-Z]/, 'La password deve contenere una lettera maiuscola')
    .regex(/\d/, 'La password deve contenere una cifra'),
});

export const aggiornaAmministratoreSchema = z.object({
  nome: z.string().trim().min(1).max(80).optional(),
  cognome: z.string().trim().min(1).max(80).optional(),
  telefono: z.string().trim().max(30).nullable().optional(),
  attivo: z.boolean().optional(),
  permessi: listaPermessi.optional(),
});

export const creaAssistenteSchema = z.object({
  email: z.string().email('Email non valida').toLowerCase().trim(),
  nome: z.string().trim().min(1).max(80).optional(),
  cognome: z.string().trim().min(1).max(80).optional(),
  telefono: z.string().trim().max(30).optional(),
  password: z.string().min(10).optional(),
  permessi: listaPermessi,
}).refine((d) => !d.nome === !d.cognome, {
  message: 'Nome e cognome vanno indicati insieme',
  path: ['nome'],
});

export const aggiornaAssistenteSchema = z.object({
  nome: z.string().trim().min(1).max(80).optional(),
  cognome: z.string().trim().min(1).max(80).optional(),
  telefono: z.string().trim().max(30).nullable().optional(),
  attivo: z.boolean().optional(),
  permessi: listaPermessi.optional(),
});

// ---------- Contratti ----------

export const listaContrattiQuery = paginationQuery.extend({
  stato: z.enum(STATI_CONTRATTO).optional(),
  search: z.string().trim().max(200).optional(),
  sort: z.string().trim().max(40).default('dataScadenza'),
});

export const creaContrattoSchema = z.object({
  amministratore: objectId,
  unitaMassime: z.number().int().min(1, 'La capacità deve essere di almeno 1 unità').max(100_000),
  costo: z.number().min(0),
  periodicita: z.enum(PERIODICITA).default('annuale'),
  durataMesi: z.number().int().min(1).max(240),
  dataInizio: z.coerce.date(),
  mesiProroga: z.number().int().min(1).max(240).optional(),
  rinnovoAutomatico: z.boolean().default(false),
  note: z.string().trim().max(4000).optional(),
});

export const prorogaSchema = z.object({
  mesi: z.number().int().min(1).max(240).optional(),
  nuovaCapacita: z.number().int().min(1).max(100_000).optional(),
  nota: z.string().trim().max(1000).optional(),
});

export const statoContrattoSchema = z.object({
  azione: z.enum(['sospendi', 'riattiva']),
  motivo: z.string().trim().max(1000).optional(),
});

export const cessazioneSchema = z.object({
  motivo: z.string().trim().max(1000).optional(),
});

export const pagamentoRataSchema = z.object({
  dataPagamento: z.coerce.date().optional(),
  metodo: z.enum(METODI_PAGAMENTO).default('bonifico'),
  identificativoTransazione: z.string().trim().max(200).optional(),
  quietanza: z.string().trim().max(200).optional(),
  note: z.string().trim().max(2000).optional(),
});

export const messaggioPiattaformaSchema = z.object({
  destinatario: objectId,
  contratto: objectId.optional(),
  tipo: z.enum(TIPI_MESSAGGIO).default('info'),
  oggetto: z.string().trim().min(1).max(300),
  corpo: z.string().trim().max(50_000).default(''),
});
