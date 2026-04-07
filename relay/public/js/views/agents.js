import { api } from '../api.js';
import { getAuth } from '../auth.js';

export function renderAgents(container) {
  const { tenantId } = getAuth();
  container.innerHTML = `
    <div class="page-header">
      <h2>Agents</h2>
    </div>
    <div id="agents-grid" class="card-grid"><div class="loading">Loading agents...</div></div>
  `;

  let intervals = [];

  async function load() {
    try {
      const { agents } = await api.get(`/tenants/${tenantId}/agents`);
      const grid = document.getElementById('agents-grid');
      if (!grid) return;

      if (!agents.length) {
        grid.innerHTML = '<div class="card"><p class="text-muted">No agents registered. Connect a connector to see agents here.</p></div>';
        return;
      }

      grid.innerHTML = agents.map(a => `
        <div class="card agent-card" data-agent-id="${a.agentId}">
          <div class="card-header">
            <span class="card-title">${esc(a.displayName || a.agentId)}</span>
            <span class="badge ${a.status === 'online' ? 'badge-success' : 'badge-error'}">
              <span class="dot ${a.status === 'online' ? 'dot-green' : 'dot-red'}"></span>
              ${a.status || 'unknown'}
            </span>
          </div>
          <div class="text-sm text-muted mb-8">ID: <span class="text-mono">${esc(a.agentId)}</span></div>
          ${a.version ? `<div class="text-sm text-muted mb-8">Version: ${esc(a.version)}</div>` : ''}
          ${a.capabilities?.length ? `<div class="text-sm text-muted mb-8">Capabilities: ${a.capabilities.map(c => `<span class="badge badge-info">${esc(c)}</span>`).join(' ')}</div>` : ''}
          ${a.lastSeenAt ? `<div class="text-sm text-muted mb-8">Last seen: ${fmtTime(a.lastSeenAt)}</div>` : ''}
          <div class="workspace-list" id="ws-${a.agentId}">
            <button class="btn btn-sm" onclick="this.parentElement.querySelector('.ws-items') || loadWorkspaces('${tenantId}', '${a.agentId}', this.parentElement)">Show Workspaces</button>
          </div>
        </div>
      `).join('');
    } catch (err) {
      const grid = document.getElementById('agents-grid');
      if (grid) grid.innerHTML = `<div class="card"><p class="error-msg">${esc(err.message)}</p></div>`;
    }
  }

  window.loadWorkspaces = async (tenantId, agentId, el) => {
    el.innerHTML = '<div class="text-sm text-muted">Loading...</div>';
    try {
      const { workspaces } = await api.get(`/tenants/${tenantId}/agents/${agentId}/workspaces`);
      if (!workspaces.length) {
        el.innerHTML = '<div class="text-sm text-muted">No workspaces</div>';
        return;
      }
      el.innerHTML = '<div class="ws-items">' + workspaces.map(w => `
        <a href="#/workspace/${tenantId}/${agentId}/${w.workspaceId}" class="workspace-link">
          ${esc(w.displayName || w.workspaceId)}
          <span class="text-sm text-muted"> - ${w.workspaceId}</span>
        </a>
      `).join('') + '</div>';
    } catch (err) {
      el.innerHTML = `<div class="error-msg text-sm">${esc(err.message)}</div>`;
    }
  };

  load();
  const iv = setInterval(load, 15000);
  intervals.push(iv);

  return () => {
    intervals.forEach(clearInterval);
    delete window.loadWorkspaces;
  };
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

function fmtTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString();
}
