/**
 * Popola il database con un condominio di esempio: utile per lo sviluppo
 * e per verificare il calcolo delle quote e la generazione dei verbali.
 *
 *   npm run seed              -> crea i dati demo
 *   npm run seed -- --reset   -> svuota prima tutte le collezioni
 */
import mongoose from 'mongoose';
import { config } from '../config/index.js';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../utils/logger.js';
import {
  Assemblea,
  Bilancio,
  Comunicazione,
  Condominio,
  Condomino,
  Contratto,
  MessaggioPiattaforma,
  PagamentoContratto,
  QuotaMillesimale,
  Unita,
  User,
  Verbale,
  Versamento,
} from '../models/index.js';
import { generaVerbale } from '../services/verbale.service.js';
import { calcolaQuoteMensili } from '../services/quoteVersamenti.service.js';
import { aggiungiMesi, generaRate } from '../services/contratto.service.js';

const reset = process.argv.includes('--reset');

async function svuota(): Promise<void> {
  // Si droppa la collezione (non solo i documenti) così spariscono anche gli
  // indici: utile dopo un cambio di schema durante lo sviluppo.
  //
  // L'elenco viene preso dal database con `listCollections`, non da
  // `connection.collections()`: quest'ultimo conosce solo i modelli già
  // registrati nel processo, quindi una collezione che il seed non tocca
  // resterebbe sul disco e `--reset` riporterebbe dati delle esecuzioni
  // precedenti.
  const db = mongoose.connection.db!;
  const elencate = await db.listCollections({}, { nameOnly: true }).toArray();
  const nomi = elencate.map((c) => c.name).filter((n) => !n.startsWith('system.'));

  for (const nome of nomi) {
    await db.dropCollection(nome).catch(() => undefined);
  }
  logger.info(`Collezioni rimosse: ${nomi.length}`);
}

async function seed(): Promise<void> {
  await connectDatabase();
  if (reset) await svuota();

  // ---- Amministratore di sistema ----
  // Può creare altri amministratori e vede tutti i condomini. È l'unico
  // modo per ottenere questo ruolo: non esiste una rotta che lo promuova.
  const superadminPassword = await User.hashPassword(config.seed.superadminPassword);
  const superadmin = await User.findOneAndUpdate(
    { email: config.seed.superadminEmail },
    {
      email: config.seed.superadminEmail,
      nome: 'Super',
      cognome: 'Amministratore',
      role: 'superadmin',
      password: superadminPassword,
      permessi: null,
      attivo: true,
    // Gli account demo sono gia' confermati: senza questo l'accesso ai
    // pannelli funzionerebbe ma tutti mostrerebbero l'avviso di conferma.
    emailConfermato: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  // ---- Amministratore ----
  const adminPassword = await User.hashPassword(config.seed.adminPassword);
  const admin = await User.findOneAndUpdate(
    { email: config.seed.adminEmail },
    {
      email: config.seed.adminEmail,
      nome: 'Laura',
      cognome: 'Bianchi',
      role: 'admin',
      telefono: '+39 333 1234567',
      password: adminPassword,
      permessi: null,
      attivo: true,
    // Gli account demo sono gia' confermati: senza questo l'accesso ai
    // pannelli funzionerebbe ma tutti mostrerebbero l'avviso di conferma.
    emailConfermato: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  // ---- Condomini ----
  const condominio = await Condominio.findOneAndUpdate(
    { codice: 'VDA001' },
    {
      nome: 'Residenza Aurora',
      codice: 'VDA001',
      indirizzo: { via: 'Via delleQuerce', civico: '12', citta: 'Milano', cap: '20121', provincia: 'MI' },
      amministratore: admin._id,
      deliberaRipartizione: 'Delibera assemblea del 15/03/2024 n. 12/2024',
      dataDeliberaRipartizione: new Date('2024-03-15'),
      totaleMillesimi: 1000,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const condominio2 = await Condominio.findOneAndUpdate(
    { codice: 'BGO002' },
    {
      nome: 'Residenza Belvedere',
      codice: 'BGO002',
      indirizzo: { via: 'Via Belvedere', civico: '5', citta: 'Bergamo', cap: '24121', provincia: 'BG' },
      amministratore: admin._id,
      totaleMillesimi: 1000,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  // ---- Unità ----
  const definizioniUnita = [
    { codice: 'A1', piano: 1, tipo: 'appartamento', metratura: 85, vani: 3 },
    { codice: 'A2', piano: 1, tipo: 'appartamento', metratura: 70, vani: 3 },
    { codice: 'B1', piano: 2, tipo: 'appartamento', metratura: 95, vani: 4 },
    { codice: 'B2', piano: 2, tipo: 'appartamento', metratura: 60, vani: 2 },
    { codice: 'C1', piano: 3, tipo: 'appartamento', metratura: 120, vani: 4 },
    { codice: 'G1', piano: -1, tipo: 'garage', metratura: 18 },
  ] as const;

  const unita: Record<string, mongoose.Types.ObjectId> = {};
  for (const def of definizioniUnita) {
    const doc = await Unita.findOneAndUpdate(
      { condominio: condominio._id, codice: def.codice },
      { ...def, condominio: condominio._id, attiva: true },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    unita[def.codice] = doc._id as mongoose.Types.ObjectId;
  }

  // ---- Quote millesimali: ogni ripartizione in uso deve sommare esattamente 1000 ----
  // L'edificio non ha ascensore, quindi la ripartizione "ascensore" non viene
  // introdotta: una ripartizione assente non è soggetta al vincolo dei 1000.
  const quotePerUnita: Record<string, { diritto: number; uso: number; spese: number; scale: number }> = {
    A1: { diritto: 180, uso: 190, spese: 200, scale: 200 },
    A2: { diritto: 150, uso: 160, spese: 170, scale: 200 },
    B1: { diritto: 220, uso: 230, spese: 210, scale: 200 },
    B2: { diritto: 130, uso: 140, spese: 150, scale: 200 },
    C1: { diritto: 260, uso: 220, spese: 210, scale: 200 },
    G1: { diritto: 60, uso: 60, spese: 60, scale: 0 },
  };

  for (const ripartizione of ['diritto', 'uso', 'spese', 'scale'] as const) {
    for (const def of definizioniUnita) {
      await QuotaMillesimale.findOneAndUpdate(
        { unita: unita[def.codice], ripartizione, revisione: 1 },
        {
          condominio: condominio._id,
          unita: unita[def.codice],
          ripartizione,
          valore: quotePerUnita[def.codice]![ripartizione],
          revisione: 1,
          validFrom: new Date('2024-04-01'),
          validTo: null,
          delibera: 'Delibera assemblea del 15/03/2024 n. 12/2024',
          dataDelibera: new Date('2024-03-15'),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    }
  }

  // ---- Condòmini ----
  const persone = [
    { email: 'marco.rossi@example.com', nome: 'Marco', cognome: 'Rossi', telefono: '+39 340 1112222', unita: ['A1'] },
    { email: 'giulia.verdi@example.com', nome: 'Giulia', cognome: 'Verdi', telefono: '+39 340 3334444', unita: ['A2'] },
    { email: 'luca.bianchi@example.com', nome: 'Luca', cognome: 'Bianchi', telefono: '+39 340 5556666', unita: ['B1'] },
    { email: 'anna.neri@example.com', nome: 'Anna', cognome: 'Neri', telefono: '+39 340 7778888', unita: ['B2', 'G1'] },
    { email: 'paolo.ricci@example.com', nome: 'Paolo', cognome: 'Ricci', telefono: '+39 340 9990000', unita: ['C1'] },
  ];

  for (const persona of persone) {
    const utente = await User.findOneAndUpdate(
      { email: persona.email },
      {
        email: persona.email,
        nome: persona.nome,
        cognome: persona.cognome,
        role: 'condomino',
        telefono: persona.telefono,
        password: await User.hashPassword('Condomino123!'),
        attivo: true,
    // Gli account demo sono gia' confermati: senza questo l'accesso ai
    // pannelli funzionerebbe ma tutti mostrerebbero l'avviso di conferma.
    emailConfermato: true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    await Condomino.findOneAndUpdate(
      { condominio: condominio._id, utente: utente._id },
      {
        condominio: condominio._id,
        utente: utente._id,
        unita: persona.unita.map((c) => unita[c]!),
        regime: 'proprietario',
        quota: 100,
        primario: true,
        attivo: true,
    // Gli account demo sono gia' confermati: senza questo l'accesso ai
    // pannelli funzionerebbe ma tutti mostrerebbero l'avviso di conferma.
    emailConfermato: true,
        dataInizio: new Date('2024-01-01'),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  // Un inquilino per dimostrare la distinzione di regime.
  const fabio = await User.findOneAndUpdate(
    { email: 'elena.gallo@example.com' },
    {
      email: 'elena.gallo@example.com',
      nome: 'Elena',
      cognome: 'Gallo',
      role: 'condomino',
      password: await User.hashPassword('Condomino123!'),
      attivo: true,
    // Gli account demo sono gia' confermati: senza questo l'accesso ai
    // pannelli funzionerebbe ma tutti mostrerebbero l'avviso di conferma.
    emailConfermato: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await Condomino.findOneAndUpdate(
    { condominio: condominio._id, utente: fabio._id },
    {
      condominio: condominio._id,
      utente: fabio._id,
      unita: [unita.A1!],
      regime: 'inquilino',
      quota: 100,
      primario: false,
      attivo: true,
    // Gli account demo sono gia' confermati: senza questo l'accesso ai
    // pannelli funzionerebbe ma tutti mostrerebbero l'avviso di conferma.
    emailConfermato: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  // ---- Bilancio ----
  // L'anno corrente resta senza approvazione: è il bilancio che l'amministratore
  // sta ancora correggendo voce per voce, e l'approvazione arriva con
  // l'assemblea. Quello dell'anno precedente è approvato e ha il consuntivo:
  // serve a mostrare il confronto previsto/realizzato.
  const anno = new Date().getFullYear();
  const annoPrecedente = anno - 1;

  const vociPreventivo = [
    { categoria: 'gestione', descrizione: 'Compenso amministratore', importo: 3_600, ripartizione: 'diritto' },
    { categoria: 'pulizie', descrizione: 'Pulizia scale e locali comuni', importo: 2_400, ripartizione: 'diritto' },
    { categoria: 'ascensore', descrizione: 'Manutenzione ascensore', importo: 1_800, ripartizione: 'diritto' },
    { categoria: 'energia', descrizione: 'Energia elettrica aree comuni', importo: 1_200, ripartizione: 'uso' },
    { categoria: 'acqua', descrizione: 'Acqua e riscaldamento', importo: 4_000, ripartizione: 'uso' },
    { categoria: 'assicurazione', descrizione: 'Polizza RC e danni', importo: 900, ripartizione: 'spese' },
    { categoria: 'fondo', descrizione: 'Accantonamento fondo scale', importo: 2_000, ripartizione: 'diritto' },
  ];
  const totale = vociPreventivo.reduce((s, v) => s + v.importo, 0);

  await Bilancio.findOneAndUpdate(
    { condominio: condominio._id, anno, tipo: 'preventivo' },
    {
      condominio: condominio._id,
      anno,
      tipo: 'preventivo',
      descrizione: `Bilancio preventivo ${anno}`,
      approvato: false,
      totale,
      voci: vociPreventivo,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  // Anno precedente: preventivo ratificato e consuntivo in parte compilato.
  await Bilancio.findOneAndUpdate(
    { condominio: condominio._id, anno: annoPrecedente, tipo: 'preventivo' },
    {
      condominio: condominio._id,
      anno: annoPrecedente,
      tipo: 'preventivo',
      descrizione: `Bilancio preventivo ${annoPrecedente}`,
      approvato: true,
      totale,
      voci: vociPreventivo,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await Bilancio.findOneAndUpdate(
    { condominio: condominio._id, anno: annoPrecedente, tipo: 'consuntivo' },
    {
      condominio: condominio._id,
      anno: annoPrecedente,
      tipo: 'consuntivo',
      descrizione: `Consuntivo ${annoPrecedente}`,
      approvato: false,
      totalePrevisto: totale,
      totale: 0,
      voci: vociPreventivo.map((v, i) => ({
        categoria: v.categoria,
        descrizione: v.descrizione,
        ripartizione: v.ripartizione,
        previsto: v.importo,
        // Qualche voce è andata sopra, qualcuna sotto: senza scostamenti il
        // confronto del consuntivo non si capirebbe.
        importo: i === 0 ? 3_900 : i === 2 ? 2_650 : i === 5 ? 900 : v.importo,
        voci: [],
      })),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  // ---- Assemblea con verbale ----
  const assemblea = await Assemblea.findOneAndUpdate(
    { condominio: condominio._id, numero: 1, tipo: 'ordinaria' },
    {
      condominio: condominio._id,
      numero: 1,
      tipo: 'ordinaria',
      stato: 'conclusa',
      data: new Date('2024-05-20'),
      oraInizio: '18:00',
      oraChiusura: '20:15',
      luogo: 'Sala riunioni del condominio',
      presiedutaDa: admin._id,
      quattordiciGgiorni: false,
      ordineDelGiorno: [
        { ordine: 1, titolo: 'Approvazione del bilancio consuntivo 2023', descrizione: 'Presentazione del consuntivo e votazione.', riservata: false, allegati: [] },
        { ordine: 2, titolo: 'Approvazione del bilancio preventivo 2024', descrizione: 'Discussione delle voci di spesa.', riservata: false, allegati: [] },
        { ordine: 3, titolo: 'Manutenzione del tetto del garage', descrizione: 'Preventivo della ditta EdilPro.', riservata: false, allegati: [] },
      ],
      deliberaApprovata: true,
      millesimiTotali: 1000,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  // Presenze e votazioni, se il verbale non esiste ancora.
  const verbaleEsistente = await Verbale.exists({ assemblea: assemblea._id });
  if (!verbaleEsistente) {
    const legs = await Condomino.find({ condominio: condominio._id, attivo: true, primario: true }).lean();
    assemblea.presenze = legs.slice(0, 4).map((l, i) => ({
      condomino: l._id,
      presente: true,
      delegaA: i === 3 ? legs[0]?._id : undefined,
    }));
    assemblea.votazioni = [
      { ordine: 1, esito: 'approvato', votiFavorevoli: 520, votiContrari: 60, astenuti: 0, segreta: false },
      { ordine: 2, esito: 'approvato', votiFavorevoli: 480, votiContrari: 100, astenuti: 0, segreta: false },
      { ordine: 3, esito: 'rinviato', votiFavorevoli: 300, votiContrari: 250, astenuti: 30, segreta: false, motivoRinvio: 'Si attende il preventivo definitivo del direttore dei lavori.' },
    ];
    assemblea.ordineDelGiorno.forEach((p) => {
      p.delibera =
        p.ordine === 1
          ? 'Il bilancio consuntivo dell’anno 2023 è approvato alle ore 19:05, con votazione palese.'
          : p.ordine === 2
            ? 'Il bilancio preventivo per l’esercizio 2024 è approvato alle ore 19:35, con votazione palese.'
            : undefined;
    });
    await assemblea.save();

    await generaVerbale(String(assemblea._id), String(admin._id));
  }

  // ---- Versamenti di esempio per il mese corrente ----
  // Gli importi sono calcolati con lo stesso servizio usato dall'API, così il
  // seed produce uno scenario realistico: tre pagamenti corretti, uno parziale
  // e un moroso.
  const meseCorrente = new Date().getMonth() + 1;
  const riepilogo = await calcolaQuoteMensili(String(condominio._id), anno, meseCorrente);
  /** Frazione della quota effettivamente versata, per codice unità. */
  const frazioneVersata: Record<string, number> = {
    A1: 1,
    A2: 1,
    B1: 0.5,
    B2: 1,
    G1: 1,
    C1: 0,
  };

  for (const riga of riepilogo.righe) {
    const frazione = frazioneVersata[riga.codice];
    if (!frazione) continue;

    const importo = Math.round(riga.totale * frazione * 100) / 100;
    if (importo <= 0) continue;

    const esiste = await Versamento.exists({
      condominio: condominio._id,
      unita: riga.unitaId,
      periodo: { anno, mese: meseCorrente },
    });
    if (esiste) continue;

    const legame = await Condomino.findOne({ condominio: condominio._id, unita: riga.unitaId, primario: true });
    await Versamento.create({
      condominio: condominio._id,
      unita: riga.unitaId,
      condomino: legame?.utente,
      periodo: { anno, mese: meseCorrente },
      importo,
      dataVersamento: new Date(),
      metodo: 'bonifico',
      causale: `Quota condominiale ${anno}/${meseCorrente} - ${riga.codice}`,
      registratoDa: admin._id,
    });
  }

  // ---- Comunicazione di esempio ----
  await Comunicazione.findOneAndUpdate(
    { condominio: condominio._id, oggetto: 'Convocazione assemblea ordinaria', tipo: 'convocazione' },
    {
      condominio: condominio._id,
      assemblea: assemblea._id,
      tipo: 'convocazione',
      stato: 'inviata',
      mittente: admin._id,
      oggetto: 'Convocazione assemblea ordinaria',
      corpo: 'Gentile condomino, è indetta per il 20 maggio l’assemblea ordinaria. In allegato l’ordine del giorno.',
      allegati: [],
      dataInvio: new Date('2024-05-06'),
      richiedeRisposta: false,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  // ---- Assistente con permessi delegati ----
  // Delega volutamente parziale: può registrare versamenti e leggere le quote,
  // ma non può toccare assemblee, verbali, bilanci o la tabella millesimale.
  const assistentePassword = await User.hashPassword('Assistente123!');
  const assistente = await User.findOneAndUpdate(
    { email: 'assistente@example.com' },
    {
      email: 'assistente@example.com',
      nome: 'Andrea',
      cognome: 'Ferrari',
      role: 'admin',
      telefono: '+39 333 5556677',
      password: assistentePassword,
      permessi: ['versamenti:scrivere'],
      delegatoDa: admin._id,
      dataDelega: new Date(),
      attivo: true,
    // Gli account demo sono gia' confermati: senza questo l'accesso ai
    // pannelli funzionerebbe ma tutti mostrerebbero l'avviso di conferma.
    emailConfermato: true,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await Condominio.updateOne({ _id: condominio._id }, { $addToSet: { assistenti: assistente._id } });

  // ---- Contratto di fornitura ----
  // L'amministratore demo amministra 8 unità: il contratto ne copre 20, quindi
  // può ancora aggiungere condomini senza sforare la capacità pattuita.
  const durataMesi = 24;
  const dataInizio = new Date();
  dataInizio.setMonth(dataInizio.getMonth() - 6);
  const nuovaData = new Date();

  const contratto = await Contratto.findOneAndUpdate(
    { amministratore: admin._id, stato: { $ne: 'cessato' } },
    {
      codice: 'CTR-DEMO-001',
      amministratore: admin._id,
      stato: 'attivo',
      unitaMassime: 20,
      costo: 1200,
      periodicita: 'annuale',
      durataMesi,
      dataInizio,
      dataScadenza: aggiungiMesi(dataInizio, durataMesi),
      mesiProroga: 12,
      rinnovoAutomatico: false,
      note: 'Contratto dimostrativo stipulato a titolo di esempio.',
      creatoDa: superadmin._id,
      storico: [
        {
          data: dataInizio,
          azione: 'stipula',
          a: 'attivo',
          nota: '20 unità immobiliari a 1200 € per 24 mesi',
          operatore: superadmin._id,
        },
      ],
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await generaRate(contratto, 1, durataMesi);
  // La prima rata risulta già incassata, così la pagina mostra un caso realistico.
  const primaRata = await PagamentoContratto.findOne({ contratto: contratto._id, progressivo: 1 }).lean();
  if (primaRata && primaRata.stato === 'da_pagare') {
    await PagamentoContratto.updateOne(
      { _id: primaRata._id },
      {
        $set: {
          stato: 'pagato',
          dataPagamento: nuovaData,
          identificativoTransazione: 'BONIFICO-DEMO-001',
          quietanza: 'Q/2026/0001',
        },
      },
    );
  }

  await MessaggioPiattaforma.create({
    contratto: contratto._id,
    mittente: superadmin._id,
    destinatario: admin._id,
    tipo: 'avviso',
    oggetto: 'Benvenuto sulla piattaforma',
    corpo:
      'Il tuo contratto è attivo: puoi amministrare fino a 20 unità immobiliari. Questa è la tua area riservata, ' +
      'dove trovi rate, scadenze e messaggi del servizio.',
    lettoDa: [],
  });

  logger.info('Seed completato');
  logger.info(`  Amministratore di sistema: ${config.seed.superadminEmail} / ${config.seed.superadminPassword}`);
  logger.info(`  Amministratore:           ${config.seed.adminEmail} / ${config.seed.adminPassword}`);
  logger.info('  Assistente (delegato):  assistente@example.com / Assistente123!');
  logger.info('                         può solo registrare versamenti');
  logger.info('  Condòmini:              marco.rossi@example.com / Condomino123!');
  logger.info(`  Condomini:              ${(await Condominio.countDocuments({ amministratore: admin._id }))} (${condominio.nome}, ${condominio2.nome})`);
}

seed()
  .then(() => disconnectDatabase())
  .then(() => process.exit(0))
  .catch(async (err) => {
    logger.error('Seed fallito', err);
    await disconnectDatabase().catch(() => undefined);
    process.exit(1);
  });
