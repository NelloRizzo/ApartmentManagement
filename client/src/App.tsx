import { Navigate, Route, Routes } from 'react-router-dom';
import { RichiediAmministratore, RichiediAutenticazione, RichiediPermesso, RichiediRuoli, RichiediRubrica, RichiediSuperadmin } from '@/components/Guardie';
import { useAuth } from '@/contexts/AuthContext';

/** Porta alla pagina iniziale del ruolo: piattaforma per il superadmin, panorama per gli altri. */
function ReindirizzaIniziale() {
  const { isSuperadmin, utente } = useAuth();
  // Il personale dello stabile non amministra: il panorama gli aprirebbe
  // pagine di gestione che il backend gli rifiuta, quindi parte dai compiti.
  if (isSuperadmin) return <Navigate to="/p" replace />;
  if (utente?.role === 'portiere') return <Navigate to="/c/compiti" replace />;
  return <Navigate to="/c/panorama" replace />;
}
import PaginaAccesso from '@/pages/PaginaAccesso';
import GuscioApp from '@/pages/GuscioApp';
import PaginaPanorama from '@/pages/PaginaPanorama';
import PaginaCondomini from '@/pages/PaginaCondomini';
import PaginaTabellaMillesimi from '@/pages/PaginaTabellaMillesimi';
import PaginaAssemblee from '@/pages/PaginaAssemblee';
import PaginaAssembleaDettaglio from '@/pages/PaginaAssembleaDettaglio';
import PaginaVerbali from '@/pages/PaginaVerbali';
import PaginaQuote from '@/pages/PaginaQuote';
import PaginaVersamenti from '@/pages/PaginaVersamenti';
import PaginaComunicazioni from '@/pages/PaginaComunicazioni';
import PaginaProfilo from '@/pages/PaginaProfilo';
import PaginaResidenti from '@/pages/PaginaResidenti';
import PaginaUnita from '@/pages/PaginaUnita';
import PaginaIscritti from '@/pages/PaginaIscritti';
import PaginaBilanci from '@/pages/PaginaBilanci';
import PaginaNuovoVersamento from '@/pages/PaginaNuovoVersamento';
import PaginaTeam from '@/pages/PaginaTeam';
import PaginaBacheca from '@/pages/PaginaBacheca';
import PaginaContratti from '@/pages/PaginaContratti';
import PaginaContrattoDettaglio from '@/pages/PaginaContrattoDettaglio';
import PaginaAmministratori from '@/pages/PaginaAmministratori';
import PaginaMessaggiPiattaforma from '@/pages/PaginaMessaggiPiattaforma';
import PaginaMioContratto from '@/pages/PaginaMioContratto';
import PaginaPiattaforma from '@/pages/PaginaPiattaforma';
import PaginaConfermaEmail from '@/pages/PaginaConfermaEmail';
import { Notifiche } from '@/components/Feedback';

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/accedi" element={<PaginaAccesso />} />
        {/* Pubblica: chi clicca il link nell'email non è ancora collegato. */}
        <Route path="/conferma-email" element={<PaginaConfermaEmail />} />

        <Route
          element={
            <RichiediAutenticazione>
              <GuscioApp />
            </RichiediAutenticazione>
          }
        >
          {/*
            La destinazione iniziale dipende dal ruolo: il superadmin non
            amministra alcun condominio, quindi il suo punto di partenza è la
            piattaforma, non il panorama di uno stabile.
          */}
          <Route index element={<ReindirizzaIniziale />} />

          <Route
            path="c/panorama"
            element={
              <RichiediAmministratore>
                <PaginaPanorama />
              </RichiediAmministratore>
            }
          />
          <Route
            path="c/condomini"
            element={
              <RichiediAmministratore>
                <PaginaCondomini />
              </RichiediAmministratore>
            }
          />
          <Route
            path="c/tabella"
            element={
              <RichiediAmministratore>
                <PaginaTabellaMillesimi />
              </RichiediAmministratore>
            }
          />
          <Route
            path="c/unita"
            element={
              <RichiediAmministratore>
                <PaginaUnita />
              </RichiediAmministratore>
            }
          />
          <Route
            path="c/iscritti"
            element={
              <RichiediAmministratore>
                <PaginaIscritti />
              </RichiediAmministratore>
            }
          />
          <Route
            path="c/bilanci"
            element={
              <RichiediAmministratore>
                <PaginaBilanci />
              </RichiediAmministratore>
            }
          />
          <Route
            path="c/team"
            element={
              <RichiediPermesso permesso="amministrazione:leggere">
                <PaginaTeam />
              </RichiediPermesso>
            }
          />
          {/* La bacheca è del team: anche l'assistente deve arrivarci, quindi non
              c'è un permesso. `RichiediRuoli` esclude il superadmin, che dal
              server riceve 403 su queste rotte. */}
          <Route
            path="c/bacheca"
            element={
              <RichiediRuoli ruoli={['admin']}>
                <PaginaBacheca />
              </RichiediRuoli>
            }
          />
          {/* La stessa pagina per il personale dello stabile, che riceve e
              annota i compiti ma non li crea. Sul server `filtroVisibile`
              lascia vedere solo le attività di cui è proprietario o assegnatario. */}
          <Route
            path="c/compiti"
            element={
              <RichiediRuoli ruoli={['portiere']}>
                <PaginaBacheca />
              </RichiediRuoli>
            }
          />
          <Route
            path="c/residenti"
            element={
              <RichiediAmministratore>
                <RichiediRubrica>
                  <PaginaResidenti />
                </RichiediRubrica>
              </RichiediAmministratore>
            }
          />
          {/*
            Aperto anche al condòmino: è la sezione in cui legge l'ordine del
            giorno delle assemblee convocate. Il server gli restituisce solo
            quelle in cui è iscritto e senza i dati di gestione, quindi non
            serve una guardia di ruolo qui.
          */}
          <Route path="c/assemblee" element={<PaginaAssemblee />} />
          <Route path="c/assemblee/:id" element={<PaginaAssembleaDettaglio />} />
          <Route
            path="c/quote"
            element={
              <RichiediAmministratore>
                <PaginaQuote />
              </RichiediAmministratore>
            }
          />

          <Route
            path="c/versamenti/nuovo"
            element={
              <RichiediPermesso permesso="versamenti:scrivere">
                <PaginaNuovoVersamento />
              </RichiediPermesso>
            }
          />
          <Route path="c/versamenti" element={<PaginaVersamenti />} />
          <Route path="c/verbali" element={<PaginaVerbali />} />
          <Route path="c/comunicazioni" element={<PaginaComunicazioni />} />
          <Route path="profilo" element={<PaginaProfilo />} />
          <Route
            path="contratto"
            element={
              <RichiediRuoli ruoli={['admin', 'superadmin']}>
                <PaginaMioContratto />
              </RichiediRuoli>
            }
          />
        </Route>

        {/* Area riservata all'amministratore di piattaforma. */}
        <Route
          element={
            <RichiediAutenticazione>
              <RichiediSuperadmin>
                <GuscioApp />
              </RichiediSuperadmin>
            </RichiediAutenticazione>
          }
        >
          <Route path="p" element={<PaginaPiattaforma />} />
          <Route path="p/contratti" element={<PaginaContratti />} />
          <Route path="p/contratti/:id" element={<PaginaContrattoDettaglio />} />
          <Route path="p/amministratori" element={<PaginaAmministratori />} />
          <Route path="p/messaggi" element={<PaginaMessaggiPiattaforma />} />
          <Route path="profilo" element={<PaginaProfilo />} />
          <Route path="contratto" element={<PaginaMioContratto />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Notifiche />
    </>
  );
}
