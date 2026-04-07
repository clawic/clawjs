import { isLoggedIn, isAdmin, getAuth, logout } from './auth.js';
import { renderLogin } from './views/login.js';
import { renderAgents } from './views/agents.js';
import { renderWorkspace } from './views/workspace.js';
import { renderAdmin } from './views/admin.js';

const routes = [
  { pattern: '/login', render: renderLogin },
  { pattern: '/agents', render: renderAgents },
  { pattern: '/workspace/:tenantId/:agentId/:workspaceId', render: renderWorkspace },
  { pattern: '/admin', render: renderAdmin },
];

let currentCleanup = null;

function matchRoute(hash) {
  for (const route of routes) {
    const patternParts = route.pattern.split('/');
    const hashParts = hash.split('/');
    if (patternParts.length !== hashParts.length) continue;
    const params = {};
    let match = true;
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = decodeURIComponent(hashParts[i]);
      } else if (patternParts[i] !== hashParts[i]) {
        match = false;
        break;
      }
    }
    if (match) return { route, params };
  }
  return null;
}

function renderNav() {
  const sidebar = document.getElementById('sidebar');
  const nav = document.getElementById('nav');
  const userInfo = document.getElementById('user-info');

  if (!isLoggedIn()) {
    sidebar.classList.add('hidden');
    return;
  }

  sidebar.classList.remove('hidden');
  const auth = getAuth();
  const hash = location.hash.slice(1) || '/agents';

  nav.innerHTML = `
    <a href="#/agents" class="${hash.startsWith('/agents') ? 'active' : ''}">Agents</a>
    ${isAdmin() ? `<a href="#/admin" class="${hash.startsWith('/admin') ? 'active' : ''}">Admin</a>` : ''}
  `;

  userInfo.innerHTML = `
    <span class="email">${auth.email}</span>
    <span class="text-sm">${auth.role} &middot; ${auth.tenantId}</span>
    <button class="logout-btn mt-8" id="logout-btn">Logout</button>
  `;

  document.getElementById('logout-btn').onclick = async () => {
    await logout();
    location.hash = '#/login';
  };
}

function route() {
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }

  const hash = location.hash.slice(1) || (isLoggedIn() ? '/agents' : '/login');

  if (!isLoggedIn() && hash !== '/login') {
    location.hash = '#/login';
    return;
  }
  if (isLoggedIn() && hash === '/login') {
    location.hash = '#/agents';
    return;
  }

  renderNav();

  const container = document.getElementById('app');
  container.innerHTML = '';

  const matched = matchRoute(hash);
  if (matched) {
    const cleanup = matched.route.render(container, matched.params);
    if (typeof cleanup === 'function') currentCleanup = cleanup;
  } else {
    container.innerHTML = '<div class="loading">Page not found</div>';
  }
}

window.addEventListener('hashchange', route);
route();
