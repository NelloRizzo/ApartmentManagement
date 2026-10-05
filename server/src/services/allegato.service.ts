import crypto from 'node:crypto';
import { Types } from 'mongoose';
import { config } from '../config/index.js';
import { Allegato, type AllegatoDoc } from '../models/index.js';
import { badRequest, notFound } from '../utils/errors.js';

/**
 * Allegati conservati in MongoDB, serviti dall'API con firma a tempo.
 *
 * La firma serve perché un `<img src>` non può portare l'intestazione
 * `Authorization`: senza, servirebbe un cookie accessibile a ogni pagina, che è
 * esattamente ciò che l'applicazione evita di fare. Un link firmato è il modo
 * usuale per allegati protetti, ed è lo stesso principio delle URL prefissate di
 * uno storage a oggetti.
 *
 * I documenti che ospitano i file ne conservano **solo l'id**: i metadati si
 * leggono da qui a ogni richiesta. È la conseguenza diretta del fatto che
 * l'URL firmato vale 24 ore: se il documento tenesse l'URL, il link stampato
 * scaderebbe da solo e il file diventerebbe irraggiungibile.
 */

/** Ore per cui un link di allegato resta valido. */
const VALIDITA_ORE = 24;

/**
 * Segreto derivato, non una variabile in più: l'integrità del link non merita
 * una chiave separata da gestire, e il segreto JWT è già rotazionato e segreto.
 */
function segreto(): Buffer {
  return crypto.createHash('sha256').update(`${config.jwt.accessSecret}:allegati`).digest();
}

function firma(id: string, scadenza: number): string {
  return crypto.createHmac('sha256', segreto()).update(`${id}.${scadenza}`).digest('hex');
}

/**
 * URL dell'allegato.
 *
 * Con `URL_API` configurato l'URL è assoluto: in produzione frontend e API
 * hanno origini diverse, quindi un percorso relativo verrebbe risolto sul sito
 * statico e non troverebbe nulla. In sviluppo resta relativo e passa dal proxy
 * di Vite.
 */
export function urlAllegato(id: string, scadenza: number): string {
  const percorso = `/allegati/${id}?t=${scadenza}&s=${firma(id, scadenza)}`;
  return config.urlApi ? `${config.urlApi.replace(/\/$/, '')}${percorso}` : percorso;
}

/** Come un allegato compare nelle risposte dell'API. */
export interface AllegatoDescriptor {
  id: string;
  nome: string;
  oggetto: string;
  descrizione: string;
  fonte: string | null;
  riferimento: string | null;
  tipo: string;
  size: number;
  /** Firmato adesso, quindi valido per le prossime 24 ore. */
  url: string;
  createdAt: Date;
}

export interface NuovoAllegato {
  nome: string;
  oggetto: string;
  descrizione?: string;
  fonte?: string;
  riferimento?: string;
  tipo: string;
  dati: Buffer;
  size: number;
  mittente: string;
  condominio: string;
}

/**
 * Salva il file e restituisce l'id da mettere nel documento che lo referenzia.
 *
 * `scadenza` è lasciata a Mongo: un file appena caricato ma mai agganciato a un
 * documento viene cancellato da solo dopo 24 ore, così chi carica e poi abbandona
 * il modulo non lascia spazzatura.
 */
export async function salvaAllegato(input: NuovoAllegato): Promise<string> {
  const doc = await Allegato.create({
    nome: input.nome,
    oggetto: input.oggetto,
    descrizione: input.descrizione ?? '',
    fonte: input.fonte || undefined,
    riferimento: input.riferimento || undefined,
    tipo: input.tipo,
    size: input.size,
    dati: input.dati,
    mittente: input.mittente,
    condominio: input.condominio,
    scadenza: new Date(Date.now() + VALIDITA_ORE * 3_600_000),
  });

  return String(doc._id);
}

function descrittore(doc: AllegatoDoc): AllegatoDescriptor {
  return {
    id: String(doc._id),
    nome: doc.nome,
    oggetto: doc.oggetto,
    descrizione: doc.descrizione,
    fonte: doc.fonte ?? null,
    riferimento: doc.riferimento ?? null,
    tipo: doc.tipo,
    size: doc.size,
    // Firma nuova a ogni lettura: il link dura 24 ore da adesso, non 24 ore dal
    // caricamento. È il motivo per cui il documento non conserva l'URL.
    url: rinnovaUrl(doc),
    createdAt: doc.createdAt,
  };
}

/** Firma nuova per lo stesso allegato. */
export function rinnovaUrl(doc: AllegatoDoc): string {
  const scadenza = Math.floor(Date.now() / 1000) + VALIDITA_ORE * 3_600;
  return urlAllegato(String(doc._id), scadenza);
}

/**
 * Risolve gli id di un documento nei descrittori da mandare al client.
 *
 * L'ordine è quello degli id, non quello restituito dal database: un allegato
 * spostato in coda non deve cambiare posto nella lista del documento che lo
 * contiene. Gli id inesistenti vengono scartati invece di far fallire la
 * richiesta: la pagina deve mostrare gli allegati presenti anche se uno è stato
 * cancellato per errore.
 */
export async function allegatiDescrittori(ids: unknown[] | undefined): Promise<AllegatoDescriptor[]> {
  const puliti = (ids ?? [])
    .map((i) => String(i))
    .filter((i) => /^[0-9a-fA-F]{24}$/.test(i));
  if (puliti.length === 0) return [];

  const documenti = await Allegato.find({ _id: { $in: puliti } }).lean<AllegatoDoc[]>();
  const perId = new Map(documenti.map((d) => [String(d._id), d]));

  return puliti
    .map((i) => perId.get(i))
    .filter((d): d is AllegatoDoc => d !== undefined)
    .map(descrittore);
}

/** Come sopra, per un singolo allegato: `null` se non c'è. */
export async function allegatoDescrittore(id: unknown): Promise<AllegatoDescriptor | null> {
  const [descrittore] = await allegatiDescrittori(id ? [id] : []);
  return descrittore ?? null;
}

/**
 * Documento come oggetto semplice, con dentro solo i campi dello schema.
 *
 * `{...documento}` su un documento Mongoose funziona solo per il `populate` e
 * non per `create()`, che espone anche `$__`, `activePaths` e `pathsToScopes`:
 * finiti in una risposta JSON sono rumore che il client non deve vedere, e
 * cambiano da una versione all'altra di Mongoose. `toObject` c'è sempre sui
 * documenti e non sui lean, quindi si controlla prima.
 */
function aOggetto<T>(documento: T): T {
  const d = documento as { toObject?: () => unknown };
  return typeof d?.toObject === 'function' ? (d.toObject() as T) : documento;
}

/**
 * Sostituisce gli id degli allegati con i descrittori, su un elenco di documenti.
 *
 * Tutti gli id di tutti i documenti si risolvono con **una sola query**: chiedere
 * gli allegati documento per documento sarebbe N+1 su ogni lista.
 *
 * Restituisce copie: modificare l'originale qui significherebbe scriverci dentro
 * un documento che l'applicazione sta ancora usando per altro.
 */
export async function espandiAllegati<T extends { allegati?: unknown }>(
  documenti: T[],
): Promise<Array<Omit<T, 'allegati'> & { allegati: AllegatoDescriptor[] }>> {
  const semplici = documenti.map(aOggetto);
  const tutti = semplici.flatMap((d) => (Array.isArray(d.allegati) ? d.allegati.map(String) : []));
  if (tutti.length === 0) {
    return semplici.map(
      (d) => ({ ...d, allegati: [] }) as Omit<T, 'allegati'> & { allegati: AllegatoDescriptor[] },
    );
  }

  const riepilogati = await Allegato.find({ _id: { $in: [...new Set(tutti)] } }).lean<AllegatoDoc[]>();
  const perId = new Map(riepilogati.map((d) => [String(d._id), d]));

  return semplici.map((d) => {
    const propri = Array.isArray(d.allegati) ? d.allegati.map(String) : [];
    return {
      ...d,
      allegati: propri
        .map((i) => perId.get(i))
        .filter((x): x is AllegatoDoc => x !== undefined)
        .map(descrittore),
    } as Omit<T, 'allegati'> & { allegati: AllegatoDescriptor[] };
  });
}

/** Come sopra per un documento solo. */
export async function espandiAllegato<T extends { allegati?: unknown }>(
  documento: T,
): Promise<Omit<T, 'allegati'> & { allegati: AllegatoDescriptor[] }> {
  const [primo] = await espandiAllegati([documento]);
  // La lista ha un solo elemento per costruzione: se fosse vuota, il chiamante
  // avrebbe già ricevuto un documento `undefined` da qualche parte.
  return primo as Omit<T, 'allegati'> & { allegati: AllegatoDescriptor[] };
}

/**
 * Rende permanenti gli allegati appena agganciati a un documento.
 *
 * Senza, l'indice TTL li cancellerebbe dopo 24 ore e il documento resterebbe con
 * un file sparito. Va chiamato quando il documento è definitivo: una bozza
 * abbandonata deve poter perdere i suoi file.
 */
export async function rendiPermanenti(ids: unknown[] | undefined): Promise<void> {
  const puliti = (ids ?? []).map(String).filter((i) => /^[0-9a-fA-F]{24}$/.test(i));
  if (puliti.length === 0) return;
  await Allegato.updateMany({ _id: { $in: puliti } }, { $unset: { scadenza: '' } });
}

/**
 * Cancella i file che non sono più referenziati da nessun documento.
 *
 * Va chiamata **dopo** che il documento è stato salvato senza di loro, non prima:
 * cancellando prima, un salvataggio fallito lascerebbe il documento con un id che
 * non porta più a nessun file.
 */
export async function eliminaSvincolati(ids: unknown[] | undefined): Promise<void> {
  const puliti = (ids ?? []).map(String).filter((i) => /^[0-9a-fA-F]{24}$/.test(i));
  if (puliti.length === 0) return;
  await Allegato.deleteMany({ _id: { $in: puliti } });
}
/**
 * Un modello che sa aggiornare se stesso.
 *
 * Gli allegati stanno su documenti di altri domini (bilanci, assemblee, verbali,
 * versamenti) e il service non li conosce: riceve il modello come parametro
 * invece di importarli uno per uno, che sarebbe un accoppiamento che non serve.
 */
interface Scrivibile {
  updateOne(
    filtro: Record<string, unknown>,
    aggiornamento: Record<string, unknown>,
    opzioni?: Record<string, unknown>,
  ): Promise<{ matchedCount: number; modifiedCount: number }>;
}

/**
 * Verifica la firma e restituisce l'allegato.
 *
 * Il confronto del timestamp usa costante di tempo: senza, un attaccante
 * potrebbe ricavare la firma corretta byte per byte.
 */
export async function allegatoDaUrl(id: string, scadenza: string, ricevuta: string): Promise<AllegatoDoc> {
  const quando = Number(scadenza);
  if (!Number.isFinite(quando) || !ricevuta) throw notFound('Allegato non trovato');

  const attesa = Buffer.from(firma(id, quando), 'utf8');
  const data = Buffer.from(ricevuta, 'utf8');
  if (data.length !== attesa.length || !crypto.timingSafeEqual(data, attesa)) {
    throw notFound('Allegato non trovato');
  }

  if (quando * 1000 < Date.now()) {
    throw badRequest("Il link dell'allegato è scaduto: ricarica la pagina per ottenere quello nuovo");
  }

  const doc = await Allegato.findById(id);
  if (!doc) throw notFound('Allegato non trovato');
  return doc;
}

/**
 * Aggiunge file a un campo `allegati`, su documento o su sotto-documento.
 *
 * Un solo posto per l'aggiunta e non uno per dominio, perché la differenza fra
 * bilancio e assemblea è solo il percorso nell'aggiornamento e il filtro
 * sull'array. La sequenza è la stessa, e se divergesse fra domini finirebbe che
 * uno dei due scaderebbe i file appena caricati.
 *
 * `percorso` è posizionale, `voci.$[v].allegati` appunto, e `arrayFilters` dice
 * quale elemento dell'array si sta toccando.
 */
export async function allegaA(
  modello: Scrivibile,
  filtro: Record<string, unknown>,
  percorso: string,
  nuoviId: string[],
  arrayFilters?: Record<string, unknown>[],
): Promise<number> {
  if (nuoviId.length === 0) return 0;

  const risultato = await modello.updateOne(
    filtro,
    { $push: { [percorso]: { $each: nuoviId.map((i) => new Types.ObjectId(i)) } } },
    arrayFilters ? { arrayFilters } : undefined,
  );

  if (risultato.matchedCount === 0) throw notFound('Elemento non trovato');

  // Solo dopo la scrittura: prima, un aggiornamento fallito lascerebbe dei file
  // senza tempo per essere recuperati.
  await rendiPermanenti(nuoviId);
  return risultato.modifiedCount;
}

/**
 * Toglie un file da un campo `allegati` e lo cancella.
 *
 * Il file viene cancellato **dopo** che il documento non lo referenzia più: il
 * contrario lascerebbe un documento con un id che non porta più a nessun file.
 */
export async function staccaDa(
  modello: Scrivibile,
  filtro: Record<string, unknown>,
  percorso: string,
  allegatoId: string,
  arrayFilters?: Record<string, unknown>[],
): Promise<void> {
  if (!/^[0-9a-fA-F]{24}$/.test(allegatoId)) throw badRequest("Identificativo di allegato non valido");

  const risultato = await modello.updateOne(
    filtro,
    { $pull: { [percorso]: new Types.ObjectId(allegatoId) } },
    arrayFilters ? { arrayFilters } : undefined,
  );

  if (risultato.matchedCount === 0) throw notFound('Elemento non trovato');

  await eliminaSvincolati([allegatoId]);
}

/**
 * Mette un file in un campo singolo, come l'allegato di un versamento.
 *
 * Non serve `$pull` perché il campo non è un array: sostituirlo significa che il
 * file precedente va cancellato, altrimenti resterebbe in database senza più
 * nessun documento che lo referenzi, e l'indice TTL non lo raccoglierebbe perché
 * gli è già stata tolta la scadenza.
 */
export async function allegaSingolo(
  modello: Scrivibile,
  filtro: Record<string, unknown>,
  campo: string,
  nuovoId: string,
): Promise<string | null> {
  if (!/^[0-9a-fA-F]{24}$/.test(nuovoId)) throw badRequest("Identificativo di allegato non valido");

  const risultato = await modello.updateOne(filtro, { $set: { [campo]: new Types.ObjectId(nuovoId) } });
  if (risultato.matchedCount === 0) throw notFound('Elemento non trovato');

  await rendiPermanenti([nuovoId]);
  return nuovoId;
}

/**
 * Toglie il file da un campo singolo e lo cancella.
 *
 * Il valore precedente viene letto prima: senza, non si saprebbe quale file
 * cancellare dopo averlo staccato.
 */
export async function staccaSingolo(
  modello: Scrivibile & {
    findOne(filtro: Record<string, unknown>): { lean(): Promise<Record<string, unknown> | null> };
  },
  filtro: Record<string, unknown>,
  campo: string,
): Promise<void> {
  const documento = (await modello.findOne(filtro).lean()) as Record<string, unknown> | null;
  if (!documento) throw notFound('Elemento non trovato');

  const risultato = await modello.updateOne(filtro, { $unset: { [campo]: '' } });
  if (risultato.matchedCount === 0) throw notFound('Elemento non trovato');

  const precedente = documento[campo];
  if (precedente) await eliminaSvincolati([precedente]);
}

/**
 * Come `espandiAllegati` per un documento con **un solo** allegato, come il
 * versamento: il campo è `allegato` e non un elenco.
 *
 * `null` quando non c'è, che è la forma con cui il modello dichiara il campo
 * assente, e non `[]`: un elenco vuoto su un campo singolo sarebbe ambiguo con
 * "non caricato".
 */
export async function espandiSingolo<T extends { allegato?: unknown }>(
  documento: T,
): Promise<Omit<T, 'allegato'> & { allegato: AllegatoDescriptor | null }> {
const semplice = aOggetto(documento);
const grezzo = semplice.allegato;
  // Il campo può non essere un id: un documento scritto quando `allegato` era un
  // oggetto inline, o un valore corrotto a mano. `findById` su un valore che non è
  // un id solleva un errore di cast e fa fallire l'intera lista, per un allegato
  // che tanto non esiste: meglio `null`.
  if (grezzo === undefined || grezzo === null || !/^[0-9a-fA-F]{24}$/.test(String(grezzo))) {
    return { ...semplice, allegato: null };
  }

  const trovato = await Allegato.findById(String(grezzo)).lean<AllegatoDoc>();
  return { ...semplice, allegato: trovato ? descrittore(trovato) : null };
}

/**
 * Risolve gli allegati annidati dentro un array: le voci di un bilancio, i punti
 * all'ordine del giorno di un'assemblea.
 *
 * Va chiamata su documenti che hanno **già** passato `espandiAllegati`: i due
 * livelli si sommano e nessuno dei due file va perso.
 */
export async function espandiAnnidati<T extends object>(
  documenti: T[],
  chiave: string,
): Promise<T[]> {
  const raccogli = (d: T): string[] => {
    const elenco = (d as Record<string, unknown>)[chiave];
    if (!Array.isArray(elenco)) return [];
    return elenco.flatMap((e) =>
      Array.isArray((e as { allegati?: unknown[] })?.allegati)
        ? ((e as { allegati: unknown[] }).allegati).map(String)
        : [],
    );
  };

  const raccolti = documenti.flatMap(raccogli);
  if (raccolti.length === 0) return documenti;

  const riepilogati = await Allegato.find({ _id: { $in: [...new Set(raccolti)] } }).lean<AllegatoDoc[]>();
  const perId = new Map(riepilogati.map((d) => [String(d._id), d]));

  return documenti.map((d) => {
    const elenco = (d as Record<string, unknown>)[chiave];
    if (!Array.isArray(elenco)) return d;
    return {
      ...d,
      [chiave]: elenco.map((e: { allegati?: unknown[] }) => ({
        ...e,
        allegati: (e.allegati ?? [])
          .map(String)
          .map((i) => perId.get(i))
          .filter((x): x is AllegatoDoc => x !== undefined)
          .map(descrittore),
      })),
    };
  });
}