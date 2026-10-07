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
  /**
   * Contatore mostrato sulla voce: le comunicazioni non lette oppure le
   * convocazioni il cui ordine del giorno non è stato ancora aperto. Il valore
   * viene da `useAuth`, quindi ogni voce dichiara quale dei due legge.
   */
  badge?: 'nonLette' | 'daVedere';
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
      // Prima della pagina: la bacheca è il punto in cui si entra, e non ha
      // permessi perché anche l'assistente deve arrivarci per i compiti ricevuti.
      { a: '/c/bacheca', etichetta: 'Bacheca', icona: '☐', primaria: true },
      { a: '/c/bilanci', etichetta: 'Bilanci', icona: '▤', permesso: 'bilanci:leggere' },
      { a: '/c/quote', etichetta: 'Quote e versamenti', icona: '€', primaria: true, permesso: 'versamenti:leggere' },
      { a: '/c/versamenti/nuovo', etichetta: 'Registra versamento', icona: '＋', permesso: 'versamenti:scrivere' },
      { a: '/c/team', etichetta: 'Team e deleghe', icona: '👥', permesso: 'amministrazione:leggere' },
    ],
  },
  {
    titolo: 'Comunicazione',
    voci: [{ a: '/c/comunicazioni', etichetta: 'Messaggi', icona: '✉', primaria: true, permesso: 'comunicazioni:leggere', badge: 'nonLette' }],
  },
];

/** Sezioni per il ruolo `condomino`. */
const condomino: GruppoNavigazione[] = [
  {
    titolo: 'Il mio condominio',
    voci: [
      { a: '/c/versamenti', etichetta: 'Le mie quote', icona: '€', primaria: true },
      // Nessun `permesso`: i condòmini non ne hanno, quindi una voce con
      // `permesso: 'assemblee:leggere'` verrebbe filtrata e non comparirebbe
      // mai. Il confine è nel controller, come per la lista.
      { a: '/c/assemblee', etichetta: 'Assemblee', icona: '⚑', primaria: true, badge: 'daVedere' },
      { a: '/c/verbali', etichetta: 'Verbali', icona: '✎', primaria: true },
      { a: '/c/comunicazioni', etichetta: 'Messaggi', icona: '✉', primaria: true, badge: 'nonLette' },
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
      { a: '/p/messaggi', etichetta: 'Messaggi', icona: '✉', badge: 'nonLette' },
    ],
  },
];

/**
 * Il gruppo "Account" esiste per tutti: è l'unica sezione che nessun ruolo deve
 * perdere.
 *
 * Il contratto è nella stessa sezione e non in un gruppo separato: al superadmin
 * comparivano due sezioni intitolate "Account", una delle quali inutile perché il
 * superadmin non è soggetto a un contratto.
 */
function gruppoAccount(mostraContratto: boolean): GruppoNavigazione[] {
  return [
    {
      titolo: 'Account',
      voci: [
        { a: '/profilo', etichetta: 'Profilo e posizioni', icona: '⚙' },
        ...(mostraContratto ? [{ a: '/contratto', etichetta: 'Il mio contratto', icona: '§' }] : []),
      ],
    },
  ];
}

export function gruppiNavigazione(
  role: UserRole,
  puo: (permesso: Permesso) => boolean = () => true,
  amministra: boolean = true,
): GruppoNavigazione[] {
  // Il superadmin vede l'area di piattaforma sempre, ma le sezioni di
  // condominio solo se amministra davvero almeno uno stabile: su un condominio
  // altrui `requireCondominioAccess` risponde 403, quindi mostrargliele
  // offrirebbe strade che il backend rifiuta.
  const base: GruppoNavigazione[] =
    role === 'superadmin'
      ? [...(amministra ? amministratore : []), ...piattaforma, ...gruppoAccount(false)]
      : role === 'condomino'
        ? [...condomino, ...gruppoAccount(false)]
        : role === 'portiere'
          ? gruppoAccount(false)
          : [...amministratore, ...gruppoAccount(true)];

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