import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, onSessionExpired, setAccessToken } from '@/api/client';
import type { Permesso, ProfiloCompleto, UserRole } from '@/types/domain';

interface AuthState {
  utente: ProfiloCompleto | null;
  inCaricamento: boolean;
  autenticato: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  ricarica: () => Promise<void>;
  /** Richiede un nuovo invio della conferma dell'indirizzo email. */
  reinviaConferma: () => Promise<{ ok: boolean; errore?: string }>;
  /** Il condominio attualmente selezionato nella UI. */
  condominioId: string | null;
  selezionaCondominio: (id: string) => void;
  nonLette: number;
  aggiornaNonLette: () => Promise<void>;
  /** Convocazioni la cui ordine del giorno il condòmino non ha ancora aperto. */
  daVedere: number;
  aggiornaDaVedere: () => Promise<void>;
  /** L'utente ha il permesso indicato (la scrittura implica la lettura). */
  puo: (permesso: Permesso) => boolean;
  isSuperadmin: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

const CHIAVE_CONDOMINIO = 'condomini:selezionato';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [utente, setUtente] = useState<ProfiloCompleto | null>(null);
  const [inCaricamento, setInCaricamento] = useState(true);
  const [condominioId, setCondominioId] = useState<string | null>(
    () => localStorage.getItem(CHIAVE_CONDOMINIO),
  );
  const [nonLette, setNonLette] = useState(0);
  const [daVedere, setDaVedere] = useState(0);

  const applicaUtente = useCallback((profilo: ProfiloCompleto) => {
    // I campi arrivano dal server: si normalizza comunque, perché un valore
    // mancante farebbe crashare l'intera applicazione su un solo `undefined`.
    const posizioni = Array.isArray(profilo.condomini) ? profilo.condomini : [];
    const completo: ProfiloCompleto = {
      ...profilo,
      condomini: posizioni,
      condominiIds: Array.isArray(profilo.condominiIds) ? profilo.condominiIds : [],
    };

    setUtente(completo);
    setCondominioId((corrente) => {
      const valido = posizioni.some((c) => c.condominioId === corrente);
      const primo = posizioni[0]?.condominioId ?? null;
      const scelto = valido ? corrente : (primo ?? null);
      if (scelto) localStorage.setItem(CHIAVE_CONDOMINIO, scelto);
      return scelto;
    });
  }, []);

  const caricaSessione = useCallback(async () => {
    try {
      const risposta = await api.post<{ accessToken: string; user: ProfiloCompleto }>(
        '/auth/refresh',
        undefined,
        { senzaRefresh: true },
      );
      setAccessToken(risposta.data.accessToken);
      applicaUtente(risposta.data.user);
    } catch {
      setAccessToken(null);
      setUtente(null);
    } finally {
      setInCaricamento(false);
    }
  }, [applicaUtente]);

  useEffect(() => {
    void caricaSessione();
  }, [caricaSessione]);

  useEffect(() => {
    return onSessionExpired(() => {
      setUtente(null);
      setAccessToken(null);
      setNonLette(0);
      setDaVedere(0);
    });
  }, []);

  const aggiornaNonLette = useCallback(async () => {
    if (!utente || !condominioId) return;
    try {
      const risposta = await api.get<{ nonLette: number }>(`/condomini/${condominioId}/comunicazioni/non-lette`);
      setNonLette(risposta.data.nonLette);
    } catch {
      // Il contatore non è critico: si ignora l'errore.
    }
  }, [utente, condominioId]);

  useEffect(() => {
    void aggiornaNonLette();
  }, [aggiornaNonLette]);

  /**
   * Convocazioni non ancora aperte dal condòmino.
   *
   * Come `nonLette` è un contatore non critico: l'errore si ignora e il badge
   * resta dov'era. La chiamata parte solo per il condòmino perché per gli altri
   * ruoli il server risponderebbe sempre zero.
   */
  const aggiornaDaVedere = useCallback(async () => {
    if (!utente || !condominioId) return;
    if (utente.role !== 'condomino') {
      setDaVedere(0);
      return;
    }
    try {
      const risposta = await api.get<{ daVedere: number }>(`/condomini/${condominioId}/assemblee/da-vedere`);
      setDaVedere(risposta.data.daVedere);
    } catch {
      // Il contatore non è critico: si ignora l'errore.
    }
  }, [utente, condominioId]);

  useEffect(() => {
    void aggiornaDaVedere();
  }, [aggiornaDaVedere]);

  const login = useCallback(
    async (email: string, password: string) => {
      const risposta = await api.post<{ accessToken: string; user: ProfiloCompleto }>(
        '/auth/login',
        { email, password },
        { senzaRefresh: true },
      );
      setAccessToken(risposta.data.accessToken);
      applicaUtente(risposta.data.user);
    },
    [applicaUtente],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Anche se la chiamata fallisce, la sessione locale va comunque chiusa.
    }
    setAccessToken(null);
    setUtente(null);
    setNonLette(0);
    setDaVedere(0);
    localStorage.removeItem(CHIAVE_CONDOMINIO);
  }, []);

  const ricarica = useCallback(async () => {
    if (!utente) return;
    try {
      const risposta = await api.get<ProfiloCompleto>('/auth/me');
      applicaUtente(risposta.data);
    } catch {
      // Lascia lo stato precedente se il profilo non è recuperabile.
    }
  }, [utente, applicaUtente]);

  /**
   * Richiede un nuovo invio della conferma dell'indirizzo.
   *
   * Restituisce l'esito invece di sollevare: l'avviso deve aggiornarsi sia in
   * caso di successo sia quando il server risponde che l'invio non è disponibile.
   */
  const reinviaConferma = useCallback(async (): Promise<{ ok: boolean; errore?: string }> => {
    try {
      await api.post('/auth/reinvia-conferma');
      return { ok: true };
    } catch (e) {
      return { ok: false, errore: e instanceof ApiError ? e.message : 'Invio non riuscito' };
    }
  }, []);

  const selezionaCondominio = useCallback((id: string) => {
    localStorage.setItem(CHIAVE_CONDOMINIO, id);
    setCondominioId(id);
  }, []);

  const isSuperadmin = utente?.role === 'superadmin';

  /**
   * Verifica un permesso con la stessa regola del server: il superadmin passa
   * sempre, un elenco `null` significa accesso pieno e la scrittura implica la
   * lettura. Così la UI non nasconde ciò che il backend accetterebbe.
   */
  const puo = useCallback(
    (permesso: Permesso): boolean => {
      if (!utente) return false;
      if (utente.role === 'superadmin') return true;
      if (utente.role !== 'admin') return false;
      if (!Array.isArray(utente.permessi)) return true;
      if (utente.permessi.includes(permesso)) return true;
      const ambito = permesso.split(':')[0];
      return utente.permessi.includes(`${ambito}:scrivere` as Permesso);
    },
    [utente],
  );

  const valore = useMemo<AuthState>(
    () => ({
      utente,
      inCaricamento,
      autenticato: utente !== null,
      login,
      logout,
      ricarica,
      reinviaConferma,
      condominioId,
      selezionaCondominio,
      nonLette,
      aggiornaNonLette,
      daVedere,
      aggiornaDaVedere,
      puo,
      isSuperadmin,
    }),
    [utente, inCaricamento, login, logout, ricarica, reinviaConferma, condominioId, selezionaCondominio, nonLette, aggiornaNonLette, daVedere, aggiornaDaVedere, puo, isSuperadmin],
  );

  return <AuthContext.Provider value={valore}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth va usato dentro <AuthProvider>');
  return ctx;
}

/** Ruolo dell'utente corrente, con fallback sicuro. */
export function useRuolo(): UserRole {
  return useAuth().utente?.role ?? 'condomino';
}

/** Vero per amministratori, assistenti e per l'amministratore di piattaforma. */
export function useSeAmministratore(): boolean {
  const { utente } = useAuth();
  return utente?.role === 'admin' || utente?.role === 'portiere' || utente?.role === 'superadmin';
}

/**
 * Verifica un permesso delegato. Va usato per nascondere o disabilitare i
 * controlli che l'utente non può esercitare: il backend resta l'autorità, ma
 * mostrare un pulsante che risponderà 403 è una cattiva esperienza.
 */
export function usePermesso(): (permesso: Permesso) => boolean {
  return useAuth().puo;
}
