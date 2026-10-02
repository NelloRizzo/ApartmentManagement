import { Navigate, Route, Routes } from 'react-router-dom';
import { RichiediAmministratore, RichiediAutenticazione, RichiediPermesso, RichiediRuoli, RichiediSuperadmin } from '@/components/Guardie';
import { useAuth } from '@/contexts/AuthContext';

/** Porta alla dashboard del ruolo: piattaforma per il superadmin, panorama per gli altri. */
function ReindirizzaIniziale() {
  const { isSuperadmin } = useAuth();
  return <Navigate to={isSuperadmin ? '/p' : '/c/panorama'} replace />;
}
import PaginaAccesso from '@/pages/PaginaAccesso';
import GuscioApp from '@/pages/GuscioApp';
import PaginaPanorama from '@/pages/PaginaPanorama';
import PaginaTabellaMillesimi from '@/pages/PaginaTabellaMillesimi';
import PaginaAssemblee from '@/pages/PaginaAssemblee';
import PaginaAssembleaDettaglio from '@/pages/PaginaAssembleaDettaglio';
import PaginaVerbali from '@/pages/PaginaVerbali';
import PaginaQuote from '@/pages/PaginaQuote';
import PaginaVersamenti from '@/pages/PaginaVersamenti';
import PaginaComunicazioni from '@/pages/PaginaComunicazioni';
import PaginaProfilo from '@/pages/PaginaProfilo';
import PaginaUnita from '@/pages/PaginaUnita';
import PaginaIscritti from '@/pages/PaginaIscritti';
import PaginaBilanci from '@/pages/PaginaBilanci';
import PaginaNuovoVersamento from '@/pages/PaginaNuovoVersamento';
import PaginaTeam from '@/pages/PaginaTeam';
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
          <Route
            path="c/assemblee"
            element={
              <RichiediAmministratore>
                <PaginaAssemblee />
              </RichiediAmministratore>
            }
          />
          <Route
            path="c/assemblee/:id"
            element={
              <RichiediAmministratore>
                <PaginaAssembleaDettaglio />
              </RichiediAmministratore>
            }
          />
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
