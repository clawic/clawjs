/*
 * Relay API client: bearer token from sessionStorage + auto refresh on 401
 * + SSE stream helper for endpoints under /v1/.../stream.
 */

const BASE = "/v1";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    const msg =
      (body as { message?: string; error?: string } | null)?.message ||
      (body as { message?: string; error?: string } | null)?.error ||
      `HTTP ${status}`;
    super(msg);
    this.status = status;
    this.body = body;
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const rt = sessionStorage.getItem("refreshToken");
  if (!rt) return false;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) {
      sessionStorage.clear();
      return false;
    }
    const data = await res.json();
    sessionStorage.setItem("accessToken", data.accessToken);
    sessionStorage.setItem("refreshToken", data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

function refreshOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...extra };
  const token = sessionStorage.getItem("accessToken");
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

async function request<T = unknown>(
  method: string,
  path: string,
  body: unknown = null,
): Promise<T> {
  const opts = (): RequestInit => ({
    method,
    headers: authHeaders(),
    body: body != null ? JSON.stringify(body) : null,
  });

  let res = await fetch(`${BASE}${path}`, opts());

  if (res.status === 401 && sessionStorage.getItem("refreshToken")) {
    const ok = await refreshOnce();
    if (ok) res = await fetch(`${BASE}${path}`, opts());
  }

  if (!res.ok) {
    throw new ApiError(res.status, await res.json().catch(() => ({})));
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const api = {
  get: <T = unknown>(path: string) => request<T>("GET", path),
  post: <T = unknown>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T = unknown>(path: string, body?: unknown) => request<T>("PUT", path, body),
  del: <T = unknown>(path: string, body?: unknown) => request<T>("DELETE", path, body),
  patch: <T = unknown>(path: string, body?: unknown) => request<T>("PATCH", path, body),
};

/*
 * SSE streaming helper. The relay sends newline-delimited
 *   event: <type>
 *   data: <json>
 * blocks separated by blank lines. We yield { event, data } per block.
 */
export type StreamEvent = { event: string | null; data: unknown };

export async function* streamSSE(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal } = {},
): AsyncGenerator<StreamEvent> {
  const { method = "GET", body, signal } = init;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: authHeaders({ Accept: "text/event-stream" }),
    body: body != null ? JSON.stringify(body) : null,
    signal,
  });

  if (!res.ok) {
    throw new ApiError(res.status, await res.json().catch(() => ({})));
  }
  if (!res.body) return;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventType: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        const raw = line.slice(5).trim();
        if (raw) {
          let parsed: unknown = raw;
          try {
            parsed = JSON.parse(raw);
          } catch {
            /* keep raw */
          }
          yield { event: eventType, data: parsed };
          eventType = null;
        }
      } else if (line === "") {
        eventType = null;
      }
    }
  }
}
