import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ApiError } from '@/api/client';

export default function PaginaAccesso() {
  const { login } = useAuth();
  const naviga = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  async function invia(evento: FormEvent) {
    evento.preventDefault();
    setErrore(null);
    setInCorso(true);
    try {
      await login(email.trim(), password);
      naviga('/', { replace: true });
    } catch (e) {
      setErrore(
        e instanceof ApiError ? e.message : 'Impossibile contattare il server. Verifica la connessione.',
      );
    } finally {
      setInCorso(false);
    }
  }

  const accessiDemo = [
    { etichetta: 'Amministratore', email: 'admin@condomini.local', password: 'Admin123!' },
    { etichetta: 'Condòmino', email: 'marco.rossi@example.com', password: 'Condomino123!' },
  ];

  return (
    <div className="login">
      <div className="login-scheda">
        <div className="login-marca">
          <div className="marchio" aria-hidden="true">
            ⌂
          </div>
          <h1>Steward</h1>
          <p>Steward Management System</p>
        </div>

        <form onSubmit={invia} className="pila-4" noValidate>
          <div className="campo">
            <label className="campo-etichetta" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className={`area${errore ? ' area-errore' : ''}`}
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@esempio.it"
            />
          </div>

          <div className="campo">
            <label className="campo-etichetta" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className={`area${errore ? ' area-errore' : ''}`}
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {errore && (
            <div className="avviso avviso-pericolo" role="alert">
              {errore}
            </div>
          )}

          <button type="submit" className="btn btn-primario btn-pieno btn-grande" disabled={inCorso}>
            {inCorso ? 'Accesso in corso…' : 'Accedi'}
          </button>
        </form>

        {import.meta.env.DEV && (
          <div className="login-demo">
            <strong>Accessi dimostrativi</strong>
            {accessiDemo.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => {
                  setEmail(a.email);
                  setPassword(a.password);
                }}
              >
                {a.etichetta}: {a.email}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
