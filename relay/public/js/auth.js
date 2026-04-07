import { api } from './api.js';

export async function login(email, password, tenantId) {
  const data = await api.post('/auth/login', { email, password, tenantId });
  sessionStorage.setItem('accessToken', data.accessToken);
  sessionStorage.setItem('refreshToken', data.refreshToken);
  sessionStorage.setItem('tenantId', data.tenantId);
  sessionStorage.setItem('role', data.role);
  sessionStorage.setItem('scopes', JSON.stringify(data.scopes));
  sessionStorage.setItem('email', email);
  return data;
}

export async function logout() {
  const rt = sessionStorage.getItem('refreshToken');
  if (rt) {
    try { await api.post('/auth/logout', { refreshToken: rt }); } catch {}
  }
  sessionStorage.clear();
}

export function getAuth() {
  const accessToken = sessionStorage.getItem('accessToken');
  if (!accessToken) return null;
  return {
    accessToken,
    tenantId: sessionStorage.getItem('tenantId'),
    role: sessionStorage.getItem('role'),
    email: sessionStorage.getItem('email'),
    scopes: JSON.parse(sessionStorage.getItem('scopes') || '[]'),
  };
}

export function isLoggedIn() {
  return !!sessionStorage.getItem('accessToken');
}

export function isAdmin() {
  return sessionStorage.getItem('role') === 'admin';
}
