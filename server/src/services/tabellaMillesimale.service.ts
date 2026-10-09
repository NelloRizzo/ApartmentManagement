import { Types } from 'mongoose';
import { QuotaMillesimale, Unita, Condominio } from '../models/index.js';
import { RIPARTIZIONI, type Ripartizione } from '../types/domain.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { auditLog } from './audit.service.js';

export interface RigaTabella {
  unitaId: string;
  codice: string;
  piano: number;
  tipo: string;
  metratura?: number;
  quote: Record<Ripartizione, number>;
  totale: number;
}

export interface TabellaMillesimale {
  condominioId: string;
  revisione: number;
  /** Somme per ripartizione, limitate a quelle effettivamente in uso. */
  totale: Partial<Record<Ripartizione, number>>;
  /** Ripartizioni presenti in questa revisione: solo queste devono fare 1000. */
  ripartizioniAttive: Ripartizione[];
  valida: boolean;
  /** Ripartizioni la cui somma non è 1000. */
  problemi: { ripartizione: Ripartizione; totale: number; scarto: number }[];
  righe: RigaTabella[];
  delibera?: string;
  dataDelibera?: string;
  generataIl: string;
}

const emptyQuote = (): Record<Ripartizione, number> =>
  RIPARTIZIONI.reduce((acc, r) => ({ ...acc, [r]: 0 }), {} as Record<Ripartizione, number>);

export async function getRevisioneAttiva(condominioId: string): Promise<number> {
  const max = await QuotaMillesimale.findOne({ condominio: condominioId })
    .sort({ revisione: -1 })
    .select('revisione')
    .lean();
  return max?.revisione ?? 0;
}

export async function buildTabella(
  condominioId: string,
  revisione?: number,
): Promise<TabellaMillesimale> {
  const rev = revisione ?? (await getRevisioneAttiva(condominioId));

  const [unita, quote, condominio] = await Promise.all([
    Unita.find({ condominio: condominioId, attiva: true }).lean(),
    rev
      ? QuotaMillesimale.find({ condominio: condominioId, revisione: rev }).lean()
      : Promise.resolve([]),
    Condominio.findById(condominioId).lean(),
  ]);

  if (!condominio) throw notFound('Condominio non trovato');

  const byUnita = new Map<string, Record<Ripartizione, number>>();
  const attive = new Set<Ripartizione>();
  for (const q of quote) {
    const key = String(q.unita);
    const row = byUnita.get(key) ?? emptyQuote();
    row[q.ripartizione] = q.valore;
    byUnita.set(key, row);
    attive.add(q.ripartizione);
  }

  const righe: RigaTabella[] = unita.map((u) => {
    const quoteRiga = byUnita.get(String(u._id)) ?? emptyQuote();
    return {
      unitaId: String(u._id),
      codice: u.codice,
      piano: u.piano,
      tipo: u.tipo,
      metratura: u.metratura,
      quote: quoteRiga,
      totale: [...attive].reduce((sum, r) => sum + (quoteRiga[r] ?? 0), 0),
    };
  });

  const ripartizioniAttive = RIPARTIZIONI.filter((r) => attive.has(r));
  const totale: Partial<Record<Ripartizione, number>> = {};
  for (const r of ripartizioniAttive) {
    totale[r] = righe.reduce((s, row) => s + (row.quote[r] ?? 0), 0);
  }

  const problemi = analizzaSomme(totale, ripartizioniAttive);

  return {
    condominioId,
    revisione: rev,
    totale,
    ripartizioniAttive,
    // Una tabella senza nessuna quota non è una tabella valida: senza righe
    // `ripartizioniAttive` è vuota, `analizzaSomme` non ha nulla da confrontare
    // e restituirebbe `valida: true` su un totale inesistente. La ripartizione
    // di diritto è la base di ogni quota, quindi è quella che si assume lo scarto.
    valida: ripartizioniAttive.length > 0 && problemi.length === 0,
    problemi: ripartizioniAttive.length === 0 ? [{ ripartizione: 'diritto', totale: 0, scarto: -1000 }] : problemi,
    righe,
    delibera: condominio.deliberaRipartizione,
    dataDelibera: condominio.dataDeliberaRipartizione?.toISOString(),
    generataIl: new Date().toISOString(),
  };
}

/**
 * Una ripartizione è valida solo se somma esattamente 1000. Le ripartizioni
 * introdotte ma azzerate (per esempio "ascensore" in un edificio senza
 * ascensore) sono ammesse: non incidono su nessuna spesa reale.
 */
export function analizzaSomme(
  totale: Partial<Record<Ripartizione, number>>,
  attive: Ripartizione[],
): { ripartizione: Ripartizione; totale: number; scarto: number }[] {
  return attive
    .map((r) => ({ ripartizione: r, totale: totale[r] ?? 0 }))
    .filter(({ totale: t }) => t > 0 && Math.abs(t - 1000) > 0.0001)
    .map(({ ripartizione, totale: t }) => ({
      ripartizione,
      totale: t,
      scarto: Number((t - 1000).toFixed(4)),
    }));
}

export function isTabellaValida(
  totale: Partial<Record<Ripartizione, number>>,
  attive: Ripartizione[],
): boolean {
  return analizzaSomme(totale, attive).length === 0;
}

export interface RigaMillesimaleInput {
  unitaId: string;
  quote: Partial<Record<Ripartizione, number>>;
}

/**
 * Crea una nuova revisione della tabella millesimali.
 * Le quote precedenti vengono chiuse a `validFrom` e la nuova revisione parte da zero.
 * Rifiuta la revisione se le somme per ripartizione non fanno 1000.
 */
export async function nuovaRevisione(
  condominioId: string,
  righe: RigaMillesimaleInput[],
  opzioni: { delibera?: string; dataDelibera?: Date; attoreId?: string; forzaSenzaDelibera?: boolean } = {},
): Promise<TabellaMillesimale> {
  const condominio = await Condominio.findById(condominioId);
  if (!condominio) throw notFound('Condominio non trovato');

  const unitaEsistenti = await Unita.find({ condominio: condominioId }).select('_id attiva').lean();
  const validi = unitaEsistenti.filter((u) => u.attiva);
  const idsValidi = new Set(validi.map((u) => String(u._id)));

  const unknown = righe.filter((r) => !idsValidi.has(String(r.unitaId)));
  if (unknown.length > 0) {
    throw badRequest('Righe riferite a unità inesistenti o non attive', unknown.map((r) => r.unitaId));
  }

  const mancanti = validi.filter((u) => !righe.some((r) => String(r.unitaId) === String(u._id)));
  if (mancanti.length > 0) {
    throw badRequest('Devono essere specificate tutte le unità attive del condominio', {
      unitaMancanti: mancanti.map((u) => u.codice),
    });
  }

  const attive = new Set<Ripartizione>();
  const totale: Partial<Record<Ripartizione, number>> = {};
  for (const riga of righe) {
    for (const rip of RIPARTIZIONI) {
      const v = riga.quote[rip];
      if (v === undefined || v === null) continue;
      if (v < 0 || v > 1000) {
        throw badRequest(`Quota non valida per la ripartizione "${rip}": deve essere tra 0 e 1000`);
      }
      attive.add(rip);
      totale[rip] = (totale[rip] ?? 0) + v;
    }
  }

  const ripartizioniAttive = RIPARTIZIONI.filter((r) => attive.has(r));
  const problemi = analizzaSomme(totale, ripartizioniAttive);
  if (problemi.length > 0) {
    throw conflict('La somma delle quote per ripartizione deve essere esattamente 1000 millesimi', {
      problemi,
      atteso: 1000,
    });
  }

  const revisione = (await getRevisioneAttiva(condominioId)) + 1;
  const now = new Date();

  const nuoviDocs = righe.flatMap((riga) =>
    RIPARTIZIONI.filter((rip) => riga.quote[rip] !== undefined).map((rip) => ({
      condominio: new Types.ObjectId(String(condominioId)),
      unita: new Types.ObjectId(String(riga.unitaId)),
      ripartizione: rip,
      valore: Number(riga.quote[rip] ?? 0),
      revisione,
      validFrom: now,
      validTo: null,
      delibera: opzioni.delibera,
      dataDelibera: opzioni.dataDelibera,
    })),
  );

  await QuotaMillesimale.updateMany(
    { condominio: condominioId, validTo: null },
    { $set: { validTo: now } },
  );
  await QuotaMillesimale.insertMany(nuoviDocs);

  condominio.deliberaRipartizione = opzioni.delibera ?? condominio.deliberaRipartizione;
  condominio.dataDeliberaRipartizione = opzioni.dataDelibera ?? condominio.dataDeliberaRipartizione;
  await condominio.save();

  await auditLog({
    condominio: condominioId,
    attore: opzioni.attoreId,
    azione: 'tabella_millesimale_nuova_revisione',
    entita: 'Condominio',
    entitaId: condominioId,
    dettagli: { revisione, totale },
  });

  return buildTabella(condominioId, revisione);
}

export async function storicoRevisioni(condominioId: string) {
  return QuotaMillesimale.aggregate([
    { $match: { condominio: new Types.ObjectId(String(condominioId)) } },
    {
      $group: {
        _id: '$revisione',
        dataDelibera: { $first: '$dataDelibera' },
        delibera: { $first: '$delibera' },
        validFrom: { $min: '$validFrom' },
        validTo: { $max: '$validTo' },
        totaleDiritto: { $sum: { $cond: [{ $eq: ['$ripartizione', 'diritto'] }, '$valore', 0] } },
      },
    },
    { $sort: { _id: -1 } },
    { $project: { _id: 0, revisione: '$_id', delibera: 1, dataDelibera: 1, validFrom: 1, validTo: 1, totaleDiritto: 1 } },
  ]);
}

export interface VariazioneQuota {
  ripartizione: Ripartizione;
  /** Valore nella revisione precedente; `null` se la ripartizione non c'era. */
  da: number | null;
  /** Valore in questa revisione; `null` se la ripartizione non c'è più. */
  a: number | null;
}

export interface UnitaVariazione {
  unitaId: string;
  codice: string;
}

export interface VariazioneUnita extends UnitaVariazione {
  quote: VariazioneQuota[];
}

export interface RevisioneConVariazioni {
  revisione: number;
  delibera?: string;
  dataDelibera?: string;
  validFrom: string;
  validTo: string | null;
  totaleDiritto: number;
  /** Unità presenti in questa revisione e non nella precedente. */
  entrate: UnitaVariazione[];
  /** Unità presenti nella precedente e non in questa. */
  uscite: UnitaVariazione[];
  /** Unità presenti in entrambe, ma con almeno una quota diversa. */
  variazioni: VariazioneUnita[];
}

/** Una revisione pronta per il confronto: solo le ripartizioni davvero presenti. */
export interface RevisioneQuote {
  revisione: number;
  validFrom: string;
  validTo: string | null;
  delibera?: string;
  dataDelibera?: string;
  totaleDiritto: number;
  quote: Map<string, Partial<Record<Ripartizione, number>>>;
}

/**
 * Confronta revisioni consecutive e racconta cosa è cambiato. La prima revisione
 * non ha nulla con cui confrontarsi, quindi le sue unità finiscono tutte fra le
 * `entrate`: è l'istituzione della tabella, non un passaggio di consegne.
 *
 * Una ripartizione assente vale `null`, non zero: una ripartizione introdotta
 * ma azzerata resta una decisione (l'edificio senza ascensore non introduce la
 * voce), e confonderla con lo zero la nasconderebbe.
 */
export function variazioniTraRevisioni(
  revisioni: RevisioneQuote[],
  codici: Map<string, string>,
): RevisioneConVariazioni[] {
  const ordinate = [...revisioni].sort((a, b) => a.revisione - b.revisione);
  const codiceDi = (unitaId: string) => codici.get(unitaId) ?? unitaId;
  const perCodice = (a: UnitaVariazione, b: UnitaVariazione) => a.codice.localeCompare(b.codice, 'it');

  const risultato = ordinate.map((cur, i) => {
    const prev = i > 0 ? ordinate[i - 1]! : null;
    const entrate: UnitaVariazione[] = [];
    const uscite: UnitaVariazione[] = [];
    const variazioni: VariazioneUnita[] = [];

    if (!prev) {
      for (const unitaId of cur.quote.keys()) entrate.push({ unitaId, codice: codiceDi(unitaId) });
    } else {
      const ids = new Set([...prev.quote.keys(), ...cur.quote.keys()]);
      for (const unitaId of ids) {
        const prima = prev.quote.get(unitaId);
        const dopo = cur.quote.get(unitaId);
        if (!prima) {
          entrate.push({ unitaId, codice: codiceDi(unitaId) });
          continue;
        }
        if (!dopo) {
          uscite.push({ unitaId, codice: codiceDi(unitaId) });
          continue;
        }
        const quote: VariazioneQuota[] = [];
        for (const ripartizione of RIPARTIZIONI) {
          const da = prima[ripartizione] ?? null;
          const a = dopo[ripartizione] ?? null;
          if (da !== a) quote.push({ ripartizione, da, a });
        }
        if (quote.length > 0) variazioni.push({ unitaId, codice: codiceDi(unitaId), quote });
      }
    }

    entrate.sort(perCodice);
    uscite.sort(perCodice);
    variazioni.sort(perCodice);

    return {
      revisione: cur.revisione,
      delibera: cur.delibera,
      dataDelibera: cur.dataDelibera,
      validFrom: cur.validFrom,
      validTo: cur.validTo,
      totaleDiritto: cur.totaleDiritto,
      entrate,
      uscite,
      variazioni,
    };
  });

  // Dalla più recente alla più vecchia, come lo storico delle revisioni.
  return risultato.reverse();
}

/** Storico delle revisioni con, per ognuna, le variazioni rispetto alla precedente. */
export async function variazioniRevisioni(condominioId: string): Promise<RevisioneConVariazioni[]> {
  const [quote, unita] = await Promise.all([
    QuotaMillesimale.find({ condominio: condominioId }).lean(),
    Unita.find({ condominio: condominioId }).select('codice').lean(),
  ]);

  const codici = new Map(unita.map((u) => [String(u._id), u.codice]));
  const perRevisione = new Map<number, RevisioneQuote>();

  for (const q of quote) {
    let rev = perRevisione.get(q.revisione);
    if (!rev) {
      rev = {
        revisione: q.revisione,
        validFrom: q.validFrom.toISOString(),
        validTo: q.validTo?.toISOString() ?? null,
        delibera: q.delibera,
        dataDelibera: q.dataDelibera?.toISOString(),
        totaleDiritto: 0,
        quote: new Map(),
      };
      perRevisione.set(q.revisione, rev);
    }
    if (q.validFrom.toISOString() < rev.validFrom) rev.validFrom = q.validFrom.toISOString();
    const validTo = q.validTo?.toISOString() ?? null;
    if (validTo && (!rev.validTo || validTo > rev.validTo)) rev.validTo = validTo;
    if (!rev.delibera && q.delibera) rev.delibera = q.delibera;
    if (!rev.dataDelibera && q.dataDelibera) rev.dataDelibera = q.dataDelibera.toISOString();
    if (q.ripartizione === 'diritto') rev.totaleDiritto += q.valore;
    const riga = rev.quote.get(String(q.unita)) ?? {};
    riga[q.ripartizione] = q.valore;
    rev.quote.set(String(q.unita), riga);
  }

  return variazioniTraRevisioni([...perRevisione.values()], codici);
}

/** Quote millesimali valide per una data specifica (default oggi). */
export async function quoteAllaData(condominioId: string, data: Date = new Date()) {
  return QuotaMillesimale.find({
    condominio: condominioId,
    validFrom: { $lte: data },
    $or: [{ validTo: null }, { validTo: { $gt: data } }],
  }).lean();
}

/** Quote per unità di una revisione, indicizzate per unitaId. */
export async function quotaPerUnita(
  condominioId: string,
  revisione: number,
): Promise<Map<string, Record<Ripartizione, number>>> {
  const docs = await QuotaMillesimale.find({ condominio: condominioId, revisione }).lean();
  const map = new Map<string, Record<Ripartizione, number>>();
  for (const d of docs) {
    const key = String(d.unita);
    const row = map.get(key) ?? emptyQuote();
    row[d.ripartizione] = d.valore;
    map.set(key, row);
  }
  return map;
}

/** Quote di un'unità alla revisione richiesta (default: attiva). */
export async function quotaDiUnita(
  condominioId: string,
  unitaId: string,
  revisione?: number,
): Promise<Record<Ripartizione, number>> {
  const rev = revisione ?? (await getRevisioneAttiva(condominioId));
  const docs = await QuotaMillesimale.find({ condominio: condominioId, unita: unitaId, revisione: rev }).lean();
  const row = emptyQuote();
  for (const d of docs) row[d.ripartizione] = d.valore;
  return row;
}
