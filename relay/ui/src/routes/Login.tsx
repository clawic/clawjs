import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { login, auth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: { pathname?: string } } };
  const from = location.state?.from?.pathname ?? "/sessions";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
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
    <div className="h-full flex items-center justify-center bg-bg-panel">
      <form
        onSubmit={onSubmit}
        className="w-80 bg-bg border border-border rounded p-5 flex flex-col gap-3"
      >
        <div>
          <div className="text-sm font-semibold">clawjs relay</div>
          <div className="text-xs text-text-muted">Sign in to continue</div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-muted">Tenant ID</span>
          <input
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            autoComplete="organization"
            required
            className="h-8 px-2 rounded-sm border border-border bg-bg-input text-text outline-none focus:border-border-strong"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-muted">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            className="h-8 px-2 rounded-sm border border-border bg-bg-input text-text outline-none focus:border-border-strong"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-text-muted">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="h-8 px-2 rounded-sm border border-border bg-bg-input text-text outline-none focus:border-border-strong"
          />
        </label>

        {error ? (
          <div className="text-xs text-red bg-red-bg rounded-sm px-2 py-1">{error}</div>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="h-8 rounded-sm bg-text text-bg text-xs font-medium hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Signing in." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
