import { Types } from 'mongoose';
import { Condominio, Condomino, Unita, Bilancio, Versamento } from '../models/index.js';
import { buildTabella, quotaPerUnita } from './tabellaMillesimale.service.js';
import { notFound } from '../utils/errors.js';

export interface RigaQuotaVersamento {
  unitaId: string;
  codice: string;
  condomino?: { id: string; nome: string; cognome: string };
  millesimi: number;
  voci: { voce: string; importo: number }[];
  totale: number;
  versato: number;
  saldo: number;
  stato: 'pagato' | 'parziale' | 'non_pagato';
}

export interface RiepilogoVersamenti {
  condominioId: string;
  anno: number;
  mese: number;
  totaleDovuto: number;
  totaleVersato: number;
  saldo: number;
  morosi: RigaQuotaVersamento[];
  righe: RigaQuotaVersamento[];
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Calcola la quota dovuta da ciascuna unità per un mese, ripartendo le voci
 * del bilancio preventivo in base ai millesimi di diritto.
 *
 * L'operazione non è perfettamente additiva: i singoli importi sono arrotondati
 * a due decimali. La differenza rispetto al totale teorico viene riportata
 * sull'unità con la quota più alta, così la somma delle quote è sempre esatta.
 */
export async function calcolaQuoteMensili(
  condominioId: string,
  anno: number,
  mese: number,
): Promise<RiepilogoVersamenti> {
  const condominio = await Condominio.findById(condominioId).lean();
  if (!condominio) throw notFound('Condominio non trovato');

  const [bilancio, unita, condomini, versamenti, tabella] = await Promise.all([
    Bilancio.findOne({ condominio: condominioId, anno, tipo: 'preventivo' }).lean(),
    Unita.find({ condominio: condominioId, attiva: true }).lean(),
    Condomino.find({ condominio: condominioId, attivo: true }).lean(),
    Versamento.find({ condominio: condominioId, 'periodo.anno': anno, 'periodo.mese': mese }).lean(),
    buildTabella(condominioId),
  ]);

  if (!bilancio) throw notFound(`Non esiste un bilancio preventivo per il condominio nell'anno ${anno}`);

  const quotePerUnita = await quotaPerUnita(condominioId, tabella.revisione);
  const unitaPerId = new Map(unita.map((u) => [String(u._id), u]));

  // Totale millesimi su cui è normalizzata ciascuna ripartizione (1000 in
  // una tabella valida). Non va usato il millesimo della singola unità: qui si
  // calcola la quota dovuta, non il peso relativo all'interno dell'unità.
  const denomRipartizione: Record<'diritto' | 'uso' | 'spese', number> = {
    diritto: tabella.totale.diritto || 1000,
    uso: tabella.totale.uso || tabella.totale.diritto || 1000,
    spese: tabella.totale.spese || tabella.totale.diritto || 1000,
  };

  // Importo mensile = 1/12 del preventivo annuale, ripartito sui millesimi.
  const vociMensili = bilancio.voci.map((v) => ({
    voce: `${v.categoria}: ${v.descrizione}`,
    base: v.importo / 12,
    ripartizione: v.ripartizione as 'diritto' | 'uso' | 'spese',
  }));

  const totaleBilancioMensile = vociMensili.reduce((s, v) => s + v.base, 0);

  const righe: RigaQuotaVersamento[] = [];
  let residuo = round2(totaleBilancioMensile);

  for (const [unitaId, quote] of quotePerUnita) {
    const u = unitaPerId.get(unitaId);
    if (!u) continue;

    const voci = vociMensili.map((v) => {
      const denom = denomRipartizione[v.ripartizione] || 1000;
      const millesimi = quote[v.ripartizione] ?? 0;
      return { voce: v.voce, importo: round2((millesimi / denom) * v.base) };
    });

    const totale = round2(voci.reduce((s, v) => s + v.importo, 0));
    residuo = round2(residuo - totale);

    const legame = condomini.find((c) => c.unita.some((id) => String(id) === unitaId) && c.primario);
    const versato = round2(
      versamenti
        .filter((v) => String(v.unita) === unitaId)
        .reduce((s, v) => s + v.importo, 0),
    );

    righe.push({
      unitaId,
      codice: u.codice,
      condomino: legame
        ? { id: String(legame.utente), nome: '', cognome: '' }
        : undefined,
      millesimi: quote.diritto,
      voci,
      totale,
      versato,
      saldo: round2(totale - versato),
      stato: versato <= 0 ? 'non_pagato' : versato + 0.005 < totale ? 'parziale' : 'pagato',
    });
  }

  // Riallineamento: la quota con più millesimi assorbe la differenza di arrotondamento.
  if (residuo !== 0 && righe.length > 0) {
    const maggiore = [...righe].sort((a, b) => b.millesimi - a.millesimi)[0];
    if (maggiore) {
      maggiore.totale = round2(maggiore.totale + residuo);
      maggiore.saldo = round2(maggiore.totale - maggiore.versato);
      maggiore.stato =
        maggiore.versato <= 0 ? 'non_pagato' : maggiore.versato + 0.005 < maggiore.totale ? 'parziale' : 'pagato';
    }
  }

  const totaleDovuto = round2(righe.reduce((s, r) => s + r.totale, 0));
  const totaleVersato = round2(righe.reduce((s, r) => s + r.versato, 0));

  return {
    condominioId,
    anno,
    mese,
    totaleDovuto,
    totaleVersato,
    saldo: round2(totaleDovuto - totaleVersato),
    morosi: righe.filter((r) => r.stato !== 'pagato'),
    righe,
  };
}

/** Quote di un singolo condomino, sommate su tutte le sue unità. */
export async function quotePerCondomino(
  condominioId: string,
  utenteId: string,
  anno: number,
  mese: number,
) {
  const riepilogo = await calcolaQuoteMensili(condominioId, anno, mese);
  const legami = await Condomino.find({ condominio: condominioId, utente: utenteId, attivo: true })
    .select('unita quota regime')
    .lean();

  const miare = new Set(legami.flatMap((l) => l.unita.map(String)));
  const righe = riepilogo.righe.filter((r) => miare.has(r.unitaId));
  const quotaProprietari = legami.reduce((s, l) => s + (l.quota ?? 100), 0) / 100 || 1;

  const totale = round2(righe.reduce((s, r) => s + r.totale, 0) * quotaProprietari);

  return {
    ...riepilogo,
    righe,
    totaleDovuto: totale,
    saldo: round2(totale - riepilogo.totaleVersato * (totale / (riepilogo.totaleDovuto || 1))),
  };
}

export function toObjectId(value: string): Types.ObjectId {
  return new Types.ObjectId(String(value));
}
