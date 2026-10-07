import { Assemblea, Condominio, Condomino, Unita, Verbale, type AssembleaDoc, type CondominioDoc, type VerbaleDoc } from '../models/index.js';
import { buildTabella } from './tabellaMillesimale.service.js';
import { conflict, notFound } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const fmt = (n: number): string => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(n);
const fmtData = (d: Date): string =>
  new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
const fmtDataLunga = (d: Date): string =>
  new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
const pct = (n: number): string => `${n.toFixed(2).replace('.', ',')}%`;
const riporta = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const fmtEuro = (n: number): string =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n);

/**
 * Completa la delibera con le cifre definitive del bilancio collegato.
 *
 * I modelli di punto all'ordine lasciano i segnaposto `{totale}` e
 * `{totaleMensile}`: vengono risolti qui, alla generazione del verbale, quando i
 * numeri sono quelli che l'assemblea sta davvero approvando. Se il punto non ha
 * un bilancio collegato il testo resta com'era: è la delibera libera, e non va
 * toccata.
 */
function deliberaRisolta(punto: { delibera?: string; bilancio?: unknown }): string {
  const testo = punto.delibera ?? '';
  if (!testo.includes('{')) return testo;

  const bilancio = punto.bilancio as { totale?: number } | null | undefined;
  const totale = bilancio?.totale;
  if (totale === undefined) return testo.replaceAll('{totale}', '€ …').replaceAll('{totaleMensile}', '€ …');

  return testo
    .replaceAll('{totale}', fmtEuro(totale))
    .replaceAll('{totaleMensile}', fmtEuro(Math.round((totale / 12) * 100) / 100));
}
const regimeLabel: Record<string, string> = {
  proprietario: 'proprietario',
  inquilino: 'inquilino',
  comodatario: 'comodatario',
  nuda_proprieta: 'nuda proprietà',
};

export interface VerbaleDati {
  assemblea: AssembleaDoc;
  testo: string;
  presenze: { numeroCondomini: number; numeroDeleghe: number; numeroMillesimi: number };
  millesimiPresenti: number;
  millesimiTotali: number;
  punti: AssembleaDoc['ordineDelGiorno'];
}

/**
 * Quorum di approvazione (art. 1132 e 1136 c.c.):
 * - ordinaria: maggioranza dei presenti;
 * - straordinaria: maggioranza dei condomini e almeno 2/3 dei millesimi.
 */
export function esitoPerQuorum(
  tipo: 'ordinaria' | 'straordinaria',
  voti: { favorevoli: number; contrari: number; astenuti: number },
): { esito: 'approvato' | 'respinto'; motivoQuorum: string } {
  const votanti = voti.favorevoli + voti.contrari;
  if (votanti === 0) return { esito: 'respinto', motivoQuorum: 'nessun voto espresso' };

  const soglia = tipo === 'straordinaria' ? votanti * (2 / 3) : voti.contrari;
  const approvato = voti.favorevoli > soglia;

  const motivoQuorum =
    tipo === 'straordinaria'
      ? `maggioranza dei votanti con almeno due terzi dei millesimi (${fmt(votanti * (2 / 3))} su ${fmt(votanti)})`
      : `maggioranza dei presenti (${fmt(Math.floor(votanti / 2) + 1)} voti favorevoli su ${fmt(votanti)} votanti)`;

  return { esito: approvato ? 'approvato' : 'respinto', motivoQuorum };
}

/**
 * Millesimi rappresentati da un condomino presente, somma delle quote delle sue
 * unità. La nuda proprietà vale metà dei millesimi di diritto.
 */
export function millesimiDiCondomino(
  legame: { unita: unknown[]; regime: string; quota: number },
  quotaPerUnita: Map<string, number>,
): number {
  const proprieta = legame.regime === 'nuda_proprieta' ? 0.5 : 1;
  const quota = (legame.quota ?? 100) / 100 || 1;
  const somma = legame.unita.reduce<number>((sum, id) => sum + (quotaPerUnita.get(String(id)) ?? 0), 0);
  return somma * proprieta * quota;
}

export async function generaDatiVerbale(assembleaId: string): Promise<VerbaleDati> {
  const assemblea = await Assemblea.findById(assembleaId)
    .populate('presiedutaDa', 'nome cognome')
    .populate('segretario', 'nome cognome')
    .populate('ordineDelGiorno.bilancio', 'tipo anno totale')
    .lean<AssembleaDoc>();

  if (!assemblea) throw notFound('Assemblea non trovata');

  const condominio = await Condominio.findById(assemblea.condominio).lean<CondominioDoc>();
  if (!condominio) throw notFound('Condominio non trovato');

  const tabella = await buildTabella(String(assemblea.condominio));
  const millesimiTotali = tabella.totale.diritto || assemblea.millesimiTotali || 1000;
  const quotaPerUnita = new Map(tabella.righe.map((r) => [r.unitaId, r.quote.diritto]));

  const [unita, condomini] = await Promise.all([
    Unita.find({ condominio: assemblea.condominio }).select('codice').lean(),
    Condomino.find({ condominio: assemblea.condominio, attivo: true }).populate('utente', 'nome cognome').lean(),
  ]);

  const unitaPerId = new Map(unita.map((u) => [String(u._id), u.codice]));
  const presenze = assemblea.presenze ?? [];
  const presenti = presenze.filter((p) => p.presente);
  const numeroDeleghe = presenti.filter((p) => p.delegaA).length;

  const delegaPerId = new Map<string, string>();
  const deleganti = condomini.filter((c) => presenze.some((p) => String(p.condomino) === String(c._id) && p.delegaA));
  if (deleganti.length > 0) {
    const targets = [...new Set(deleganti.map((c) => String(presenze.find((p) => String(p.condomino) === String(c._id))?.delegaA)))];
    // `delegaA` è un riferimento a `Condomino`, come dichiara il modello: cercando
    // in `User` l'id non trovava nessuno e la riga "presente tramite delega a …"
    // saltava, pur essendo le deleghe contate in apertura. Il filtro per `attivo`
    // non c'è apposta: il delegatario resta tale anche se oggi non è più iscritto.
    const delegatari = await Condomino.find({ _id: { $in: targets } })
      .populate('utente', 'nome cognome')
      .lean();
    for (const c of deleganti) {
      const p = presenze.find((x) => String(x.condomino) === String(c._id));
      const d = delegatari.find((x) => String(x._id) === String(p?.delegaA));
      const u = d?.utente as unknown as { nome: string; cognome: string } | undefined;
      if (u) delegaPerId.set(String(c._id), `${u.nome} ${u.cognome}`);
    }
  }

  const righePresenze = presenti
    .map((p) => {
      const legame = condomini.find((c) => String(c._id) === String(p.condomino));
      if (!legame) return null;
      const utente = legame.utente as unknown as { nome: string; cognome: string };
      return {
        nome: `${utente.nome} ${utente.cognome}`,
        unita: legame.unita.map((id) => unitaPerId.get(String(id)) ?? '?').join(', '),
        regime: regimeLabel[legame.regime] ?? legame.regime,
        quota: legame.quota,
        delega: delegaPerId.get(String(legame._id)) ?? null,
        millesimi: millesimiDiCondomino(legame, quotaPerUnita),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.millesimi - a.millesimi);

  const millesimiPresenti = Number(
    righePresenze.reduce((s, r) => s + r.millesimi, 0).toFixed(2),
  );

  const sezioni: string[] = [];
  const tipoLabel = assemblea.tipo === 'straordinaria' ? 'STRAORDINARIA' : 'ORDINARIA';

  sezioni.push(
    `VERBALE DELL'ASSEMBLEA ${tipoLabel} DEL ${fmtDataLunga(assemblea.data).toUpperCase()}`,
  );

  sezioni.push(
    [
      `Il giorno ${fmtData(assemblea.data)}${assemblea.oraInizio ? ` alle ore ${assemblea.oraInizio}` : ''},`,
      `presso ${riporta(assemblea.luogo)},`,
      `si è riunita l'assemblea ${assemblea.tipo} del condominio "${condominio.nome}",`,
      `sito in ${condominio.indirizzo.via}${condominio.indirizzo.civico ? ` ${condominio.indirizzo.civico}` : ''}${condominio.indirizzo.citta ? `, ${condominio.indirizzo.citta}` : ''}.`,
    ].join(' '),
  );

  sezioni.push(
    [
      'Il condominio è composto da',
      `${condomini.length} condomini,`,
      `titolari di ${unita.length} unità immobiliari,`,
      `per un totale di ${fmt(millesimiTotali)} millesimi di diritto.`,
    ].join(' '),
  );

  const presiedutaDa = assemblea.presiedutaDa as unknown as { nome: string; cognome: string } | null;
  const segretario = assemblea.segretario as unknown as { nome: string; cognome: string } | null;

  sezioni.push(
    [
      presiedutaDa
        ? `Assume la presidenza l’amministratore ${riporta(`${presiedutaDa.nome} ${presiedutaDa.cognome}`)}.`
        : 'Assume la presidenza l’amministratore del condominio.',
      segretario
        ? `Funge da segretario ${riporta(`${segretario.nome} ${segretario.cognome}`)}.`
        : 'Funge da segretario il condomino designato dall’assemblea.',
    ].join(' '),
  );

  const rigaPresenze =
    `Sono presenti in assemblea ${presenti.length} condomini su ${condomini.length}, ` +
    `rappresentanti ${fmt(millesimiPresenti)} millesimi su ${fmt(millesimiTotali)}, ` +
    `pari al ${pct((millesimiPresenti / (millesimiTotali || 1)) * 100)} del totale` +
    (numeroDeleghe > 0 ? `, di cui ${numeroDeleghe} per delega.` : ', nessuno per delega.');

  sezioni.push(rigaPresenze);

  const quorum = assemblea.quattordiciGgiorni
    ? "Trattandosi di assemblea in seconda convocazione entro i quattordici giorni dalla prima, l’assemblea è valida per qualunque numero di partecipanti (art. 1132, comma 3, c.c.)."
    : assemblea. secondaConvocazione
      ? "Trattandosi di assemblea in seconda convocazione, l’assemblea è valida indipendentemente dal numero dei partecipanti (art. 1132, comma 2, c.c.)."
      : `Trattandosi di prima convocazione, risultano presenti condomini rappresentanti più di un terzo dei millesimi, come richiesto dall'art. 1132, comma 1, c.c.`;

  sezioni.push(quorum);

  const totaleVoti = (assemblea.votazioni ?? []).reduce(
    (acc, v) => ({
      f: acc.f + v.votiFavorevoli,
      c: acc.c + v.votiContrari,
      a: acc.a + v.astenuti,
    }),
    { f: 0, c: 0, a: 0 },
  );

  if (totaleVoti.f + totaleVoti.c + totaleVoti.a === 0) {
    sezioni.push('Non sono stati registrati voti espliciti sui punti posti in trattazione.');
  }

  sezioni.push('===== PRESENZE =====');
  if (righePresenze.length === 0) {
    // "Nessun condòmino è presente" e "nessun condòmino è assente" dicono cose
    // opposte, e nessuna delle due è quello che il dato accerta: qui il foglio
    // presenze è semplicemente vuoto. Si scrive quindi che non risultano
    // presenze registrate, che è l'unica affermazione difendibile, e si segnala
    // che l'assemblea non è verificabile senza il foglio.
    if (presenti.length === 0) {
      sezioni.push(
        'Non risultano presenze registrate: il verbale non può dare atto di quanti condomini ' +
          'hanno partecipato né del quorum raggiunto. Il segretario deve allegare il foglio presenze.',
      );
    } else {
      sezioni.push('Non è possibile attribuire le presenze registrate a un condomino: nessun nome corrisponde.');
    }
  } else {
    righePresenze.forEach((r, i) => {
      sezioni.push(
        [
          `${i + 1}. ${r.nome}`,
          `   — unità immobiliare: ${r.unita || '—'}`,
          `   — qualifica: ${r.regime}${r.quota < 100 ? ` — quota ${fmt(r.quota)}%` : ''}`,
          `   — millesimi rappresentati: ${fmt(r.millesimi)}`,
          r.delega ? `   — presente tramite delega a ${r.delega}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      );
    });
  }

  sezioni.push("===== ORDINE DEL GIORNO =====");
  const punti = [...(assemblea.ordineDelGiorno ?? [])].sort((a, b) => a.ordine - b.ordine);
  const votazioni = new Map((assemblea.votazioni ?? []).map((v) => [v.ordine, v]));

  for (const punto of punti) {
    const righe = [`${punto.ordine}) ${riporta(punto.titolo)}`];
    if (punto.descrizione) righe.push(`   ${punto.descrizione}`);

    const vot = votazioni.get(punto.ordine);
    if (vot && (vot.votiFavorevoli || vot.votiContrari || vot.astenuti)) {
      if (vot.segreta) {
        righe.push('   Votazione a scrutinio segreto: i risultati individuali non vengono verbalizzati.');
        if (vot.esito) righe.push(`   Esito della votazione: ${vot.esito.toUpperCase()}.`);
      } else {
        const calcolato = esitoPerQuorum(assemblea.tipo, {
          favorevoli: vot.votiFavorevoli,
          contrari: vot.votiContrari,
          astenuti: vot.astenuti,
        });
        righe.push(
          `   Voti favorevoli: ${fmt(vot.votiFavorevoli)} — contrari: ${fmt(vot.votiContrari)} — astenuti: ${fmt(vot.astenuti)}.`,
        );
        righe.push(`   Quorum applicato: ${calcolato.motivoQuorum}.`);
        if (vot.esito) {
          righe.push(`   Esito dichiarato dal segretario: ${vot.esito.toUpperCase()}.`);
          if (vot.esito !== calcolato.esito && vot.esito !== 'dibattuto' && vot.esito !== 'rinviato') {
            righe.push('   ATTENZIONE: l’esito verbalizzato non coincide con il quorum calcolato in automatico.');
          }
        }
      }
    }

    if (vot?.motivoRinvio) righe.push(`   Motivo del rinvio: ${vot.motivoRinvio}`);
    if (punto.delibera) righe.push(`   DELIBERA: ${deliberaRisolta(punto)}`);

    sezioni.push(righe.join('\n'));
  }

  if (assemblea.note) sezioni.push(`===== NOTE =====\n${assemblea.note}`);

  sezioni.push(
    `Non essendoci altro da deliberare, l’assemblea viene chiusa alle ore ${assemblea.oraChiusura ?? '___:___'}.`,
  );
  sezioni.push(
    [
      'Il presente verbale, redatto da',
      segretario ? `${segretario.nome} ${segretario.cognome}` : 'chi assume la segreteria',
      `e sottoscritto dal presidente${presiedutaDa ? `, ${riporta(`${presiedutaDa.nome} ${presiedutaDa.cognome}`)}` : ''},`,
      'viene letto e approvato seduta stante.',
    ].join(' '),
  );
  sezioni.push(
    `Fatto in ${condominio.indirizzo.citta ?? '__________'}, il ${fmtData(assemblea.data)}.`,
  );

  return {
    assemblea,
    testo: sezioni.join('\n\n'),
    presenze: {
      numeroCondomini: presenti.length,
      numeroDeleghe,
      numeroMillesimi: millesimiPresenti,
    },
    millesimiPresenti,
    millesimiTotali,
    punti,
  };
}

export async function generaVerbale(assembleaId: string, attoreId?: string): Promise<VerbaleDoc> {
  const dati = await generaDatiVerbale(assembleaId);

  const esistente = await Verbale.findOne({ assemblea: assembleaId });
  if (esistente?.modificatoManualmente) {
    throw conflict(
      'Il verbale è stato modificato manualmente: non può essere rigenerato automaticamente. Ripristina il testo generato per procedere.',
    );
  }

  const ultimo = await Verbale.findOne({ condominio: dati.assemblea.condominio })
    .sort({ numero: -1 })
    .select('numero')
    .lean();
  const numero = (ultimo?.numero ?? 0) + 1;

  const snapshot = {
    millesimiTotali: dati.millesimiTotali,
    millesimiPresenti: dati.millesimiPresenti,
    presenze: {
      numeroCondomini: dati.presenze.numeroCondomini,
      numeroDeleghe: dati.presenze.numeroDeleghe,
    },
    punti: dati.punti as unknown[],
  };

  if (esistente) {
    esistente.testo = dati.testo;
    esistente.snapshot = snapshot;
    esistente.data = dati.assemblea.data;
    esistente.generatoDa = attoreId as VerbaleDoc['generatoDa'];
    esistente.generatoIl = new Date();
    await esistente.save();
    await aggiornaMillesimi(assembleaId, dati.millesimiPresenti, dati.millesimiTotali);
    return esistente;
  }

  const creato = await Verbale.create({
    condominio: dati.assemblea.condominio,
    assemblea: assembleaId,
    numero,
    data: dati.assemblea.data,
    testo: dati.testo,
    snapshot,
    generatoDa: attoreId,
    generatoIl: new Date(),
    modificatoManualmente: false,
  });
  await aggiornaMillesimi(assembleaId, dati.millesimiPresenti, dati.millesimiTotali);
  logger.info(`Verbale n. ${numero} generato per assemblea ${assembleaId}`);
  return creato;
}

async function aggiornaMillesimi(assembleaId: string, presenti: number, totali: number): Promise<void> {
  await Assemblea.findByIdAndUpdate(assembleaId, {
    millesimiPresenti: presenti,
    millesimiTotali: totali,
  });
}

/** Ricalcola i millesimi senza scrivere il verbale. */
export async function ricalcolaMillesimi(assembleaId: string): Promise<{ presenti: number; totali: number }> {
  const dati = await generaDatiVerbale(assembleaId);
  await aggiornaMillesimi(assembleaId, dati.millesimiPresenti, dati.millesimiTotali);
  return { presenti: dati.millesimiPresenti, totali: dati.millesimiTotali };
}
