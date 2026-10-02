import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../..');

dotenv.config({ path: path.join(rootDir, '.env') });
dotenv.config({ path: path.join(rootDir, 'server/.env') });

const boolean = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : v === 'true' || v === '1'));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/condomini'),
  JWT_ACCESS_SECRET: z.string().min(16).default('dev-access-secret-change-me-please'),
  JWT_REFRESH_SECRET: z.string().min(16).default('dev-refresh-secret-change-me-please'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SECURE: boolean(false),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  // ---- Brevo (invio email) ----
  /** Base del frontend: serve a comporre il link di conferma che va nell'email. */
  URL_FRONTEND: z.string().default('http://localhost:5173'),
  /**
   * Base pubblica di questa API.
   *
   * Va dichiarata solo in produzione, dove frontend e API hanno origini diverse:
   * senza, gli URL degli allegati restano relativi e il frontend li chiederebbe
   * al sito statico ricevendone un 404. In sviluppo resta vuota e passa dal
   * proxy di Vite.
   */
  URL_API: z.string().default(''),
  BREVO_API_KEY: z.string().optional(),
  BREVO_MITTENTE_EMAIL: z.string().email().default('conferma@steward.local'),
  BREVO_MITTENTE_NOME: z.string().default('Steward'),
  /** Ore entro cui il link di conferma resta valido. */
  CONFERMA_EMAIL_TTL_ORE: z.coerce.number().int().min(1).max(720).default(72),
  SEED_ADMIN_EMAIL: z.string().email().default('admin@condomini.local'),
  SEED_ADMIN_PASSWORD: z.string().min(8).default('Admin123!'),
  SEED_SUPERADMIN_EMAIL: z.string().email().default('superadmin@condomini.local'),
  SEED_SUPERADMIN_PASSWORD: z.string().min(10).default('SuperAdmin123!'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Configurazione ambiente non valida:\n${issues}`);
}

const env = parsed.data;

if (env.NODE_ENV === 'production') {
  if (env.JWT_ACCESS_SECRET.includes('change-me') || env.JWT_REFRESH_SECRET.includes('change-me')) {
    throw new Error('In produzione i JWT_SECRET devono essere valori reali, non i default di sviluppo.');
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    throw new Error('JWT_ACCESS_SECRET e JWT_REFRESH_SECRET devono essere diversi.');
  }
}

export const config = {
  env: env.NODE_ENV,
  isProd: env.NODE_ENV === 'production',
  port: env.PORT,
  rootDir,
  mongodbUri: env.MONGODB_URI,
  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessTtl: env.JWT_ACCESS_TTL,
    refreshTtl: env.JWT_REFRESH_TTL,
  },
  cookie: {
    name: 'condomini_rt',
    domain: env.COOKIE_DOMAIN,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
  },
  corsOrigins: env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  brevo: {
    /**
     * L'invio è attivo solo con una chiave configurata. Senza, `inviaEmail`
     * segnala l'indisponibilità invece di fallire: la conferma dell'indirizzo
     * non deve impedire di creare un amministratore.
     */
    attivo: Boolean(env.BREVO_API_KEY),
    apiKey: env.BREVO_API_KEY ?? '',
    mittenteEmail: env.BREVO_MITTENTE_EMAIL,
    mittenteNome: env.BREVO_MITTENTE_NOME,
    confermaTtlOre: env.CONFERMA_EMAIL_TTL_ORE,
  },
  urlFrontend: env.URL_FRONTEND,
  /** Vuota in sviluppo: vedi `URL_API` nello schema. */
  urlApi: env.URL_API,
  seed: {
    adminEmail: env.SEED_ADMIN_EMAIL,
    adminPassword: env.SEED_ADMIN_PASSWORD,
    superadminEmail: env.SEED_SUPERADMIN_EMAIL,
    superadminPassword: env.SEED_SUPERADMIN_PASSWORD,
  },
} as const;

export type AppConfig = typeof config;
