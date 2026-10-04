export { User } from './user.model.js';
export type { UserDoc, UserModel, UserMethods, UserStatics, UtenteRiepilogo } from './user.model.js';

export { Condominio } from './condominio.model.js';
export type { CondominioDoc, CondominioModel } from './condominio.model.js';

export { Unita } from './unita.model.js';
export type { UnitaDoc, UnitaModel, UnitaRiepilogo } from './unita.model.js';

export { QuotaMillesimale } from './quotaMillesimale.model.js';
export type { QuotaMillesimaleDoc, QuotaMillesimaleModel } from './quotaMillesimale.model.js';

export { Condomino } from './condomino.model.js';
export type { CondominoDoc, CondominoModel } from './condomino.model.js';

export { Assemblea } from './assemblea.model.js';
export type {
  AssembleaDoc,
  AssembleaModel,
  PuntoOrdine,
  PresenzaAssemblea,
  Votazione,
} from './assemblea.model.js';

export { Verbale } from './verbale.model.js';
export type { VerbaleDoc, VerbaleModel } from './verbale.model.js';

export { Bilancio } from './bilancio.model.js';
export type { BilancioDoc, BilancioModel, VoceBilancio } from './bilancio.model.js';

export { Versamento } from './versamento.model.js';
export type { VersamentoDoc, VersamentoModel } from './versamento.model.js';

export { Comunicazione } from './comunicazione.model.js';
export type { ComunicazioneDoc, ComunicazioneModel } from './comunicazione.model.js';

export { Allegato } from './allegato.model.js';
export type { AllegatoDoc, AllegatoModel, AllegatoRiferito } from './allegato.model.js';
export { AuditLog } from './auditLog.model.js';
export type { AuditLogDoc, AuditLogModel } from './auditLog.model.js';

export { Contratto, MESI_PER_PERIODICITA, PERIODICITA, STATI_CONTRATTO } from './contratto.model.js';
export type {
  ContrattoDoc,
  ContrattoDocumento,
  ContrattoModel,
  Periodicita,
  StatoContratto,
  VoceModifica,
  VoceStorico,
} from './contratto.model.js';

export { PagamentoContratto, STATI_RATE } from './pagamentoContratto.model.js';
export type {
  PagamentoContrattoDoc,
  PagamentoContrattoModel,
  StatoRata,
} from './pagamentoContratto.model.js';

export { MessaggioPiattaforma, TIPI_MESSAGGIO } from './messaggioPiattaforma.model.js';
export type {
  MessaggioPiattaformaDoc,
  MessaggioPiattaformaModel,
  TipoMessaggio,
} from './messaggioPiattaforma.model.js';

export { baseSchema, sanitize } from './base.js';
export type { ObjectId } from './base.js';
