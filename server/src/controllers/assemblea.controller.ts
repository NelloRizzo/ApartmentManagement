import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created, noContent, paginated } from '../utils/http.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { paginazioneDa, regexDaTesto } from '../utils/pagination.js';
import { Assemblea, Condomino, Condominio, Unita, User, Verbale, type AssembleaDoc } from '../models/index.js';
import { currentUser } from '../middleware/auth.js';
import { auditLog } from '../services/audit.service.js';
import { buildTabella } from '../services/tabellaMillesimale.service.js';
import { millesimiDiCondomino } from '../services/verbale.service.js';
import {
  assicuraAssembleaModificabile,
  completaConvocati,
  nextNumeroAssemblea,
  puoTransizionare,
  STATI_VISIBILI,
  transizioniConsentite,
  testoConvocazione,
  validaChiusura,
  visibileAlCondomino,
} from '../services/assemblea.service.js';
import { modelliOrdineDelGiorno, puntoDaModello } from '../services/modelliOrdine.service.js';
import { toAllegati } from '../middleware/upload.js';
import { allegaA, staccaDa, espandiAnnidati } from '../services/allegato.service.js';

const oid = (v: string): Types.ObjectId => new Types.ObjectId(String(v));

export const list = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const q = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    sort: string;
    order: 'asc' | 'desc';
    stato?: string;
    tipo?: string;
  };
  const { page, limit, sort, order } = paginazioneDa(q, 'data');

  const query: Record<string, unknown> = { condominio: oid(req.params.condominioId!) };
  if (q.stato) query.stato = q.stato;
  if (q.tipo) query.tipo = q.tipo;
  if (q.search) {
    query.$or = [{ note: regexDaTesto(q.search) }, { 'ordineDelGiorno.titolo': regexDaTesto(q.search) }];
  }

  if (utente.role === 'condomino') {
    const legs = await Condomino.find({ condominio: req.params.condominioId, utente: utente.sub, attivo: true })
      .select('_id')
      .lean();
    // Un condòmino vede solo le assemblee convocate o già svolte in cui è iscritto.
    query.stato = q.stato
      ? { $in: STATI_VISIBILI.filter((s) => s === q.stato) }
      : { $in: [...STATI_VISIBILI] };
    query.$and = [{ presenze: { $elemMatch: { condomino: { $in: legs.map((l) => l._id) } } } }];
  }

  const [documenti, totale] = await Promise.all([
    Assemblea.find(query)
      .populate('presiedutaDa', 'nome cognome')
      .populate('segretario', 'nome cognome')
      .sort({ [sort]: order === 'asc' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Assemblea.countDocuments(query),
  ]);

  const verbali = await Verbale.find({ assemblea: { $in: documenti.map((d) => d._id) } })
    .select('assemblea numero approvato')
    .lean();
  const verbalePerAssemblea = new Map(verbali.map((v) => [String(v.assemblea), v]));

  paginated(
    res,
    documenti.map((d) => ({
      ...d,
      // Il conteggio dei presenti serve alla dashboard: `millesimiPresenti` da
      // solo non dice quante persone sono in sala, e a frazionee diverse.
      numeroPresenti: d.presenze.filter((p) => p.presente).length,
      verbale: verbalePerAssemblea.get(String(d._id)) ?? null,
      // Foglio delle presenze ed esito delle votazioni non sono dati del
      // condòmino, che qui riceveva per intero un documento che `getOne` gli
      // restituiva già privato. I totali restano: sono il riepilogo che
      // l'assemblea stessa pubblica.
      ...(utente.role === 'condomino' ? { presenze: [], votazioni: [] } : {}),
    })),
    totale,
    page,
    limit,
  );
});

/**
 * Le assemblee che un condòmino è tenuto a vedere.
 *
 * Come nella lista: solo quelle già convocate, mai bozze e annullate, e solo
 * quelle in cui ha una riga di presenza. `getOne` non aveva nessun controllo e
 * restituiva a chiunque qualunque assemblea dello stabile per id.
 */
async function assicuraVisibileAlCondomino(
  assemblea: AssembleaDoc,
  condominioId: string,
  utenteId: string,
): Promise<void> {
  const visibile =
    visibileAlCondomino(assemblea.stato) &&
    (await Condomino.exists({ condominio: condominioId, utente: utenteId, attivo: true })) !== null;
  if (!visibile) throw notFound('Assemblea non trovata');
}

export const getOne = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const assemblea = await Assemblea.findOne({ _id: req.params.id, condominio: req.params.condominioId })
    .populate('presiedutaDa', 'nome cognome email')
    .populate('segretario', 'nome cognome email')
    .lean<AssembleaDoc>();
  if (!assemblea) throw notFound('Assemblea non trovata');

  const condominio = utente.role === 'condomino';
  if (condominio) await assicuraVisibileAlCondomino(assemblea, req.params.condominioId!, utente.sub);

  const [verbale, condomini] = await Promise.all([
    Verbale.findOne({ assemblea: assemblea._id }).select('-testo').lean(),
    // L'elenco dei condòmini serve a chi presiede: è il foglio delle presenze.
    // Per un condòmino è un documento dello stabio, quindi non lo riceve.
    condominio
      ? Promise.resolve([])
      : Condomino.find({ condominio: assemblea.condominio, attivo: true })
          .populate('utente', 'nome cognome')
          .populate('unita', 'codice')
          .lean(),
  ]);

  // Gli allegati sono sui punti all'ordine del giorno, quindi annidati. Qui prima
  // c'era un `populate('allegati')` sull'assemblea: con `strictPopulate` attivo
  // avrebbe fatto fallire la rotta appena tolto quel campo.
  const conAllegati = (await espandiAnnidati([assemblea], 'ordineDelGiorno'))[0]!;

  if (!condominio) {
    ok(res, {
      ...conAllegati,
      verbale: verbale ?? null,
      elencoCondomini: condomini,
      transizioniConsentite: transizioniConsentite(assemblea.stato),
    });
    return;
  }

  /*
   * Il condòmino vede il materiale della convocazione e nient'altro: le
   * presenze dicono chi c'era e chi no, le votazioni dicono come ha votato
   * ciascuno, e le transizioni sono un comando dell'amministratore. Nessuno dei
   * tre è un dato suo.
   */
  const ordineDelGiorno =
    assemblea.stato === 'convocata'
      ? conAllegati.ordineDelGiorno.map((p) => {
          const resto = { ...p };
          delete resto.delibera;
          return resto;
        })
      : conAllegati.ordineDelGiorno;

  ok(res, {
    ...conAllegati,
    ordineDelGiorno,
    presenze: [],
    votazioni: [],
    presiedutaDa: assemblea.presiedutaDa ?? null,
    segretario: assemblea.segretario ?? null,
    verbale: null,
    elencoCondomini: [],
    transizioniConsentite: [],
    /** Non è un semplice filtro: i campi mancanti restano, e il frontend deve poter dire perché. */
    solaLettura: true,
  });
});

export const create = asyncHandler(async (req, res) => {
  const condominioId = req.params.condominioId!;
  const body = req.body as { tipo: 'ordinaria' | 'straordinaria'; data: Date };

  const ultimo = await Assemblea.findOne({ condominio: condominioId, tipo: body.tipo })
    .sort({ numero: -1 })
    .select('numero')
    .lean();

  const assemblea = await Assemblea.create({
    ...req.body,
    condominio: oid(condominioId),
    numero: nextNumeroAssemblea(ultimo?.numero),
    stato: 'bozza',
    // Il totale di millesimi è noto già alla convocazione: senza, la dashboard
    // non ha nulla da mostrare finché non vengono salvate le presenze.
    millesimiTotali: (await buildTabella(condominioId)).totale.diritto || 1000,
    millesimiPresenti: 0,
  });

  await auditLog({
    condominio: condominioId,
    attore: currentUser(req).sub,
    azione: 'creazione',
    entita: 'Assemblea',
    entitaId: String(assemblea._id),
    dettagli: { numero: assemblea.numero, data: assemblea.data },
    req,
  });

  created(res, assemblea);
});

/**
 * Conta le assemblee che il chiamante deve ancora vedere.
 *
 * Stessa regola di `list`, e come `contaNonLette` parte dallo stesso filtro
 * invece di contare tutto e togliere: due calcoli che partono da domande diverse
 * divergono, e il badge deve contare le stesse cose che l'elenco mostra.
 *
 * `odgVistoDa` è un array per utente, non uno stato: l'assemblea è un documento
 * unico e "l'ho letto" riguarda chi legge. Se il badge guardasse `stato`, la
 * prima lettura lo azzererebbe per tutti.
 */
export const contaDaVedere = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const condominioId = req.params.condominioId!;

  if (utente.role !== 'condomino') {
    ok(res, { daVedere: 0 });
    return;
  }

  const id = new Types.ObjectId(String(utente.sub));
  const legs = await Condomino.find({ condominio: condominioId, utente: utente.sub, attivo: true })
    .select('_id')
    .lean();

  const daVedere = await Assemblea.countDocuments({
    $and: [
      { condominio: oid(condominioId) },
      // Conclusa non conta più: l'ODG si legge prima, e dopo l'assemblea è il
      // verbale il documento che conta.
      { stato: { $in: ['convocata', 'in_corso'] } },
      { presenze: { $elemMatch: { condomino: { $in: legs.map((l) => l._id) } } } },
      { odgVistoDa: { $ne: id } },
    ],
  });

  ok(res, { daVedere });
});

/**
 * Segna l'ordine del giorno come visto.
 *
 * Serve al badge, non al permesso: anche un condòmino che non amministra ha un
 * diritto di lettura su questo documento, perché `requirePermessoLettura` lascia
 * passare chi non è admin e il confine è dentro il controller.
 */
export const segnaVisto = asyncHandler(async (req, res) => {
  const utente = currentUser(req);
  const assemblea = await Assemblea.findOne({ _id: req.params.id, condominio: req.params.condominioId }).lean<AssembleaDoc>();
  if (!assemblea) throw notFound('Assemblea non trovata');
  if (utente.role === 'condomino') {
    await assicuraVisibileAlCondomino(assemblea, req.params.condominioId!, utente.sub);
  }

  await Assemblea.updateOne(
    { _id: assemblea._id },
    { $addToSet: { odgVistoDa: new Types.ObjectId(String(utente.sub)) } },
  );

  ok(res, { visto: true });
});

export const update = asyncHandler(async (req, res) => {
  const assemblea = await Assemblea.findOne({ _id: req.params.id, condominio: req.params.condominioId });
  if (!assemblea) throw notFound('Assemblea non trovata');
  if (assemblea.stato === 'conclusa') throw conflict('Un’assemblea conclusa non è più modificabile');

const aggiornata = await Assemblea.findOneAndUpdate(
    { _id: assemblea._id, condominio: assemblea.condominio },
    req.body,
    { new: true, runValidators: true },
  );
  // Il filtro è lo stesso della `findOne` qui sopra: se il doc esisteva, esiste
  // ancora. Il controllo serve a non passare `null` al resto della risposta.
  if (!aggiornata) throw notFound('Assemblea non trovata');

  // Stessa ragione di `changeState`: se il PATCH ha portato l'assemblea fra gli
  // stati visibili, i convocati vanno scritti adesso o il condòmino non la
  // vedrebbe.
  if (visibileAlCondomino(aggiornata.stato)) {
    await completaConvocati(aggiornata);
    await aggiornata.save();
  }

  await auditLog({
    condominio: String(assemblea.condominio),
    attore: currentUser(req).sub,
    azione: 'aggiornamento',
    entita: 'Assemblea',
    entitaId: String(assemblea._id),
    dettagli: req.body,
    req,
  });

  // `transizioniConsentite` serve alla UI dopo un salvataggio: se il PATCH ha
  // cambiato lo stato, l'elenco delle prossime mosse va ricalcolato.
ok(res, { ...aggiornata.toObject(), transizioniConsentite: transizioniConsentite(aggiornata.stato) });
});

export const changeState = asyncHandler(async (req, res) => {
  const { stato } = req.body as { stato: AssembleaDoc['stato'] };
  const assemblea = await Assemblea.findOne({ _id: req.params.id, condominio: req.params.condominioId });
  if (!assemblea) throw notFound('Assemblea non trovata');

  if (!puoTransizionare(assemblea.stato, stato)) {
    throw conflict(`Transizione non consentita da "${assemblea.stato}" a "${stato}"`);
  }

  if (stato === 'conclusa') await validaChiusura(assemblea);

assemblea.stato = stato;
  if (stato === 'convocata' && !assemblea.dataConvocazione) assemblea.dataConvocazione = new Date();
  if (stato === 'conclusa') assemblea.dataChiusura = new Date();
  // L'elenco dei convocati nasce con la convocazione: è la riga che la lista e
  // il badge del condòmino cercano, e aspettare il foglio presenze (che si
  // compila durante l'assemblea) lascerebbe la convocazione invisibile.
  if (visibileAlCondomino(stato)) await completaConvocati(assemblea);
  await assemblea.save();

  await auditLog({
    condominio: req.params.condominioId,
    attore: currentUser(req).sub,
    azione: `cambio_stato_${stato}`,
    entita: 'Assemblea',
    entitaId: String(assemblea._id),
    req,
  });

  ok(res, { ...assemblea.toObject(), transizioniConsentite: transizioniConsentite(assemblea.stato) });
});

export const salvaPresenze = asyncHandler(async (req, res) => {
  const { presenze } = req.body as { presenze: AssembleaDoc['presenze'] };
  const assemblea = await Assemblea.findOne({ _id: req.params.id, condominio: req.params.condominioId });
  if (!assemblea) throw notFound('Assemblea non trovata');
  if (assemblea.stato === 'conclusa') throw conflict('Assemblea conclusa: presenze non modificabili');

  const validi = await Condomino.find({ _id: { $in: presenze.map((p) => p.condomino) } })
    .select('_id condominio')
    .lean();
  const idValidi = new Set(validi.map((c) => String(c._id)));
  const estranei = presenze.filter((p) => !idValidi.has(String(p.condomino)));
  if (estranei.length > 0) throw badRequest('Presenze riferite a condòmini non presenti nel condominio');

  assemblea.presenze = presenze;
  // Vanno scritti entrambi: la dashboard mostra il rapporto
  // presenti/totale, e lasciare il totale a zero fa leggere "180/0 millesimi".
  // Il totale era valorizzato solo alla chiusura dell'assemblea.
  const conteggi = await ricalcola(assemblea);
  assemblea.millesimiPresenti = conteggi.millesimiPresenti;
  assemblea.millesimiTotali = conteggi.millesimiTotali;

  await assemblea.save();
  ok(res, assemblea);
});

export const salvaVotazioni = asyncHandler(async (req, res) => {
  const { votazioni } = req.body as { votazioni: AssembleaDoc['votazioni'] };
  const assemblea = await Assemblea.findOne({ _id: req.params.id, condominio: req.params.condominioId });
  if (!assemblea) throw notFound('Assemblea non trovata');
  if (assemblea.stato === 'conclusa') throw conflict('Assemblea conclusa: votazioni non modificabili');

  const ordini = new Set(assemblea.ordineDelGiorno.map((p) => p.ordine));
  const errate = votazioni.filter((v) => !ordini.has(v.ordine));
  if (errate.length > 0) throw badRequest('Votazioni riferite a punti inesistenti', errate.map((v) => v.ordine));

  assemblea.votazioni = votazioni;
  await assemblea.save();
  ok(res, assemblea);
});

export const salvaDelibera = asyncHandler(async (req, res) => {
  const { ordine, delibera } = req.body as { ordine: number; delibera: string };
  const assemblea = await Assemblea.findOne({ _id: req.params.id, condominio: req.params.condominioId });
  if (!assemblea) throw notFound('Assemblea non trovata');

  const punto = assemblea.ordineDelGiorno.find((p) => p.ordine === ordine);
  if (!punto) throw notFound('Punto dell’ordine del giorno non trovato');

  punto.delibera = delibera;
  await assemblea.save();

  const verbale = await Verbale.findOne({ assemblea: assemblea._id });
  if (verbale?.approvato) {
    verbale.approvato = false;
    await verbale.save();
  }

  ok(res, assemblea);
});

/** Ricalcola i millesimi rappresentati dalle presenze. */
async function ricalcola(assemblea: AssembleaDoc): Promise<{ millesimiPresenti: number; millesimiTotali: number }> {
  const [tabella, condomini] = await Promise.all([
    buildTabella(String(assemblea.condominio)),
    Condomino.find({ _id: { $in: assemblea.presenze.map((p) => p.condomino) } }).lean(),
  ]);

  const quotaPerUnita = new Map(tabella.righe.map((r) => [r.unitaId, r.quote.diritto]));
  const millesimiTotali = tabella.totale.diritto || 1000;

  const millesimiPresenti = condomini
    .filter((c) => assemblea.presenze.some((p) => String(p.condomino) === String(c._id) && p.presente))
    .reduce((s, c) => s + millesimiDiCondomino(c, quotaPerUnita), 0);

  return { millesimiPresenti: Number(millesimiPresenti.toFixed(2)), millesimiTotali };
}

export const ricalcolaMillesimi = asyncHandler(async (req, res) => {
  const assemblea = await Assemblea.findOne({ _id: req.params.id, condominio: req.params.condominioId });
  if (!assemblea) throw notFound('Assemblea non trovata');
  const risultato = await ricalcola(assemblea);
  assemblea.millesimiPresenti = risultato.millesimiPresenti;
  assemblea.millesimiTotali = risultato.millesimiTotali;
  await assemblea.save();
  ok(res, risultato);
});

/** Anteprima del testo di convocazione per i condomini selezionati. */
export const anteprimaConvocazione = asyncHandler(async (req, res) => {
  const assemblea = await Assemblea.findOne({ _id: req.params.id, condominio: req.params.condominioId })
    .lean<AssembleaDoc>();
  if (!assemblea) throw notFound('Assemblea non trovata');

  const condominio = await Condominio.findById(assemblea.condominio).lean();
  const amministratore = await User.findById(condominio!.amministratore).select('nome cognome').lean();

  ok(res, {
    testo: testoConvocazione({
      numero: assemblea.numero,
      tipo: assemblea.tipo,
      data: assemblea.data,
      oraInizio: assemblea.oraInizio,
      luogo: assemblea.luogo,
      condomini: [],
      unita: [],
      ordineDelGiorno: assemblea.ordineDelGiorno,
      amministratore: amministratore ?? { nome: '', cognome: '' },
      condominio: {
        nome: condominio!.nome,
        indirizzo: condominio!.indirizzo,
      },
    }),
  });
});

/** Elenco completo con voti per unità, utile al frontend di verbalizzazione. */
export const dettaglioVerbale = asyncHandler(async (req, res) => {
  const assemblea = await Assemblea.findOne({ _id: req.params.id, condominio: req.params.condominioId })
    .populate('presiedutaDa', 'nome cognome')
    .populate('segretario', 'nome cognome')
    .lean<AssembleaDoc>();
  if (!assemblea) throw notFound('Assemblea non trovata');

  const [tabella, condomini, unita, stabile] = await Promise.all([
    buildTabella(String(assemblea.condominio)),
    Condomino.find({ condominio: assemblea.condominio, attivo: true })
      .populate('utente', 'nome cognome email')
      .lean(),
    Unita.find({ condominio: assemblea.condominio }).select('codice').lean(),
    // Chi presiede è l'amministratore, che però non compare mai fra i condòmini:
    // senza questo populate l'elenco dei candidati a segretario non lo conterrebbe
    // nemmeno, e chi sta gestendo l'assemblea non potrebbe indicare se stesso.
    Condominio.findById(assemblea.condominio).populate('amministratore', 'nome cognome').lean(),
  ]);
  const amministratore = stabile?.amministratore as unknown as
    | { _id: unknown; nome: string; cognome: string }
    | null;

  const quotaPerUnita = new Map(tabella.righe.map((r) => [r.unitaId, r.quote.diritto]));
  const codiceUnita = new Map(unita.map((u) => [String(u._id), u.codice]));

ok(res, {
    // Le transizioni consentite viaggiano con il dettaglio: la UI costruisce il
    // selettore del cambio stato su questo elenco, senza replicare la regola.
    assemblea: {
      ...assemblea,
      transizioniConsentite: transizioniConsentite(assemblea.stato),
    },
    amministratore: amministratore
      ? { id: String(amministratore._id), nome: amministratore.nome, cognome: amministratore.cognome }
      : null,
    condomini: condomini.map((c) => {
      const presenza = assemblea.presenze.find((p) => String(p.condomino) === String(c._id));
      const utente = c.utente as unknown as { _id: unknown; nome: string; cognome: string; email: string };
      return {
        id: String(c._id),
        // `utente` è popolato: `String(c.utente)` scriverebbe "[object Object]",
        // e l'id serve al selettore del segretario per designare quella persona.
        utenteId: String(utente._id),
        nome: `${utente.nome} ${utente.cognome}`,
        email: utente.email,
        regime: c.regime,
        quota: c.quota,
        unita: c.unita.map((u) => codiceUnita.get(String(u)) ?? '?'),
        millesimi: Number(millesimiDiCondomino(c, quotaPerUnita).toFixed(2)),
presente: presenza?.presente ?? false,
        delegaA: presenza?.delegaA ? String(presenza.delegaA) : null,
        motivazioneAstenuto: presenza?.motivazioneAstenuto,
      };
    }),
  });
});

export const deleteOne = asyncHandler(async (req, res) => {
  const verbale = await Verbale.exists({ assemblea: req.params.id });
  if (verbale) throw conflict('Esiste già un verbale per questa assemblea: eliminalo prima');

  const risultato = await Assemblea.deleteOne({ _id: req.params.id, condominio: req.params.condominioId, stato: { $ne: 'conclusa' } });
  if (risultato.deletedCount === 0) {
    throw forbidden('Non è possibile eliminare un’assemblea conclusa o inesistente');
  }
  noContent(res);
});

/**
 * Punti all'ordine gia' scritti, con la delibera compilata.
 *
 * Restituisce il testo pronto da usare: il client lo usa per accodare il punto
 * senza dover riscrivere la delibera a mano in sede di verbale.
 */
export const modelli = asyncHandler(async (req, res) => {
  const { anno } = req.query as unknown as { anno: number };
  const catalogo = await modelliOrdineDelGiorno(req.params.condominioId!, anno);
  ok(res, catalogo.map((m) => ({ ...m, punto: puntoDaModello(m) })));
});
/**
 * Allega file a un punto all'ordine del giorno.
 *
 * Gli allegati stanno sul **punto**, non sull'assemblea: ogni punto è una
 * deliberazione a sé, con i propri documenti. Un allegato sull'assemblea non
 * saprebbe a quale punto appartenere.
 *
 * I punti non hanno un `_id` proprio (`puntoOrdineSchema` è `{ _id: false }`), quindi
 * si indicano col numero d'ordine ed è quello che va nell'`arrayFilters`.
 */
export const allegaPunto = asyncHandler(async (req, res) => {
  const condominioId = String(req.params.condominioId);
  const assembleaId = String(req.params.id);
  const ordine = Number(req.params.ordine);

  const assemblea = await Assemblea.findById(assembleaId);
  if (!assemblea || String(assemblea.condominio) !== condominioId) throw notFound('Assemblea non trovata');
  assicuraAssembleaModificabile(assemblea);

  const punto = (assemblea.ordineDelGiorno ?? []).find((p) => p.ordine === ordine);
  if (!punto) throw notFound(`Nessun punto n. ${ordine} in quest'ordine del giorno`);

  const caricati = await toAllegati(req);
  await allegaA(
    Assemblea,
    { _id: assembleaId, condominio: condominioId },
    'ordineDelGiorno.$[p].allegati',
    caricati,
    [{ 'p.ordine': ordine }],
  );

  ok(res, { allegati: caricati, aggiunti: caricati.length });
});

/** Toglie un allegato da un punto all'ordine del giorno e cancella il file. */
export const staccaPunto = asyncHandler(async (req, res) => {
  const condominioId = String(req.params.condominioId);
  const assembleaId = String(req.params.id);
  const ordine = Number(req.params.ordine);

  const assemblea = await Assemblea.findById(assembleaId);
  if (!assemblea || String(assemblea.condominio) !== condominioId) throw notFound('Assemblea non trovata');
  assicuraAssembleaModificabile(assemblea);

  await staccaDa(
    Assemblea,
    { _id: assembleaId, condominio: condominioId },
    'ordineDelGiorno.$[p].allegati',
    String(req.params.allegatoId),
    [{ 'p.ordine': ordine }],
  );

  noContent(res);
});