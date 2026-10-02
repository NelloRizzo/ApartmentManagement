/**
 * Client HTTP unico per l'API.
 *
 * - Access token tenuto solo in memoria: non finisce mai in localStorage.
 * - Refresh token nel cookie httpOnly: in caso di 401 si tenta un refresh una volta sola.
 * - Gli errori del server vengono trasformati in `ApiError` con codice e dettagli.
 */
import type { ApiEnvelope, ApiErrorEnvelope, PageMeta } from '@/types/domain';

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Restituisce il messaggio del primo errore di validazione, se presente. */
  get primoErroreValidazione(): string | null {
    const d = this.details as { fieldErrors?: Record<string, string[]>; formErrors?: string[] } | undefined;
    if (d?.formErrors?.length) return d.formErrors[0] ?? null;
    if (d?.fieldErrors) {
      const primo = Object.values(d.fieldErrors)[0];
      return primo?.[0] ?? null;
    }
    return null;
  }
}

let accessToken: string | null = null;
let refreshInCorso: Promise<string | null> | null = null;
const ascoltatoriTokenScaduto = new Set<() => void>();

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function onSessionExpired(callback: () => void): () => void {
  ascoltatoriTokenScaduto.add(callback);
  return () => ascoltatoriTokenScaduto.delete(callback);
}

function segnalaScadenza(): void {
  accessToken = null;
  for (const cb of ascoltatoriTokenScaduto) cb();
}

async function tentaRefresh(): Promise<string | null> {
  if (!refreshInCorso) {
    refreshInCorso = (async () => {
      try {
        const risposta = await fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!risposta.ok) return null;
        const corpo = (await risposta.json()) as ApiEnvelope<{ accessToken: string }>;
        accessToken = corpo.data.accessToken;
        return accessToken;
      } catch {
        return null;
      } finally {
        setTimeout(() => {
          refreshInCorso = null;
        }, 0);
      }
    })();
  }
  return refreshInCorso;
}

export interface RichiestaOpzioni {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Disattiva il refresh automatico (usato dal login). */
  senzaRefresh?: boolean;
  signal?: AbortSignal;
}

function costruisciUrl(path: string, query?: RichiestaOpzioni['query']): string {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);
  if (query) {
    for (const [chiave, valore] of Object.entries(query)) {
      if (valore === undefined || valore === null || valore === '') continue;
      url.searchParams.set(chiave, String(valore));
    }
  }
  return url.pathname + url.search;
}

async function esegui<T>(path: string, opzioni: RichiestaOpzioni, tentativo = 0): Promise<ApiEnvelope<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };

  if (opzioni.body !== undefined && !(opzioni.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const risposta = await fetch(costruisciUrl(path, opzioni.query), {
    method: opzioni.method ?? 'GET',
    headers,
    credentials: 'include',
    signal: opzioni.signal,
    body:
      opzioni.body === undefined
        ? undefined
        : opzioni.body instanceof FormData
          ? opzioni.body
          : JSON.stringify(opzioni.body),
  });

  if (risposta.status === 204) {
    return { success: true, data: undefined as T };
  }

  const testo = await risposta.text();
  let corpo: unknown = undefined;
  if (testo) {
    try {
      corpo = JSON.parse(testo);
    } catch {
      corpo = undefined;
    }
  }

  if (!risposta.ok) {
    const errore = (corpo ?? {}) as Partial<ApiErrorEnvelope>;
    // Una risposta priva di JSON non viene dalla nostra API: il sito statico e
    // l'API stanno su origini diverse, quindi il browser blocca la risposta se
    // il servizio non e' raggiungibile o non invia gli header CORS. La pagina di
    // errore di Render e' HTML e il risultato sarebbe un "Errore 404" che non
    // dice nulla: meglio far emergere l'URL che ha fallito.
    const senzaJson = testo.trim() !== '' && corpo === undefined;
    const err = new ApiError(
      risposta.status,
      errore?.error?.code ?? (senzaJson ? 'API_NON_RAGGIUNGIBILE' : 'UNKNOWN'),
      errore?.error?.message ??
        (senzaJson
          ? `Risposta HTTP ${risposta.status} senza JSON da ${BASE_URL}: indirizzo dell'API sbagliato o servizio non ancora online.`
          : `Errore ${risposta.status}`),
      errore?.error?.details,
    );

    if (err.status === 401 && !opzioni.senzaRefresh && tentativo === 0) {
      const nuovoToken = await tentaRefresh();
      if (nuovoToken) return esegui<T>(path, opzioni, tentativo + 1);
      segnalaScadenza();
    }

    throw err;
  }

  return corpo as ApiEnvelope<T>;
}

export const api = {
  get: <T>(path: string, query?: RichiestaOpzioni['query'], opzioni?: RichiestaOpzioni) =>
    esegui<T>(path, { ...opzioni, method: 'GET', query }),
  post: <T>(path: string, body?: unknown, opzioni?: RichiestaOpzioni) =>
    esegui<T>(path, { ...opzioni, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, opzioni?: RichiestaOpzioni) =>
    esegui<T>(path, { ...opzioni, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, opzioni?: RichiestaOpzioni) =>
    esegui<T>(path, { ...opzioni, method: 'PATCH', body }),
  delete: <T>(path: string, opzioni?: RichiestaOpzioni) => esegui<T>(path, { ...opzioni, method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData, opzioni?: RichiestaOpzioni) =>
    esegui<T>(path, { ...opzioni, method: 'POST', body: formData }),
};

export function paginaDaMeta(meta?: PageMeta): { pagina: number; totalePagine: number } {
  return { pagina: meta?.page ?? 1, totalePagine: meta?.totalPages ?? 1 };
}
