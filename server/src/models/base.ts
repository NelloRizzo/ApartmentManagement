import type { Schema, SchemaDefinitionProperty , Types } from 'mongoose';
import mongoose, { Schema as MongooseSchema } from 'mongoose';

/**
 * `mongoose` è un pacchetto CommonJS: Node non ne espone tutti i nomi come
 * named export ESM (in particolare `models`). Per questo l'accesso passa dal
 * default export, che è sempre disponibile.
 */
export const models = mongoose.models;

/** Riferimento a un documento, usato nelle interfacce TypeScript dei modelli. */
export type ObjectId = Types.ObjectId;

export interface BaseOptions {
  timestamps?: boolean;
  collection: string;
  toJSON?: Record<string, unknown>;
  toObject?: Record<string, unknown>;
}

/** Builds a Mongoose schema with the defaults used across the whole domain. */
export function baseSchema(
  definition: Record<string, SchemaDefinitionProperty>,
  options: BaseOptions,
): Schema {
  const { timestamps = true, collection, ...rest } = options;
  return new MongooseSchema(definition, {
    timestamps,
    collection,
    versionKey: false,
    minimize: false,
    ...rest,
  });
}

/** Recursively strips `password` and `__v` from a lean/plain object before it leaves the API. */
export function sanitize<T>(doc: T): T {
  if (Array.isArray(doc)) return doc.map((d) => sanitize(d)) as T;
  if (doc && typeof doc === 'object' && !(doc instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(doc as Record<string, unknown>)) {
      if (key === 'password' || key === '__v' || key === 'passwordResetToken') continue;
      out[key] = sanitize(value);
    }
    return out as T;
  }
  return doc;
}
