import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/hooks/useApi';
import { api, ApiError } from '@/api/client';
import { notifica } from '@/hooks/useNotifiche';
import { Caricamento, ErroreCaricamento, PaginaVuota } from '@/components/Feedback';
import { EtichettaStato, etichette } from '@/components/Elementi';
import { TitoloPagina, RichiediCondominio } from '@/components/TitoloPagina';
import { data as fmtData, perInputData, numero } from '@/lib/formattazione';
import type { ApiEnvelope, Assemblea, PageMeta, TipoAssemblea, TipoBilancio } from '@/types/domain';

const MESI_FUTURO = 12;

/** Punto all'ordine in bozza, prima che l'assemblea gli assegni un ordine. */
interface PuntoInBozza {
  titolo: string;
  descrizione: string;
  /** Già presente se il punto arriva da un modello: la delibera è scritta. */
  delibera?: string;
  /** Bilancio cui il punto si riferisce: le cifre finiscono nel verbale. */
  bilancio?: string;
}

/** Modello di punto all'ordineofferto dal server, con la delibera già composta. */
interface ModelloOrdine {
  chiave: string;
  etichetta: string;
  richiede: TipoBilancio;
  disponibile: boolean;
  bilancioId?: string;
  punto: { titolo: string; descrizione: string; delibera: string; bilancio?: string };
}

export default function PaginaAssemblee() {
  const { condominioId, puo } = useAuth();
  const [filtroStato, setFiltroStato] = useState('');
  const [creazioneAperta, setCreazioneAperta] = useState(false);
  // Il condòmino non scrive assemblee: nasconde la creazione e gli stati che
  // il server non gli restituirebbe mai.
  const puoScrivere = puo('assemblee:scrivere');

  const elenco = useApi<ApiEnvelope<Assemblea[]>>(
    (segnale) =>
      api.get<Assemblea[]>(
        `/condomini/${condominioId}/assemblee`,
        { page: 1, limit: 50, ...(filtroStato ? { stato: filtroStato } : {}) },
        { signal: segnale },
      ),
    [condominioId, filtroStato],
    { attivo: Boolean(condominioId) },
  );

  if (!condominioId) return null;

  const assemblee = elenco.dati?.data ?? [];
  const meta: PageMeta | undefined = elenco.dati?.meta;

  return (
    <RichiediCondominio>
      <TitoloPagina
        titolo="Assemblee"
        descrizione={
          puoScrivere
            ? 'Convocazioni, ordine del giorno e verbalizzazione.'
            : 'Le assemblee convocate nel tuo condominio, con l’ordine del giorno e il materiale di ogni punto.'
        }
        azioni={
          puoScrivere ? (
            <button
              type="button"
              className="btn btn-primario"
              onClick={() => setCreazioneAperta((v) => !v)}
            >
              {creazioneAperta ? 'Annulla' : '+ Nuova assemblea'}
            </button>
          ) : undefined
        }
      />

      {creazioneAperta && puoScrivere && (
        <ModuloAssemblea onCreatata={elenco.ricarica} onAnnulla={() => setCreazioneAperta(false)} />
      )}

      <div className="campo" style={{ marginBottom: 'var(--sp-3)' }}>
        <label className="campo-etichetta" htmlFor="filtro-stato">
          Filtra per stato
        </label>
        <select id="filtro-stato" className="area" value={filtroStato} onChange={(e) => setFiltroStato(e.target.value)}>
          <option value="">Tutti gli stati</option>
          {/* Bozza e annullata non arrivano mai a chi non amministra: filtrare
              su quegli stati mostrerebbe un elenco vuoto che sembra un errore. */}
          {puoScrivere && <option value="bozza">Bozza</option>}
          <option value="convocata">Convocata</option>
          <option value="in_corso">In corso</option>
          <option value="conclusa">Conclusa</option>
          {puoScrivere && <option value="annullata">Annullata</option>}
        </select>
      </div>

      {elenco.inCorso && <Caricamento />}
      {elenco.errore && <ErroreCaricamento messaggio={elenco.errore} onRiprova={elenco.ricarica} />}

      {elenco.dati && assemblee.length === 0 && (
        <PaginaVuota
          titolo="Nessuna assemblea"
          descrizione={
            puoScrivere
              ? 'Crea la prima assemblea per convocare i condòmini e verbalizzare le delibere.'
              : 'Non ci sono ancora assemblee convocate nel tuo condominio.'
          }
        />
      )}

      <div className="elenco">
        {assemblee.map((a) => (
          <Link key={a._id} to={`/c/assemblee/${a._id}`} className="scheda" style={{ marginBottom: 'var(--sp-2)', color: 'inherit' }}>
            <div className="scheda-corpo pila-2">
              <div className="riga riga-tra">
                <strong>
                  Assemblea {etichette.tipoAssemblea(a.tipo)} n. {a.numero}
                </strong>
                <EtichettaStato stato={a.stato} />
              </div>
              <div className="testo-faint">
                {fmtData(a.data)} · {a.luogo}
              </div>
              <div className="riga">
                <span className="etichetta etichetta-neutro">
                  {a.ordineDelGiorno.length} punti all’ordine del giorno
                </span>
                {a.verbale && (
                  <span className={`etichetta ${a.verbale.approvato ? 'etichetta-successo' : 'etichetta-info'}`}>
                    Verbale n. {a.verbale.numero}
                  </span>
                )}
                {/*
                  La presenza del totale, non quella dei presenti, decide se
                  mostrare il badge: con zero presenti il conteggio è proprio
                  la cosa che il segretario vuole vedere.
                */}
                {a.millesimiTotali > 0 && (
                  <span className="etichetta etichetta-neutro">
                    {numero(a.numeroPresenti ?? 0)} presenti · {numero(a.millesimiPresenti)}/
                    {numero(a.millesimiTotali)} millesimi
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {meta && meta.total > 0 && (
        <p className="testo-faint testo-centrato" style={{ marginTop: 'var(--sp-3)' }}>
          {meta.total} assemblee in totale
        </p>
      )}
    </RichiediCondominio>
  );
}

function ModuloAssemblea({ onCreatata, onAnnulla }: { onCreatata: () => void; onAnnulla: () => void }) {
  const { condominioId } = useAuth();
  const naviga = useNavigate();
  const [tipo, setTipo] = useState<TipoAssemblea>('ordinaria');
  const [data, setData] = useState(perInputData(new Date()));
  const [oraInizio, setOraInizio] = useState('18:00');
  const [luogo, setLuogo] = useState('');
  const [punti, setPunti] = useState<PuntoInBozza[]>([{ titolo: '', descrizione: '' }]);
  const [annoBilanci, setAnnoBilanci] = useState(new Date().getFullYear());
  const [modelloScelto, setModelloScelto] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const modelli = useApi<ModelloOrdine[]>(
    (segnale) =>
      api
        .get<ModelloOrdine[]>(
          `/condomini/${condominioId}/assemblee/modelli`,
          { anno: annoBilanci },
          { signal: segnale },
        )
        .then((r) => r.data),
    [condominioId, annoBilanci],
    { attivo: Boolean(condominioId) },
  );

  function aggiungiDaModello(chiave: string) {
    const modello = modelli.dati?.find((m) => m.chiave === chiave);
    if (!modello) return;
    setPunti((precedenti) => {
      // Una riga vuota finale è solo un segnaposto: se esiste, la si riutilizza.
      const vuota = precedenti.at(-1);
      const base = vuota && !vuota.titolo.trim() ? precedenti.slice(0, -1) : precedenti;
      return [
        ...base,
        {
          titolo: modello.punto.titolo,
          descrizione: modello.punto.descrizione,
          delibera: modello.punto.delibera,
          bilancio: modello.punto.bilancio,
        },
        { titolo: '', descrizione: '' },
      ];
    });
    setModelloScelto('');
  }

  async function salva() {
    setErrore(null);
    setInCorso(true);
    try {
      const risposta = await api.post<Assemblea>(`/condomini/${condominioId}/assemblee`, {
        tipo,
        data,
        oraInizio: oraInizio || undefined,
        luogo: luogo.trim(),
        ordineDelGiorno: punti
          .filter((p) => p.titolo.trim())
          .map((p, i) => ({
            ordine: i + 1,
            titolo: p.titolo.trim(),
            descrizione: p.descrizione.trim() || undefined,
            delibera: p.delibera?.trim() || undefined,
            bilancio: p.bilancio,
          })),
      });
      notifica(`Assemblea n. ${risposta.data.numero} creata come bozza`);
      onCreatata();
      naviga(`/c/assemblee/${risposta.data._id}`);
    } catch (e) {
      setErrore(e instanceof ApiError ? e.message : 'Creazione non riuscita');
    } finally {
      setInCorso(false);
    }
  }

  return (
    <section className="scheda" style={{ marginBottom: 'var(--sp-4)' }}>
      <div className="scheda-intestazione">
        <h2>Nuova assemblea</h2>
      </div>
      <div className="scheda-corpo pila-4">
        <div className="campo">
          <label className="campo-etichetta" htmlFor="tipo">
            Tipo
          </label>
          <select id="tipo" className="area" value={tipo} onChange={(e) => setTipo(e.target.value as TipoAssemblea)}>
            <option value="ordinaria">Ordinaria</option>
            <option value="straordinaria">Straordinaria</option>
          </select>
          {tipo === 'straordinaria' && (
            <span className="campo-aiuto">
              Le materie riservate all’assemblea straordinaria richiedono la maggioranza dei condomini e dei due
              terzi dei millesimi (art. 1136 c.c.).
            </span>
          )}
        </div>

        <div className="riga">
          <div className="campo cresci">
            <label className="campo-etichetta" htmlFor="data-ass">
              Data
            </label>
            <input
              id="data-ass"
              className="area"
              type="date"
              min={perInputData(new Date(Date.now() - MESI_FUTURO * 86_400_000))}
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          <div className="campo cresci">
            <label className="campo-etichetta" htmlFor="ora-ass">
              Ora
            </label>
            <input id="ora-ass" className="area" type="time" value={oraInizio} onChange={(e) => setOraInizio(e.target.value)} />
          </div>
        </div>

        <div className="campo">
          <label className="campo-etichetta" htmlFor="luogo">
            Luogo di riunione
          </label>
          <input
            id="luogo"
            className="area"
            value={luogo}
            onChange={(e) => setLuogo(e.target.value)}
            placeholder="Sala riunioni del condominio"
          />
        </div>

        <div className="campo">
          <span className="campo-etichetta">Ordine del giorno</span>

          <div className="riga">
            <div className="cresci">
              <label className="campo-etichetta" htmlFor="anno-modelli">
                Anno dei bilanci
              </label>
              <input
                id="anno-modelli"
                className="area"
                type="number"
                min="2000"
                max="2100"
                value={annoBilanci}
                onChange={(e) => setAnnoBilanci(Number(e.target.value))}
              />
            </div>
            <div className="cresci">
              <label className="campo-etichetta" htmlFor="modello-punto">
                Aggiungi da modello
              </label>
              <select
                id="modello-punto"
                className="area"
                value={modelloScelto}
                onChange={(e) => {
                  setModelloScelto(e.target.value);
                  aggiungiDaModello(e.target.value);
                }}
              >
                <option value="">Scegli un punto già scritto…</option>
                {modelli.dati?.map((m) => (
                  <option key={m.chiave} value={m.chiave}>
                    {m.etichetta}
                    {m.disponibile ? '' : ' (bilancio non ancora predisposto)'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="campo-aiuto">
            I punti scelti da modello arrivano con la delibera già formulata e con il bilancio
            collegato: le cifre del verbale verranno prese dal documento, non ricopiate a mano.
          </p>

          {punti.map((p, i) => (
            <div key={i} className="pila-2">
              <div className="riga">
                <input
                  className="area cresci"
                  value={p.titolo}
                  onChange={(e) =>
                    setPunti((precedenti) =>
                      precedenti.map((x, j) => (j === i ? { ...x, titolo: e.target.value } : x)),
                    )
                  }
                  placeholder={`Punto ${i + 1}`}
                />
                {p.titolo.trim() && (
                  <button
                    type="button"
                    className="btn btn-sm btn-pericolo"
                    onClick={() => setPunti((precedenti) => precedenti.filter((_, j) => j !== i))}
                    aria-label={`Rimuovi il punto ${i + 1}`}
                  >
                    Rimuovi
                  </button>
                )}
              </div>
              <input
                className="area"
                value={p.descrizione}
                onChange={(e) =>
                  setPunti((precedenti) =>
                    precedenti.map((x, j) => (j === i ? { ...x, descrizione: e.target.value } : x)),
                  )
                }
                placeholder="Descrizione (facoltativa)"
              />
              {p.delibera && (
                <p className="campo-aiuto">
                  Delibera già formulata: {p.delibera}
                  {p.bilancio ? ' Le cifre verranno lette dal bilancio collegato.' : ''}
                </p>
              )}
            </div>
          ))}
          <button
            type="button"
            className="btn btn-secondario btn-sm"
            onClick={() => setPunti((p) => [...p, { titolo: '', descrizione: '' }])}
          >
            + Aggiungi punto
          </button>
        </div>

        {errore && (
          <div className="avviso avviso-pericolo" role="alert">
            {errore}
          </div>
        )}

        <div className="riga">
          <button
            type="button"
            className="btn btn-primario cresci"
            onClick={salva}
            disabled={inCorso || !luogo.trim()}
          >
            {inCorso ? 'Creazione…' : 'Crea assemblea'}
          </button>
          <button type="button" className="btn btn-fantasma" onClick={onAnnulla}>
            Annulla
          </button>
        </div>
      </div>
    </section>
  );
}
