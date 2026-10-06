import crypto from 'node:crypto';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Invio delle email transazionali tramite Brevo.
 *
 * Si usa la fetch globale di Node 20: introdurre nodemailer o una libreria
 * HTTP aggiungerebbe una dipendenza per fare una richiesta POST. Inoltre
 * l'invio non deve mai far fallire la richiesta che lo ha innescato: chi crea
 * un amministratore non deve perdere il lavoro se Brevo è irraggiungibile, e
 * per questo ogni fallimento torna come dato di ritorno e non come errore.
 */

export type EsitoInvio =
  | { inviato: true }
  | { inviato: false; motivo: 'non_configurato' | 'rifiutato'; dettaglio?: string };

const ENDPOINT_BREVO = 'https://api.brevo.com/v3/smtp/email';

/** Token casuale per la conferma. Va mostrato una volta sola, poi conservato in hash. */
export function nuovoTokenConferma(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Il token non viene salvato in chiaro: un dump del database non deve
 * permettere di confermare indirizzi altrui.
 */
export function hashTokenConferma(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Escape dei valori interpolati nell'HTML: un nome con & o < romperebbe il messaggio. */
function escHtml(testo: string): string {
  return testo
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export interface MessaggioEmail {
  a: string;
  oggetto: string;
  /** Testo in chiaro, in alternativa a `html`. */
  testo?: string;
  html?: string;
}

/**
 * Invia un'email. Non solleva mai: al chiamante interessa sapere se è partita,
 * non il motivo del fallimento.
 */
export async function inviaEmail(messaggio: MessaggioEmail): Promise<EsitoInvio> {
  if (!config.brevo.attivo) {
    logger.warn('Invio email saltato: BREVO_API_KEY non configurata');
    return { inviato: false, motivo: 'non_configurato' };
  }

  try {
    const risposta = await fetch(ENDPOINT_BREVO, {
      method: 'POST',
      headers: {
        // `api-key` e non `x-api-key`: con quest'ultimo Brevo risponde
        // "authentication not found in headers", anche se la chiave è corretta,
        // perché su alcune reti l'intestazione viene scartata a monte.
        'api-key': config.brevo.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: config.brevo.mittenteNome, email: config.brevo.mittenteEmail },
        to: [{ email: messaggio.a }],
        subject: messaggio.oggetto,
        ...(messaggio.html ? { htmlContent: messaggio.html } : { textContent: messaggio.testo }),
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!risposta.ok) {
      const corpo = await risposta.text().catch(() => '');
      logger.warn(`Brevo ha rifiutato l'email a ${messaggio.a}: ${risposta.status} ${corpo.slice(0, 300)}`);
      return { inviato: false, motivo: 'rifiutato', dettaglio: `${risposta.status}` };
    }

    logger.info(`Email inviata a ${messaggio.a}: ${messaggio.oggetto}`);
    return { inviato: true };
  } catch (err) {
    logger.warn(`Invio email a ${messaggio.a} non riuscito: ${(err as Error).message}`);
    return { inviato: false, motivo: 'rifiutato', dettaglio: (err as Error).message };
  }
}

/** Link di conferma: pagine del frontend, non dell'API. */
function linkConferma(token: string): string {
  return `${config.urlFrontend.replace(/\/$/, '')}/conferma-email?token=${encodeURIComponent(token)}`;
}

interface CorpoConferma {
  nome: string;
  link: string;
  /** Password provvisoria: chi crea l'assistente altrimenti non può consegnargliela. */
  passwordProvvisoria?: string;
  ruolo: string;
  organizzazione?: string;
}

/** Dati per l'invio: il link è composto qui dentro, il chiamante fornisce il token. */
export interface RichiestaConferma {
  a: string;
  nome: string;
  ruolo: string;
  token: string;
  passwordProvvisoria?: string;
  organizzazione?: string;
}

const RUOLI_EMAIL: Record<string, string> = {
  superadmin: 'Amministratore di piattaforma',
  admin: 'Amministratore di condominio',
  portiere: 'Portiere',
  condomino: 'Condòmino',
};

function corpoEmailConferma(d: CorpoConferma): string {
  const organizzazione = d.organizzazione
    ? `<p>sei stato invitato da <strong>${escHtml(d.organizzazione)}</strong>.</p>`
    : '';

  const password = d.passwordProvvisoria
    ? `<div class="password">
         <p>La password provvisoria, valida solo per il primo accesso:</p>
         <p class="valore">${escHtml(d.passwordProvvisoria)}</p>
         <p>Cambiala appena sei entrato.</p>
       </div>`
    : '';

  return `<!doctype html>
<html lang="it">
  <body style="margin:0;padding:24px;background:#f5f7fa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16232e">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #dde3ea;border-radius:10px;padding:32px">
      <h1 style="margin:0 0 4px;font-size:20px;color:#1b4965">Conferma il tuo indirizzo email</h1>
      <p style="margin:0 0 24px;color:#5a6b7c">${escHtml(d.ruolo)} · Steward</p>

      <p>Ciao ${escHtml(d.nome)},</p>
      ${organizzazione}
      <p>conferma questo indirizzo per completare l'attivazione del tuo account su Steward.</p>

      <p style="margin:28px 0">
        <a href="${d.link}"
           style="display:inline-block;background:#1b4965;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600">
          Conferma il mio indirizzo
        </a>
      </p>

      <p style="font-size:13px;color:#8695a5">
        Se il pulsante non funziona, copia questo indirizzo nel browser:<br>
        ${d.link}
      </p>

      ${password}

      <p style="margin-top:28px;font-size:13px;color:#8695a5;border-top:1px solid #dde3ea;padding-top:16px">
        Se non hai richiesto questo account, ignora questa email: nessuna azione verrà fatta.
      </p>
    </div>
  </body>
</html>`;
}

/**
 * Invia l'email di conferma dell'indirizzo.
 *
 * Restituisce l'esito invece di sollevare: se la chiave non c'è o Brevo
 * rifiuta, l'utente resta comunque creato e segnalato come non confermato.
 */
export async function inviaConfermaEmail(d: RichiestaConferma): Promise<EsitoInvio> {
  return inviaEmail({
    a: d.a,
    oggetto: 'Conferma il tuo indirizzo email su Steward',
    html: corpoEmailConferma({
      nome: d.nome,
      ruolo: RUOLI_EMAIL[d.ruolo] ?? d.ruolo,
      link: linkConferma(d.token),
      passwordProvvisoria: d.passwordProvvisoria,
      organizzazione: d.organizzazione,
    }),
  });
}

/**
 * Avvisa l'indirizzo precedente che ne è stato proposto un altro.
 *
 * Va a `precedente` e non a quello nuovo: se il cambio l'ha fatto qualcuno con
 * una sessione in mano, l'unica casella che può accorgersene è proprio quella che
 * si sta perdendo. Non solleva mai e il chiamante non deve bloccare il cambio su
 * un invio che fallisce.
 */
export async function avvisaCambioIndirizzo(d: {
  a: string;
  nome: string;
  nuovo: string;
}): Promise<EsitoInvio> {
  return inviaEmail({
    a: d.a,
    oggetto: 'Il tuo indirizzo email su Steward sta per cambiare',
    html: `<!doctype html>
<html lang="it">
  <body style="margin:0;padding:24px;background:#f5f7fa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#16232e">
    <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #dde3ea;border-radius:10px;padding:32px">
      <h1 style="margin:0 0 4px;font-size:20px;color:#1b4965">Cambio di indirizzo email</h1>
      <p style="margin:0 0 24px;color:#5a6b7c">Steward</p>

      <p>Ciao ${escHtml(d.nome)},</p>
      <p>qualcuno ha chiesto di portare il tuo account su Steward all'indirizzo
      <strong>${escHtml(d.nuovo)}</strong>. Finché non confermi, il tuo accesso resta questo
      e nessuno potrà cambiare la password o ricevere le email dell'applicazione sull'altro
      indirizzo.</p>

      <p style="font-size:13px;color:#8695a5">
        Se non sei tu, non fare nulla: il cambio non verrà completato. Puoi annullarlo
        dalla pagina del tuo profilo.
      </p>
    </div>
  </body>
</html>`,
  });
}
