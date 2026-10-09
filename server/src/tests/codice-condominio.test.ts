/**
 * Codice autogenerato del condominio: `prefissiDaNome` e `codiceSuccessivo`.
 *
 *   npm test
 *
 * Sono i due pezzi che decidono la forma del codice che finisce nei contratti,
 * e sono puri: il resto del generatore è una query e un `exists`. Il campo è di
 * 6 caratteri, quindi ogni aritmetica sbagliata qui produce un codice che o non
 * entra nel campo o non è quello che si credeva di emettere.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { codiceSuccessivo, prefissiDaNome } from '../services/condominio.service.js';

describe('prefissiDaNome', () => {
  it('prende le prime tre lettere del nome', () => {
    assert.deepEqual(prefissiDaNome('Residenza Aurora'), ['RES', 'RE', 'R']);
  });

  it('ignora cifre, spazi e segni di punteggiatura', () => {
    // Le cifre non sono lettere: un nome che comincia con "2" non deve
    // produrre un prefisso che comincia con un numero, altrimenti il confine
    // fra lettere e progressivo nel codice diventa ambiguo.
    assert.deepEqual(prefissiDaNome('2 Gamma'), ['GAM', 'GA', 'G']);
  });

  it('non confonde le lettere accentuate con quelle maiuscole', () => {
    // `À` non è `A` per `[A-Z]`: "Città Nuova" perde la à e non la rimpiazza,
    // altrimenti il prefisso dipenderebbe da come il browser ha composto
    // l'unicode del nome.
    assert.deepEqual(prefissiDaNome('Città Nuova'), ['CIT', 'CI', 'C']);
  });

  it('accorcia il prefisso se il nome ha meno di tre lettere', () => {
    // "Bo" non può diventare "BO" + 3 cifre senza stabilire quante cifre
    // mettere: se ne mette quattro il codice resta di 6 caratteri.
    assert.deepEqual(prefissiDaNome('Bo'), ['BO', 'B']);
  });

  it('usa un prefisso di ripiego quando il nome non ha lettere', () => {
    assert.deepEqual(prefissiDaNome('123'), ['CON', 'CO', 'C']);
  });
});

describe('codiceSuccessivo', () => {
  it('numera da 001 e riempie gli zeri', () => {
    assert.equal(codiceSuccessivo('RES', 0), 'RES001');
  });

  it('riprende dal numero successivo all\'ultimo emesso', () => {
    assert.equal(codiceSuccessivo('RES', 12), 'RES013');
  });

  it('riempie fino all\'ultimo numero che entra nel campo', () => {
    assert.equal(codiceSuccessivo('RES', 998), 'RES999');
  });

  it('rifiuta il progressivo quando le cifre non bastano più', () => {
    // Il chiamante passa al prefisso più corto: è `null`, non un codice
    // cresciuto a 7 caratteri che il campo rifiuterebbe.
    assert.equal(codiceSuccessivo('RES', 999), null);
  });

  it('allunga le cifre quando il prefisso è più corto', () => {
    assert.equal(codiceSuccessivo('RE', 999), 'RE1000');
    assert.equal(codiceSuccessivo('R', 99999), null);
    assert.equal(codiceSuccessivo('R', 0), 'R00001');
  });

  it('produce sempre codici di 6 caratteri', () => {
    for (const [prefisso, occupato] of [
      ['RES', 0],
      ['RE', 0],
      ['R', 0],
      ['BO', 0],
    ] as const) {
      assert.equal(codiceSuccessivo(prefisso, occupato)!.length, 6, `${prefisso} ${occupato}`);
    }
  });
});