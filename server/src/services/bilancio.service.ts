import { Types } from 'mongoose';
import { Bilancio, type BilancioDoc, type VoceBilancio } from '../models/index.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import type { CategoriaBilancio, RipartizioneBilancio } from '../types/domain.js';

export const oid = (v: string): Types.ObjectId => new Types.ObjectId(String(v));

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Somme gli importi delle voci. Gli importi sono già arrotondati a due decimali. */
export function totalizza(voci: { importo: number }[]): number {
  return round2(voci.reduce((s, v) => s + v.importo, 0));
}

/** Carica un bilancio verificando che appartenga al condominio della rotta. */
export async function getBilancioOrThrow(condominioId: string, bilancioId: string): Promise<BilancioDoc> {
  const bilancio = await Bilancio.findOne({ _id: bilancioId, condominio: condominioId }).lean<BilancioDoc>();
  if (!bilancio) throw notFound('Bilancio non trovato');
  return bilancio;
}

/**
 * Un bilancio approvato non si tocca più.
 *
 * L'approvazione è il momento in cui l'assemblea ratifica le cifre: dopo, ogni
 * modifica renderebbe discordanti il verbale già approvato e le quote mostrate
 * ai condòmini.
 */
function assicuraModificabile(bilancio: BilancioDoc): void {
  if (bilancio.approvato) {
    throw conflict(
      `Il bilancio ${bilancio.tipo} ${bilancio.anno} è approvato: non è più modificabile. Per correggerlo, togli prima l'approvazione.`,
    );
  }
}

/**
 * Come `getBilancioOrThrow` ma chiede che il bilancio sia ancora modificabile.
 *
 * Vale anche per gli allegati: un documento che l'assemblea ha approvato non è più
 * modificabile, quindi aggiungerci un file significherebbe cambiarne il contenuto
 * dopo la ratifica, che è proprio ciò che l'approvazione vuole impedire.
 */
export async function getBilancioModificabile(
  condominioId: string,
  bilancioId: string,
): Promise<BilancioDoc> {
  const bilancio = await getBilancioOrThrow(condominioId, bilancioId);
  assicuraModificabile(bilancio);
  return bilancio;
}

/** Indice della voce dentro l'array, cercata per id del subdocumento. */
function indiceVoce(bilancio: BilancioDoc, voceId: string): number {
  return bilancio.voci.findIndex((v) => String(v._id) === String(voceId));
}

export interface VoceInput {
  categoria?: CategoriaBilancio;
  descrizione?: string;
  importo?: number;
  previsto?: number;
  ripartizione?: RipartizioneBilancio;
  valorePerMillesimo?: number;
}

export async function aggiungiVoce(
  condominioId: string,
  bilancioId: string,
  voce: VoceInput,
): Promise<BilancioDoc> {
  const esistente = await getBilancioOrThrow(condominioId, bilancioId);
  assicuraModificabile(esistente);

  const nuova: VoceBilancio = {
    _id: new Types.ObjectId(),
    categoria: voce.categoria ?? 'altro',
    descrizione: voce.descrizione ?? '',
    importo: voce.importo ?? 0,
    previsto: voce.previsto,
    ripartizione: voce.ripartizione ?? 'diritto',
    valorePerMillesimo: voce.valorePerMillesimo,
    voci: [],
  };

  // `$push` invece di `save()`: l'aggiunta di una voce non deve riscrivere le
  // altre, altrimenti due voci inserite quasi insieme se si sovrascrivono a
  // vicenda. Il totale viaggia nella stessa operazione per non restare indietro.
  const aggiornato = await Bilancio.findOneAndUpdate(
    { _id: bilancioId, condominio: condominioId },
    { $push: { voci: nuova }, $set: { totale: totalizza([...esistente.voci, nuova]) } },
    { new: true },
  ).lean<BilancioDoc>();
  if (!aggiornato) throw notFound('Bilancio non trovato');
  return aggiornato;
}

export async function modificaVoce(
  condominioId: string,
  bilancioId: string,
  voceId: string,
  campi: VoceInput,
): Promise<BilancioDoc> {
  const esistente = await getBilancioOrThrow(condominioId, bilancioId);
  assicuraModificabile(esistente);

  const i = indiceVoce(esistente, voceId);
  if (i < 0) throw notFound('Voce di bilancio non trovata');

  const aggiornate = esistente.voci.map((v, idx) =>
    idx === i ? { ...v, ...campi, _id: v._id } : v,
  ) as VoceBilancio[];

  const $set: Record<string, unknown> = { totale: totalizza(aggiornate) };
  if (campi.categoria !== undefined) $set[`voci.${i}.categoria`] = campi.categoria;
  if (campi.descrizione !== undefined) $set[`voci.${i}.descrizione`] = campi.descrizione;
  if (campi.importo !== undefined) $set[`voci.${i}.importo`] = campi.importo;
  if (campi.previsto !== undefined) $set[`voci.${i}.previsto`] = campi.previsto;
  if (campi.ripartizione !== undefined) $set[`voci.${i}.ripartizione`] = campi.ripartizione;
  if (campi.valorePerMillesimo !== undefined) $set[`voci.${i}.valorePerMillesimo`] = campi.valorePerMillesimo;

  const aggiornato = await Bilancio.findOneAndUpdate(
    { _id: bilancioId, condominio: condominioId },
    { $set },
    { new: true },
  ).lean<BilancioDoc>();
  if (!aggiornato) throw notFound('Bilancio non trovato');
  return aggiornato;
}

export async function eliminaVoce(
  condominioId: string,
  bilancioId: string,
  voceId: string,
): Promise<BilancioDoc> {
  const esistente = await getBilancioOrThrow(condominioId, bilancioId);
  assicuraModificabile(esistente);

  if (indiceVoce(esistente, voceId) < 0) throw notFound('Voce di bilancio non trovata');

  const aggiornato = await Bilancio.findOneAndUpdate(
    { _id: bilancioId, condominio: condominioId },
    {
      $pull: { voci: { _id: new Types.ObjectId(String(voceId)) } },
      $set: { totale: totalizza(esistente.voci.filter((v) => String(v._id) !== String(voceId))) },
    },
    { new: true },
  ).lean<BilancioDoc>();
  if (!aggiornato) throw notFound('Bilancio non trovato');
  return aggiornato;
}

/**
 * Crea il consuntivo dell'anno a partire dal preventivo approvato.
 *
 * Copia le voci con l'importo previsto in `previsto` e azzera l'importo
 * realizzato: il consuntivo si compila correggendo gli importi uno alla volta
 * man mano che le fatture arrivano. Copiare il preventivo a mano, voce per voce,
 * è il modo in cui i totali finiscono per non coincidere con quelli deliberate.
 */
export async function creaConsuntivo(
  condominioId: string,
  preventivoId: string,
): Promise<{ bilancio: BilancioDoc; creato: boolean }> {
  const preventivo = await getBilancioOrThrow(condominioId, preventivoId);
  if (preventivo.tipo !== 'preventivo') {
    throw badRequest('Il consuntivo si genera da un bilancio preventivo');
  }
  if (!preventivo.approvato) {
    throw badRequest(
      'Il bilancio preventivo deve essere approvato dall’assemblea prima di generare il consuntivo',
    );
  }

  const esistente = await Bilancio.findOne({
    condominio: condominioId,
    anno: preventivo.anno,
    tipo: 'consuntivo',
  }).lean<BilancioDoc>();
  if (esistente) return { bilancio: esistente, creato: false };

  const bilancio = await Bilancio.create({
    condominio: oid(condominioId),
    anno: preventivo.anno,
    tipo: 'consuntivo',
    descrizione: `Consuntivo ${preventivo.anno}`,
    daBilancio: preventivo._id,
    totalePrevisto: preventivo.totale || totalizza(preventivo.voci),
    voci: preventivo.voci.map((v) => ({
      categoria: v.categoria,
      descrizione: v.descrizione,
      previsto: v.importo,
      importo: 0,
      ripartizione: v.ripartizione,
      valorePerMillesimo: v.valorePerMillesimo,
      voci: [],
    })),
    totale: 0,
  });

  return { bilancio: bilancio.toObject() as BilancioDoc, creato: true };
}
