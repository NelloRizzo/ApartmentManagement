/**
 * Definizione unica della navigazione.
 *
 * Ogni voce indica il permesso necessario per vederla: senza permesso la sezione
 * non compare, per non offrire strade che il backend rifiuterebbe. La barra
 * inferiore del telefono mostra solo le voci `primarie`, che devono restare al
 * massimo cinque per non affollare lo schermo.
 */
import type { Permesso, UserRole } from '@/types/domain';

export interface VoceNavigazione {
  /** Percorso interno alla rotta. */
  a: string;
  etichetta: string;
  icona: string;
  /** Voce mostrata anche nella barra inferiore del telefono. */
  primaria?: boolean;
  /** Permesso richiesto per vedere la voce. */
  permesso?: Permesso;
  /** Mostra il contatore delle comunicazioni non lette. */
  badge?: boolean;
}

export interface GruppoNavigazione {
  titolo: string;
  voci: VoceNavigazione[];
}

/** Sezioni per il ruolo `admin` (compreso l'assistente delegato). */
const amministratore: GruppoNavigazione[] = [
  {
    titolo: 'Condominio',
    voci: [
      { a: '/c/panorama', etichetta: 'Panorama', icona: '◱', primaria: true },
      // Prima delle unità: senza un condominio non c'è nulla da amministrare, e
      // questa è la pagina da cui se lo crea.
      { a: '/c/condomini', etichetta: 'I miei condomini', icona: '⌂' },
      { a: '/c/unita', etichetta: 'Unità immobiliari', icona: '⌸', permesso: 'unita:leggere' },
      { a: '/c/iscritti', etichetta: 'Condòmini iscritti', icona: '⚇', permesso: 'iscritti:leggere' },
      { a: '/c/tabella', etichetta: 'Quote millesimali', icona: '⚖', permesso: 'tabella:leggere' },
    ],
  },
  {
    titolo: 'Assemblee',
    voci: [
      { a: '/c/assemblee', etichetta: 'Assemblee', icona: '⚑', primaria: true, permesso: 'assemblee:leggere' },
      { a: '/c/verbali', etichetta: 'Verbali', icona: '✎', permesso: 'verbali:leggere' },
    ],
  },
  {
    titolo: 'Amministrazione',
    voci: [
      { a: '/c/bilanci', etichetta: 'Bilanci', icona: '▤', permesso: 'bilanci:leggere' },
      { a: '/c/quote', etichetta: 'Quote e versamenti', icona: '€', primaria: true, permesso: 'versamenti:leggere' },
      { a: '/c/versamenti/nuovo', etichetta: 'Registra versamento', icona: '＋', permesso: 'versamenti:scrivere' },
      { a: '/c/team', etichetta: 'Team e deleghe', icona: '👥', permesso: 'amministrazione:leggere' },
      // Nessun permesso: la bacheca è del team, e anche l'assistente deve poterci
      // arrivare per vedere i compiti che ha ricevuto. Chi non è amministratore
      // non vede questa voce perché il gruppo è quello degli amministratori.
      { a: '/c/attivita', etichetta: 'Attività', icona: '☐', primaria: true },
    ],
  },
  {
    titolo: 'Comunicazione',
    voci: [{ a: '/c/comunicazioni', etichetta: 'Messaggi', icona: '✉', primaria: true, permesso: 'comunicazioni:leggere', badge: true }],
  },
];

/** Sezioni per il ruolo `condomino`. */
const condomino: GruppoNavigazione[] = [
  {
    titolo: 'Il mio condominio',
    voci: [
      { a: '/c/versamenti', etichetta: 'Le mie quote', icona: '€', primaria: true },
      { a: '/c/verbali', etichetta: 'Verbali', icona: '✎', primaria: true },
      { a: '/c/comunicazioni', etichetta: 'Messaggi', icona: '✉', primaria: true, badge: true },
    ],
  },
];

/** Sezioni riservate all'amministratore di piattaforma. */
const piattaforma: GruppoNavigazione[] = [
  {
    titolo: 'Piattaforma',
    voci: [
      { a: '/p', etichetta: 'Panorama', icona: '◱', primaria: true },
      { a: '/p/contratti', etichetta: 'Contratti', icona: '§' },
      { a: '/p/amministratori', etichetta: 'Amministratori', icona: '⚿' },
      { a: '/p/messaggi', etichetta: 'Messaggi agli admin', icona: '✉', badge: true },
    ],
  },
];

/** Il profilo esiste per tutti: è l'unica sezione che nessun ruolo deve perdere. */
const profilo: GruppoNavigazione[] = [
  { titolo: 'Account', voci: [{ a: '/profilo', etichetta: 'Profilo e posizioni', icona: '⚙' }] },
];

/**
 * Il contratto riguarda chi amministra. Un condòmino o un portiere non ne hanno
 * uno: offrirgli la voce lo porterebbe a una pagina vuota.
 */
const contratto: GruppoNavigazione[] = [
  { titolo: 'Account', voci: [{ a: '/contratto', etichetta: 'Il mio contratto', icona: '§' }] },
];

export function gruppiNavigazione(
  role: UserRole,
  puo: (permesso: Permesso) => boolean = () => true,
  amministra: boolean = true,
): GruppoNavigazione[] {
  // Il superadmin vede l'area di piattaforma sempre, ma le sezioni di
  // condominio solo se amministra davvero almeno uno stabile: su un condominio
  // altrui `requireCondominioAccess` risponde 403, quindi mostrargliele
  // offrirebbe strade che il backend rifiuta.
  const base =
    role === 'superadmin'
      ? [...(amministra ? amministratore : []), ...piattaforma, ...profilo, ...contratto]
      : role === 'condomino'
        ? [...condomino, ...profilo]
        : role === 'portiere'
          ? profilo
          : [...amministratore, ...profilo, ...contratto];

  // Le voci senza permesso restano sempre; quelle con permesso sono filtrate.
  return base
    .map((gruppo) => ({
      ...gruppo,
      voci: gruppo.voci.filter((v) => !v.permesso || puo(v.permesso)),
    }))
    .filter((gruppo) => gruppo.voci.length > 0);
}

/** Voci della barra inferiore del telefono. */
export function vociPrimarie(
  role: UserRole,
  puo: (permesso: Permesso) => boolean = () => true,
  amministra: boolean = true,
): VoceNavigazione[] {
  return gruppiNavigazione(role, puo, amministra)
    .flatMap((g) => g.voci)
    .filter((v) => v.primaria);
}