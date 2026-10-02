import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { Allegato, type AllegatoDoc, type AllegatoRiferito } from '../models/index.js';
import { badRequest, notFound } from '../utils/errors.js';

/**
 * Allegati conservati in MongoDB, serviti dall'API con firma a tempo.
 *
 * La firma serve perché un `<img src>` non può portare l'intestazione
 * `Authorization`: senza, servirebbe un cookie accessibile a ogni pagina, che è
 * esattamente ciò che l'applicazione evita di fare. L'URL firmato è la via
 * di un link firmato è il modo usuale per allegati protetti, ed è lo stesso
 * principio delle URL prefissate di uno storage a oggetti.
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

export interface NuovoAllegato {
  nome: string;
  tipo: string;
  dati: Buffer;
  size: number;
  mittente: string;
  condominio: string;
}

/**
 * Salva il file e restituisce il descrittore da mettere nel documento.
 *
 * `scadenza` è lasciata a Mongo: un file appena caricato ma mai agganciato a
 * una comunicazione viene cancellato da solo dopo 24 ore.
 */
export async function salvaAllegato(input: NuovoAllegato): Promise<AllegatoRiferito> {
  const scadenza = new Date(Date.now() + VALIDITA_ORE * 3_600_000);

  const doc = await Allegato.create({
    nome: input.nome,
    tipo: input.tipo,
    size: input.size,
    dati: input.dati,
    mittente: input.mittente,
    condominio: input.condominio,
    scadenza,
  });

  const epoch = Math.floor(scadenza.getTime() / 1000);
  return { nome: doc.nome, url: urlAllegato(String(doc._id), epoch), tipo: doc.tipo, size: doc.size };
}

/**
 * Rende permanente un allegato già agganciato a un documento.
 *
 * Chiamare quando la comunicazione o la convocazione viene salvata: l'allegato
 * non deve più scadere, altrimenti il documento resterebbe con un file perso.
 */
export async function rendiPermanente(url: string): Promise<void> {
  const id = idDaUrl(url);
  if (!id) return;
  await Allegato.updateOne({ _id: id }, { $unset: { scadenza: '' } });
}

function idDaUrl(url: string): string | null {
  const confronto = config.urlApi ? `${config.urlApi.replace(/\/$/, '')}/allegati/` : '/allegati/';
  const indice = url.indexOf(confronto);
  if (indice < 0) return null;
  return url.slice(indice + confronto.length).split(/[?#]/)[0] || null;
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
    throw badRequest('Il link dell’allegato è scaduto: ricarica la pagina per ottenere quello nuovo');
  }

  const doc = await Allegato.findById(id);
  if (!doc) throw notFound('Allegato non trovato');
  return doc;
}

/** Firma nuova per lo stesso allegato, usata quando si serve un link fresco. */
export function rinnovaUrl(doc: AllegatoDoc): string {
  const scadenza = Math.floor(Date.now() / 1000) + VALIDITA_ORE * 3_600;
  return urlAllegato(String(doc._id), scadenza);
}