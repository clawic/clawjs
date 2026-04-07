const BASE = '/v1';

let refreshPromise = null;

class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || body?.error || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function doRefresh() {
  const rt = sessionStorage.getItem('refreshToken');
  if (!rt) return false;
  try {
    const res = await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) { sessionStorage.clear(); return false; }
    const data = await res.json();
    sessionStorage.setItem('accessToken', data.accessToken);
    sessionStorage.setItem('refreshToken', data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

async function refreshOnce() {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

export const api = {
  async request(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token = sessionStorage.getItem('accessToken');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : null,
    });

    if (res.status === 401 && sessionStorage.getItem('refreshToken')) {
      const ok = await refreshOnce();
      if (ok) {
        headers['Authorization'] = `Bearer ${sessionStorage.getItem('accessToken')}`;
        res = await fetch(`${BASE}${path}`, {
          method,
          headers,
          body: body != null ? JSON.stringify(body) : null,
        });
      }
    }

    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  },

  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },
  put(path, body) { return this.request('PUT', path, body); },
  del(path, body) { return this.request('DELETE', path, body); },
  patch(path, body) { return this.request('PATCH', path, body); },

  async *stream(path, body, signal) {
    const headers = { 'Content-Type': 'application/json' };
    const token = sessionStorage.getItem('accessToken');
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers,
      body: body != null ? JSON.stringify(body) : null,
      signal,
    });
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      let eventType = null;
      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          const raw = line.slice(5).trim();
          if (raw) {
            try {
              yield { event: eventType, data: JSON.parse(raw) };
            } catch {
              yield { event: eventType, data: raw };
            }
          }
          eventType = null;
        }
      }
    }
  },
};
