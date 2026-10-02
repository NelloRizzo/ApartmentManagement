import crypto from 'node:crypto';
import { Types } from 'mongoose';
import { Condominio, User } from '../models/index.js';
import type { CondominioDoc } from '../models/index.js';
import type { UserRole } from '../types/domain.js';

/**
 * Password provvisoria per un account creato da altri.
 *
 * Usa `crypto`, non `Math.random`: la password è un segreto che viene consegnato
 * a chi non poteva ancora sceglierlo, e deve resistere a un tentativo a forza
 * bruta. `Math.random().toString(36)` dava circa 41 bit ed era prevedibile.
 * Include sempre una maiuscola, una minuscola e una cifra, così rispetta la
 * stessa policy che chiede il modulo di creazione amministratore.
 */
export function passwordTemporanea(prefisso = 'Steward'): string {
  const maiuscole = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const minuscole = 'abcdefghijkmnopqrstuvwxyz';
  const cifre = '23456789';
  const tutte = maiuscole + minuscole + cifre;

  const scegli = (alfabeto: string): string => alfabeto.charAt(crypto.randomInt(0, alfabeto.length));

  // 8 caratteri casuali più i quattro caratteri obbligatori, in posizione fissa
  // per non dover controllare a posteriori che la policy sia soddisfatta.
  const resto = Array.from({ length: 8 }, () => scegli(tutte)).join('');
  return `${prefisso}-${scegli(maiuscole)}${scegli(minuscole)}${scegli(cifre)}${resto}`;
}

/**
 * Condomini su cui l'utente ha un ruolo operativo.
 *
 * La fonte autorevole è il documento `Condominio` (campi `amministratore` e
 * `condominiServito`), non i campi denormalizzati sull'utente: evitare che i
 * due possano divergere e che il token JWT contenga un elenco vuoto.
 */
export async function condominiDiRuolo(utenteId: unknown, role: UserRole): Promise<string[]> {
  const id = new Types.ObjectId(String(utenteId));
  const filtro =
    role === 'superadmin'
      ? // Il superadmin vede ogni condominio: non è legato a nessuno in particolare.
        {}
      : role === 'admin'
        ? { $or: [{ amministratore: id }, { assistenti: id }] }
        : role === 'portiere'
          ? { condominiServito: id }
          : null;

  if (!filtro) return [];
  const condomini = await Condominio.find(filtro).select('_id').lean<Pick<CondominioDoc, '_id'>[]>();
  return condomini.map((c) => String(c._id));
}

/** Aggiorna i campi denormalizzati sull'utente, per query e filtri rapidi. */
export async function allineaUtente(utenteId: unknown): Promise<void> {
  const id = new Types.ObjectId(String(utenteId));
  const [amministrati, assistente, servito] = await Promise.all([
    Condominio.find({ amministratore: id }).select('_id').lean(),
    Condominio.find({ assistenti: id }).select('_id').lean(),
    Condominio.find({ condominiServito: id }).select('_id').lean(),
  ]);
  await User.updateOne(
    { _id: id },
    {
      $set: {
        condominiAmministrati: amministrati.map((c) => c._id),
        condominiAssistente: assistente.map((c) => c._id),
        condominiServito: servito.map((c) => c._id),
      },
    },
  );
}
