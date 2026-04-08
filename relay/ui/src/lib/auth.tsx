import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";

export type AuthState = {
  accessToken: string;
  tenantId: string;
  role: string;
  email: string;
  scopes: string[];
};

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  tenantId: string;
  role: string;
  scopes: string[];
};

type AuthContextValue = {
  auth: AuthState | null;
  isAdmin: boolean;
  login: (email: string, password: string, tenantId: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readAuthFromStorage(): AuthState | null {
  const accessToken = sessionStorage.getItem("accessToken");
  if (!accessToken) return null;
  return {
    accessToken,
    tenantId: sessionStorage.getItem("tenantId") ?? "",
    role: sessionStorage.getItem("role") ?? "",
    email: sessionStorage.getItem("email") ?? "",
    scopes: JSON.parse(sessionStorage.getItem("scopes") ?? "[]"),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(() => readAuthFromStorage());

  const login = useCallback(async (email: string, password: string, tenantId: string) => {
    const data = await api.post<LoginResponse>("/auth/login", { email, password, tenantId });
    sessionStorage.setItem("accessToken", data.accessToken);
    sessionStorage.setItem("refreshToken", data.refreshToken);
    sessionStorage.setItem("tenantId", data.tenantId);
    sessionStorage.setItem("role", data.role);
    sessionStorage.setItem("scopes", JSON.stringify(data.scopes));
    sessionStorage.setItem("email", email);
    setAuth({
      accessToken: data.accessToken,
      tenantId: data.tenantId,
      role: data.role,
      email,
      scopes: data.scopes,
    });
  }, []);

  const logout = useCallback(async () => {
    const rt = sessionStorage.getItem("refreshToken");
    if (rt) {
      try {
        await api.post("/auth/logout", { refreshToken: rt });
      } catch {
        /* ignore */
      }
    }
    sessionStorage.clear();
    setAuth(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ auth, isAdmin: auth?.role === "admin", login, logout }),
    [auth, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
