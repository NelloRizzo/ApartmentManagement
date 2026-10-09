/**
 * Logica dei permessi: `haPermesso`, `puoEseguire` e i guard.
 *
 *   npm test
 *
 * Non richiedono il database: i guard dei permessi dipendono solo da
 * `req.user`, che in produzione è compilato da `requireAuth`. È la parte più
 * fragile del sistema — un permesso che passa dove non dovrebbe espone dati di
 * un condomio a chi non li amministra — quindi ha test invece di essere solo
 * documentata.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Request, RequestHandler } from 'express';
import {
  puoEseguire,
  requireAmministratore,
  requireCondominioAccess,
  requireNonAssistente,
  requirePermesso,
  requirePermessoLettura,
  requirePermessoOPartecipante,
} from '../middleware/auth.js';
import { Condominio } from '../models/condominio.model.js';
import { Condomino } from '../models/condomino.model.js';
import { User } from '../models/user.model.js';
import { haPermesso, type Permesso, type UserRole } from '../types/domain.js';

type Utente = NonNullable<Request['user']>;

/** Utente finto: i guard leggono solo `role` e `permessi`. */
function utente(role: UserRole, permessi: Permesso[] | null): Utente {
  return {
    sub: 'utente-di-prova',
    email: 'prova@example.com',
    role,
    name: 'Prova',
    condominiIds: [],
    permessi,
    tokenVersion: 0,
  };
}

/**
 * Esegue un guard e restituisce l'errore passato a `next`, se c'è.
 *
 * Un guard che chiama `next()` senza argomento ha accettato la richiesta: è
 * questo il comportamento da verificare, non una risposta HTTP.
 */
/**
 * Esegue un guard e restituisce l'errore passato a `next`, se c'è.
 *
 * Un guard che chiama `next()` senza argomento ha accettato la richiesta: è
 * questo il comportamento da verificare, non una risposta HTTP.
 *
 * La versione asincrona serve per i guard che aspettano il database: il modello
 * viene sostituito, quindi nessuna connessione viene aperta.
 */
async function eseguiAsync(
  guard: RequestHandler,
  req: Partial<Request>,
): Promise<{ errore: unknown; passato: boolean }> {
  let esito: { errore: unknown; passato: boolean } | null = null;
  const reqFinto = req as Request;
  await guard(reqFinto, {} as never, (errore?: unknown) => {
    esito = { errore, passato: errore === undefined };
  });
  assert.ok(esito, 'il guard non ha chiamato next()');
  return esito;
}

function esegui(
  guard: ReturnType<typeof requirePermesso>,
  req: Partial<Request>,
): { errore: unknown; passato: boolean } {
  let esito: { errore: unknown; passato: boolean } | null = null;
  const reqFinto = req as Request;
  guard(reqFinto, {} as never, (errore?: unknown) => {
    esito = { errore, passato: errore === undefined };
  });
  assert.ok(esito, 'il guard non ha chiamato next()');
  return esito;
}

describe('haPermesso', () => {
  it('concede tutto quando non c\'è un elenco di permessi', () => {
    // `null` è il modo con cui un admin senza delega viene salvato: è la
    // differenza fra "tutto" e "niente", quindi va tenuta distinta da `[]`.
    assert.equal(haPermesso(null, 'bilanci:scrivere'), true);
  });

  it('concede un elenco vuoto solo per assenza di richieste', () => {
    assert.equal(haPermesso([], 'bilanci:scrivere'), false);
  });

  it('implica la lettura quando è concessa la scrittura', () => {
    assert.equal(haPermesso(['versamenti:scrivere'], 'versamenti:leggere'), true);
  });

  it('non implica la scrittura dalla lettura', () => {
    assert.equal(haPermesso(['versamenti:leggere'], 'versamenti:scrivere'), false);
  });

  it('non lascia trapelare un ambito non elencato', () => {
    assert.equal(haPermesso(['versamenti:scrivere'], 'comunicazioni:scrivere'), false);
  });

  it('non confonde due ambiti che si somigliano', () => {
    // `assemblee` e `verbali` hanno nomi diversi ma entrambi esistono: un
    // confronto per prefisso assegnerebbe al verbale tutto quello dell'assemblea.
    assert.equal(haPermesso(['assemblee:scrivere'], 'verbali:scrivere'), false);
    assert.equal(haPermesso(['verbali:scrivere'], 'assemblee:scrivere'), false);
  });

  it('basta uno dei permessi richiesti', () => {
    const conQualche = haPermesso(['unita:scrivere'], 'unita:scrivere');
    assert.equal(conQualche, true);
  });
});

describe('puoEseguire', () => {
  it('il superadmin può tutto', () => {
    assert.equal(puoEseguire(utente('superadmin', null), 'amministrazione:scrivere'), true);
  });

  it('l\'admin passa solo sui permessi ricevuti', () => {
    const assistente = utente('admin', ['versamenti:scrivere']);
    assert.equal(puoEseguire(assistente, 'versamenti:leggere'), true);
    assert.equal(puoEseguire(assistente, 'bilanci:scrivere'), false);
  });

  it('l\'admin senza elenco ha accesso pieno', () => {
    assert.equal(puoEseguire(utente('admin', null), 'amministrazione:scrivere'), true);
  });

  it('condòmino e portiere non amministrano, nemmeno per leggere', () => {
    // `haPermesso` restituirebbe vero con elenco vuoto: è il controllo sul
    // ruolo a chiudere, e i due ruoli non amministrano nulla.
    for (const ruolo of ['condomino', 'portiere'] as const) {
      assert.equal(puoEseguire(utente(ruolo, []), 'versamenti:leggere'), false);
    }
  });
});

describe('requirePermesso (scritture)', () => {
  it('lascia passare il superadmin', () => {
    assert.equal(
      esegui(requirePermesso('bilanci:scrivere'), { user: utente('superadmin', null) }).passato,
      true,
    );
  });

  it('lascia passare l\'admin senza elenco', () => {
    assert.equal(
      esegui(requirePermesso('bilanci:scrivere'), { user: utente('admin', null) }).passato,
      true,
    );
  });

  it('lascia passare l\'assistente col permesso', () => {
    assert.equal(
      esegui(requirePermesso('versamenti:scrivere'), { user: utente('admin', ['versamenti:scrivere']) })
        .passato,
      true,
    );
  });

  it('blocca l\'assistente senza il permesso', () => {
    const { passato, errore } = esegui(requirePermesso('bilanci:scrivere'), {
      user: utente('admin', ['versamenti:scrivere']),
    });
    assert.equal(passato, false);
    assert.equal((errore as { statusCode: number }).statusCode, 403);
  });

  it('blocca il condòmino anche con un elenco che lo contiene', () => {
    // I permessi sono uno strumento di delega fra amministratori: se un
    // condòmino avesse `permessi` compilati non deve diventare amministratore.
    const { passato } = esegui(requirePermesso('versamenti:scrivere'), {
      user: utente('condomino', ['versamenti:scrivere']),
    });
    assert.equal(passato, false);
  });

  it('risponde 401 senza utente', () => {
    const { passato, errore } = esegui(requirePermesso('versamenti:scrivere'), {});
    assert.equal(passato, false);
    assert.equal((errore as { statusCode: number }).statusCode, 401);
  });
});

describe('requirePermessoLettura (liste e dettagli)', () => {
  it('lascia passare il condòmino', () => {
    // Il condòmino deve vedere i propri verbali e le proprie quote: il filtro per
    // utente è dentro il controller, qui il ruolo non viene toccato.
    assert.equal(esegui(requirePermessoLettura('verbali:leggere'), { user: utente('condomino', []) }).passato, true);
  });

  it('chiude al portiere tutto ciò che non è nella sua lista', () => {
    // Il perimetro del portiere è la sua lista di permessi. Prima passava da ogni
    // rotta di lettura, perché il controllo era solo per `admin`, e i controller
    // filtrano solo il condòmino: avrebbe letto versamenti, quote con gli
    // importi, bilanci e verbali dello stabile in cui serve.
    const { passato, errore } = esegui(requirePermessoLettura('versamenti:leggere'), {
      user: utente('portiere', []),
    });
    assert.equal(passato, false);
    assert.equal((errore as { statusCode: number }).statusCode, 403);

    assert.equal(
      esegui(requirePermessoLettura('iscritti:leggere'), { user: utente('portiere', ['iscritti:leggere']) }).passato,
      true,
    );
  });

  it('non tratta il permesso vuoto del portiere come accesso pieno', () => {
    // `null` è "tutto" ed è il modo con cui viene salvato l'amministratore senza
    // delega. Se valesse anche per il portiere, un account con la lista azzerata
    // avrebbe aperto tutto lo stabile.
    const { passato, errore } = esegui(requirePermessoLettura('iscritti:leggere'), {
      user: utente('portiere', null),
    });
    assert.equal(passato, false);
    assert.equal((errore as { statusCode: number }).statusCode, 403);
  });

  it('blocca l\'assistente su un ambito non delegato', () => {
    const { passato, errore } = esegui(requirePermessoLettura('bilanci:leggere'), {
      user: utente('admin', ['versamenti:scrivere']),
    });
    assert.equal(passato, false);
    assert.equal((errore as { statusCode: number }).statusCode, 403);
  });

  it('implica la lettura dal permesso di scrittura', () => {
    assert.equal(
      esegui(requirePermessoLettura('versamenti:leggere'), {
        user: utente('admin', ['versamenti:scrivere']),
      }).passato,
      true,
    );
  });
});

describe('requirePermessoOPartecipante (comunicazioni)', () => {
  // La stessa scrittura è legittima per due soggetti diversi: il condòmino
  // scrive all'amministratore, l'amministratore scrive ai condòmini. Un
  // `requirePermesso` qui vieterebbe al condòmino di scrivere.
  it('lascia scrivere al condòmino', () => {
    assert.equal(
      esegui(requirePermessoOPartecipante('comunicazioni:scrivere'), { user: utente('condomino', []) })
        .passato,
      true,
    );
  });

  it('blocca l\'assistente che non ha la delega', () => {
    const { passato } = esegui(requirePermessoOPartecipante('comunicazioni:scrivere'), {
      user: utente('admin', ['versamenti:scrivere']),
    });
    assert.equal(passato, false);
  });

  it('lascia passare l\'assistente con la delega', () => {
    assert.equal(
      esegui(requirePermessoOPartecipante('comunicazioni:scrivere'), {
        user: utente('admin', ['comunicazioni:scrivere']),
      }).passato,
      true,
    );
  });
});

describe('requireAmministratore', () => {
  it('passa per l\'amministratore di almeno uno stabile', async () => {
    Condominio.exists = (async () => ({ _id: 'x' })) as never;
    const { passato } = await eseguiAsync(requireAmministratore, { user: utente('admin', []) });
    assert.equal(passato, true);
  });

  it('blocca l\'assistente, che è un admin ma non amministra nulla', async () => {
    // Il caso che ha fatto scoprire il difetto: `requireRole('admin')` passava,
    // perché un assistente è un admin. Ma `registraDelegazione` collega la persona
    // creata agli stabili di cui il creatore è amministratore, quindi l'assistente
    // avrebbe prodotto un account senza nessuno stabile.
    Condominio.exists = (async () => null) as never;
    const { passato, errore } = await eseguiAsync(requireAmministratore, {
      user: utente('admin', ['versamenti:scrivere']),
    });
    assert.equal(passato, false);
    assert.equal((errore as { statusCode: number }).statusCode, 403);
  });

  it('blocca il condòmino e lascia passare il superadmin senza guardare', async () => {
    // Il superadmin non amministra nessuno stabile: guardare `exists` lo
    // escluderebbe, quindi va fuori prima.
    let guardato = false;
    Condominio.exists = (async () => {
      guardato = true;
      return null;
    }) as never;

    const condomino = await eseguiAsync(requireAmministratore, { user: utente('condomino', []) });
    assert.equal(condomino.passato, false);

    const superadmin = await eseguiAsync(requireAmministratore, {
      user: { ...utente('superadmin', null), isSuperadmin: true } as never,
    });
    assert.equal(superadmin.passato, true);
    assert.equal(guardato, false, 'il controllo non deve girare per il superadmin');
  });
});

describe('requireNonAssistente', () => {
  it('passa per l\'amministratore, che non ha delegatoDa', async () => {
    User.findById = (() => ({ select: () => ({ lean: async () => ({ _id: 'x' }) }) })) as never;
    const { passato } = await eseguiAsync(requireNonAssistente, { user: utente('admin', null) });
    assert.equal(passato, true);
  });

  it('blocca l\'assistente, anche con l\'ambito amministrazione in scrittura', async () => {
    // Il caso reale: `delegatoDa` valorizzato e `amministrazione:scrivere` concesso.
    // Creava il condominio a proprio nome e ne diventava amministratore.
    User.findById = (() => ({ select: () => ({ lean: async () => ({ delegatoDa: 'qualcuno' }) }) })) as never;
    const { passato, errore } = await eseguiAsync(requireNonAssistente, {
      user: utente('admin', ['amministrazione:scrivere']),
    });
    assert.equal(passato, false);
    assert.equal((errore as { statusCode: number }).statusCode, 403);
  });

  it('blocca il condòmino e lascia passare il superadmin senza guardare', async () => {
    let guardato = false;
    User.findById = (() => {
      guardato = true;
      return { select: () => ({ lean: async () => ({}) }) };
    }) as never;

    const condomino = await eseguiAsync(requireNonAssistente, { user: utente('condomino', []) });
    assert.equal(condomino.passato, false);

    const superadmin = await eseguiAsync(requireNonAssistente, {
      user: { ...utente('superadmin', null), isSuperadmin: true } as never,
    });
    assert.equal(superadmin.passato, true);
    assert.equal(guardato, false, 'il controllo non deve girare per il superadmin');
  });
});

describe('requireCondominioAccess', () => {
  // Il guard interroga i modelli: si sostituiscono i metodi `exists` per non
  // aprire una connessione. La logica da verificare è il confronto tra ruolo e
  // filtro, non il comportamento di Mongoose.
  const idValido = '6abfa9d3531f4ddfb4b0604e';

  async function eseguiAccesso(
    req: Partial<Request>,
    risposte: { condominio?: unknown; condomino?: unknown },
  ): Promise<{ passato: boolean; statusCode?: number }> {
    const originaleCondominio = Condominio.exists;
    const originaleCondomino = Condomino.exists;
    Condominio.exists = (async () => risposte.condominio ?? null) as never;
    Condomino.exists = (async () => risposte.condomino ?? null) as never;

    try {
      let esito: { passato: boolean; statusCode?: number } | null = null;
      const reqFinto = req as Request;
      reqFinto.params = { condominioId: idValido } as never;
      await new Promise<void>((risolvi) => {
        requireCondominioAccess(reqFinto, {} as never, (errore?: unknown) => {
          esito = errore
            ? { passato: false, statusCode: (errore as { statusCode: number }).statusCode }
            : { passato: true };
          risolvi();
        });
      });
      assert.ok(esito, 'requireCondominioAccess non ha chiamato next()');
      return esito;
    } finally {
      Condominio.exists = originaleCondominio;
      Condomino.exists = originaleCondomino;
    }
  }

  it('rifiuta un condominio che non esiste', async () => {
    // Con il filtro per proprietario il superadmin avrebbe ricevuto 403 su
    // ogni condominio: l'assenza deve essere un 404, non un permesso.
    const esito = await eseguiAccesso({ user: utente('superadmin', null) }, { condominio: null });
    assert.deepEqual(esito, { passato: false, statusCode: 404 });
  });

  it('lascia entrare il superadmin in un condominio esistente', async () => {
    const esito = await eseguiAccesso({ user: utente('superadmin', null) }, { condominio: { _id: idValido } });
    assert.deepEqual(esito, { passato: true });
  });

  it('per il condòmino cerca la posizione fra gli iscritti', async () => {
    // Il condòmino non è titolare di nessun condominio: cercarlo fra gli
    // amministratori lo escluderebbe da ogni stabile.
    const esito = await eseguiAccesso(
      { user: utente('condomino', []) },
      { condominio: { _id: idValido }, condomino: { utente: 'utente-di-prova' } },
    );
    assert.deepEqual(esito, { passato: true });
  });

  it('non lascia entrare l\'amministratore di un altro condominio', async () => {
    const esito = await eseguiAccesso({ user: utente('admin', null) }, { condominio: null });
    assert.deepEqual(esito, { passato: false, statusCode: 403 });
  });

  it('blocca il condòmino che non è iscritto', async () => {
    const esito = await eseguiAccesso({ user: utente('condomino', []) }, { condomino: null });
    assert.deepEqual(esito, { passato: false, statusCode: 403 });
  });

  it('rifiuta un id che non è un ObjectId', async () => {
    let esito: { passato: boolean; statusCode?: number } | null = null;
    const req = { user: utente('superadmin', null), params: { condominioId: 'non-e-un-id' } } as unknown as Request;
    await new Promise<void>((risolvi) => {
      requireCondominioAccess(req, {} as never, (errore?: unknown) => {
        esito = errore
          ? { passato: false, statusCode: (errore as { statusCode: number }).statusCode }
          : { passato: true };
        risolvi();
      });
    });
    assert.deepEqual(esito, { passato: false, statusCode: 403 });
  });

  it('rifiuta una richiesta senza condominio', async () => {
    let esito: { passato: boolean; statusCode?: number } | null = null;
    const req = { user: utente('superadmin', null), params: {}, body: {} } as unknown as Request;
    await new Promise<void>((risolvi) => {
      requireCondominioAccess(req, {} as never, (errore?: unknown) => {
        esito = errore
          ? { passato: false, statusCode: (errore as { statusCode: number }).statusCode }
          : { passato: true };
        risolvi();
      });
    });
    assert.deepEqual(esito, { passato: false, statusCode: 403 });
  });
});
