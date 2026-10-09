/**
 * Logica del confronto fra revisioni millesimali: `variazioniTraRevisioni`.
 *
 *   npm test
 *
 * È il pezzo che decide cosa è cambiato da una revisione all'altra. Sbagliarlo
 * non rompe nulla a schermo: mostrerebbe una tabella con le quote giuste e una
 * storia con le variazioni sbagliate, che è peggio perché non fa rumore. Non
 * richiede il database: prende in ingresso le revisioni già estratte.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { variazioniTraRevisioni, type RevisioneQuote } from '../services/tabellaMillesimale.service.js';
import type { Ripartizione } from '../types/domain.js';

function revisione(
  numero: number,
  quote: Record<string, Partial<Record<Ripartizione, number>>>,
): RevisioneQuote {
  return {
    revisione: numero,
    validFrom: `2024-0${numero}-01T00:00:00.000Z`,
    validTo: null,
    totaleDiritto: 1000,
    quote: new Map(Object.entries(quote)),
  };
}

const codici = new Map([
  ['u1', 'A1'],
  ['u2', 'A2'],
  ['u3', 'B1'],
]);

describe('variazioniTraRevisioni', () => {
  it('la prima revisione elenca tutte le unità fra le entrate', () => {
    // Non ha una precedente con cui confrontarsi: è l'istituzione della tabella.
    const [rev1] = variazioniTraRevisioni(
      [revisione(1, { u2: { diritto: 400 }, u1: { diritto: 600 } })],
      codici,
    );
    assert.deepEqual(rev1!.entrate, [
      { unitaId: 'u1', codice: 'A1' },
      { unitaId: 'u2', codice: 'A2' },
    ]);
    assert.deepEqual(rev1!.uscite, []);
    assert.deepEqual(rev1!.variazioni, []);
  });

  it('riporta solo le unità cambiate, con da e a', () => {
    const [rev2] = variazioniTraRevisioni(
      [
        revisione(1, { u1: { diritto: 600 }, u2: { diritto: 300 }, u3: { diritto: 100 } }),
        revisione(2, { u1: { diritto: 500 }, u2: { diritto: 300 }, u3: { diritto: 200 } }),
      ],
      codici,
    );
    assert.equal(rev2!.revisione, 2);
    assert.deepEqual(rev2!.variazioni, [
      { unitaId: 'u1', codice: 'A1', quote: [{ ripartizione: 'diritto', da: 600, a: 500 }] },
      { unitaId: 'u3', codice: 'B1', quote: [{ ripartizione: 'diritto', da: 100, a: 200 }] },
    ]);
    assert.deepEqual(rev2!.entrate, []);
    assert.deepEqual(rev2!.uscite, []);
  });

  it('distingue una ripartizione assente da una introdotta a zero', () => {
    // `uso` non c'era e viene introdotta a 0: `da` è null, non 0. Confonderle
    // nasconderebbe la decisione di introdurre la ripartizione.
    const [rev2] = variazioniTraRevisioni(
      [revisione(1, { u1: { diritto: 1000 } }), revisione(2, { u1: { diritto: 1000, uso: 0 } })],
      codici,
    );
    assert.deepEqual(rev2!.variazioni, [
      { unitaId: 'u1', codice: 'A1', quote: [{ ripartizione: 'uso', da: null, a: 0 }] },
    ]);
  });

  it('separa le unità entrate da quelle uscite', () => {
    const [rev2] = variazioniTraRevisioni(
      [revisione(1, { u1: { diritto: 500 }, u2: { diritto: 500 } }), revisione(2, { u2: { diritto: 500 }, u3: { diritto: 500 } })],
      codici,
    );
    assert.deepEqual(rev2!.entrate, [{ unitaId: 'u3', codice: 'B1' }]);
    assert.deepEqual(rev2!.uscite, [{ unitaId: 'u1', codice: 'A1' }]);
    assert.deepEqual(rev2!.variazioni, []);
  });

  it('ordina dalla revisione più recente alla più vecchia', () => {
    const risultato = variazioniTraRevisioni(
      [revisione(2, { u1: { diritto: 1000 } }), revisione(1, { u1: { diritto: 1000 } })],
      codici,
    );
    assert.deepEqual(
      risultato.map((r) => r.revisione),
      [2, 1],
    );
  });
});
