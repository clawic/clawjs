import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { login, auth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: { pathname?: string } } };
  const from = location.state?.from?.pathname ?? "/sessions";

  const [email, setEmail] = useState("admin@relay.local");
  const [password, setPassword] = useState("relay-admin");
  const [tenantId, setTenantId] = useState("demo-tenant");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (auth) {
    navigate(from, { replace: true });
    return null;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await login(email, password, tenantId);
      navigate(from, { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="cb-login-page">
      <div className="cb-login-wrapper">
        <div className="cb-login-logo">
          <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
            <rect x="3" y="3" width="22" height="22" rx="2" fill="none" stroke="#1a1a24" strokeWidth="2" />
            <text
              x="14"
              y="20"
              fontFamily="Source Sans 3, sans-serif"
              fontWeight="700"
              fontSize="15"
              textAnchor="middle"
              fill="#1a1a24"
            >
              C
            </text>
            <rect x="19" y="19" width="22" height="22" rx="2" fill="#ffffff" stroke="#1a1a24" strokeWidth="2" />
            <text
              x="30"
              y="36"
              fontFamily="Source Sans 3, sans-serif"
              fontWeight="700"
              fontSize="15"
              textAnchor="middle"
              fill="#1a1a24"
            >
              R
            </text>
          </svg>
          <span className="cb-login-brand">
            Claw<strong>Relay</strong>
          </span>
        </div>

        <h4 className="cb-login-title">Superuser login</h4>

        <form onSubmit={onSubmit} className="cb-login-form" data-testid="login-form">
          <label className="cb-field required">
            <span>Tenant ID</span>
            <input
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              autoComplete="organization"
              required
            />
          </label>

          <label className="cb-field required">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </label>

          <label className="cb-field required">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <a className="cb-login-forgot" href="#" tabIndex={-1}>
            Forgotten password?
          </a>

          {error ? <p className="cb-login-error">{error}</p> : null}

          <button type="submit" data-testid="login-submit" className="cb-btn" disabled={pending}>
            <span>{pending ? "Signing in." : "Login"}</span>
            <span className="cb-btn-arrow" aria-hidden="true">
              →
            </span>
          </button>
        </form>
      </div>
    </div>
  );
}
