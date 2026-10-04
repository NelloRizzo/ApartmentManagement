import type { ReactNode } from 'react';

export function Statistica({
  valore,
  etichetta,
  tono,
}: {
  valore: ReactNode;
  etichetta: string;
  tono?: 'neutro' | 'successo' | 'pericolo' | 'avviso' | 'accento';
}) {
  const colore =
    tono === 'successo' ? 'var(--c-success)'
    : tono === 'pericolo' ? 'var(--c-danger)'
    : tono === 'avviso' ? 'var(--c-warning)'
    : tono === 'accento' ? 'var(--c-accent)'
    : 'var(--c-text)';

  return (
    <div className="statistica">
      <div className="statistica-valore" style={{ color: colore }}>
        {valore}
      </div>
      <div className="statistica-etichetta">{etichetta}</div>
    </div>
  );
}

const coloriStato: Record<string, string> = {
  // Assemblee
  bozza: 'neutro',
  convocata: 'info',
  in_corso: 'avviso',
  conclusa: 'successo',
  annullata: 'pericolo',
  // Quote
  pagato: 'successo',
  parziale: 'avviso',
  non_pagato: 'pericolo',
  // Comunicazioni
  inviata: 'info',
  letta: 'neutro',
  risposta: 'accento',
  // Contratti di fornitura
  attivo: 'successo',
  sospeso: 'pericolo',
  scaduto: 'avviso',
  cessato: 'neutro',
  // Rate del canone
  da_pagare: 'avviso',
  annullato: 'neutro',
  // Generico
  approvato: 'successo',
  respinto: 'pericolo',
  rinviato: 'avviso',
  dibattuto: 'neutro',
};

const etichetteStato: Record<string, string> = {
  bozza: 'Bozza',
  convocata: 'Convocata',
  in_corso: 'In corso',
  conclusa: 'Conclusa',
  annullata: 'Annullata',
  pagato: 'Pagato',
  parziale: 'Parziale',
  non_pagato: 'Non pagato',
  inviata: 'Inviata',
  letta: 'Letta',
  risposta: 'Risposta',
  attivo: 'Attivo',
  sospeso: 'Sospeso',
  scaduto: 'Scaduto',
  cessato: 'Cessato',
  da_pagare: 'Da pagare',
  annullato: 'Annullato',
  approvato: 'Approvato',
  respinto: 'Respinto',
  rinviato: 'Rinviato',
  dibattuto: 'Dibattuto',
};

export function EtichettaStato({ stato, testo }: { stato: string; testo?: string }) {
  const tono = coloriStato[stato] ?? 'neutro';
  return <span className={`etichetta etichetta-${tono}`}>{testo ?? etichetteStato[stato] ?? stato}</span>;
}

/** Etichetta leggibile di uno stato: usata anche nei selettori, non solo nei badge. */
export function testoStato(stato: string): string {
  return etichetteStato[stato] ?? stato;
}

const etichetteRegime: Record<string, string> = {
  proprietario: 'Proprietario',
  inquilino: 'Inquilino',
  comodatario: 'Comodatario',
  nuda_proprieta: 'Nuda proprietà',
};

const etichetteTipo: Record<string, string> = {
  appartamento: 'Appartamento',
  ufficio: 'Ufficio',
  negozio: 'Negozio',
  garage: 'Garage',
  cantina: 'Cantina',
  soffitta: 'Soffitta',
  altro: 'Altro',
};

const etichetteRipartizione: Record<string, string> = {
  diritto: 'Diritto',
  uso: 'Uso',
  spese: 'Spese',
  scale: 'Scale',
  ascensore: 'Ascensore',
};

const etichetteTipoAssemblea: Record<string, string> = {
  ordinaria: 'Ordinaria',
  straordinaria: 'Straordinaria',
};

const etichetteTipoComunicazione: Record<string, string> = {
  avviso: 'Avviso',
  richiesta: 'Richiesta',
  reclamo: 'Reclamo',
  segnalazione: 'Segnalazione',
  risposta: 'Risposta',
  convocazione: 'Convocazione',
};

const etichetteMetodo: Record<string, string> = {
  bonifico: 'Bonifico',
  contanti: 'Contanti',
  carta: 'Carta',
  addebito_direct: 'Addebito SEPA',
  altro: 'Altro',
};

const etichetteCategoria: Record<string, string> = {
  gestione: 'Gestione',
  pulizie: 'Pulizie',
  manutenzione: 'Manutenzione',
  ascensore: 'Ascensore',
  riscaldamento: 'Riscaldamento',
  illuminazione: 'Illuminazione',
  acqua: 'Acqua',
  energia: 'Energia',
  assicurazione: 'Assicurazione',
  imposte: 'Imposte',
  fondo: 'Fondo',
  altro: 'Altro',
};

const etichetteRuolo: Record<string, string> = {
  superadmin: 'Amministratore di piattaforma',
  admin: 'Amministratore',
  portiere: 'Portiere',
  condomino: 'Condòmino',
};

/** Etichette leggibili per ogni enumerazione del dominio. */
export const etichette = {
  regime: (v: string) => etichetteRegime[v] ?? v,
  tipoUnita: (v: string) => etichetteTipo[v] ?? v,
  ripartizione: (v: string) => etichetteRipartizione[v] ?? v,
  tipoAssemblea: (v: string) => etichetteTipoAssemblea[v] ?? v,
  stato: (v: string) => etichetteStato[v] ?? v,
  tipoComunicazione: (v: string) => etichetteTipoComunicazione[v] ?? v,
  metodo: (v: string) => etichetteMetodo[v] ?? v,
  categoria: (v: string) => etichetteCategoria[v] ?? v,
  ruolo: (v: string) => etichetteRuolo[v] ?? v,
};
