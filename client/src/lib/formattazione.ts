/** Formattazione italiana per valute, date e numeri. */

const locale = 'it-IT';

const fmtEuro = new Intl.NumberFormat(locale, {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtEuroIntero = new Intl.NumberFormat(locale, {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const fmtNumero = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
const fmtMillesimi = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
const fmtPercentuale = new Intl.NumberFormat(locale, {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtData = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtDataLunga = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' });
const fmtDataOra = new Intl.DateTimeFormat(locale, {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

export const MESI_BREVI = [
  'gen', 'feb', 'mar', 'apr', 'mag', 'giu',
  'lug', 'ago', 'set', 'ott', 'nov', 'dic',
];

export const euro = (n: number | null | undefined): string => fmtEuro.format(Number(n ?? 0));

export const euroIntero = (n: number | null | undefined): string => fmtEuroIntero.format(Number(n ?? 0));

export const numero = (n: number | null | undefined): string => fmtNumero.format(Number(n ?? 0));

export const millesimi = (n: number | null | undefined): string => fmtMillesimi.format(Number(n ?? 0));

export const percentuale = (n: number | null | undefined): string => fmtPercentuale.format(Number(n ?? 0) / 100);

/** Accetta sia "2024-05-20" sia una data ISO completa. */
function normalizza(valore: string | Date | null | undefined): Date | null {
  if (!valore) return null;
  const data = valore instanceof Date ? valore : new Date(valore);
  return Number.isNaN(data.getTime()) ? null : data;
}

export const data = (v: string | Date | null | undefined): string => {
  const d = normalizza(v);
  return d ? fmtData.format(d) : '—';
};

export const dataLunga = (v: string | Date | null | undefined): string => {
  const d = normalizza(v);
  return d ? fmtDataLunga.format(d) : '—';
};

export const dataOra = (v: string | Date | null | undefined): string => {
  const d = normalizza(v);
  return d ? fmtDataOra.format(d) : '—';
};

export const mese = (n: number): string => MESI[n - 1] ?? '—';

export const meseBreve = (n: number): string => MESI_BREVI[n - 1] ?? '—';

/** Per input[type=date]: "AAAA-MM-GG". */
export function perInputData(v: string | Date | null | undefined): string {
  const d = normalizza(v);
  if (!d) return '';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const g = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${g}`;
}

export const iniziali = (nome: string, cognome: string): string =>
  `${nome.charAt(0)}${cognome.charAt(0)}`.toUpperCase();

/** Data relative breve: "oggi", "3 giorni fa", "12/05/2024". */
export function dataRelativa(v: string | Date | null | undefined): string {
  const d = normalizza(v);
  if (!d) return '—';
  const giorni = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (giorni === 0) return 'oggi';
  if (giorni === 1) return 'ieri';
  if (giorni > 1 && giorni < 7) return `${giorni} giorni fa`;
  if (giorni < 0 && giorni > -7) return `tra ${-giorni} giorni`;
  return fmtData.format(d);
}
