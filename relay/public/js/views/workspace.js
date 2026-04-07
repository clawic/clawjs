import { api } from '../api.js';
import { renderActivity } from './activity.js';
import { renderUsage } from './usage.js';
import { renderSessions } from './sessions.js';
import { renderResources } from './resources.js';

export function renderWorkspace(container, params) {
  const { tenantId, agentId, workspaceId } = params;
  const prefix = `/tenants/${tenantId}/agents/${agentId}/workspaces/${workspaceId}`;
  let currentTab = 'activity';
  let tabCleanup = null;

  container.innerHTML = `
    <div class="breadcrumb">
      <a href="#/agents">Agents</a> / ${esc(agentId)} / ${esc(workspaceId)}
    </div>
    <div class="page-header">
      <h2>${esc(workspaceId)}</h2>
      <div id="ws-status"></div>
    </div>
    <div class="tabs" id="ws-tabs">
      <button class="tab active" data-tab="activity">Activity</button>
      <button class="tab" data-tab="usage">Usage</button>
      <button class="tab" data-tab="sessions">Sessions</button>
      <button class="tab" data-tab="resources">Resources</button>
      <button class="tab" data-tab="status">Status</button>
    </div>
    <div id="tab-content"></div>
  `;

  loadStatus(prefix);

  document.getElementById('ws-tabs').onclick = (e) => {
    const tab = e.target.dataset?.tab;
    if (!tab || tab === currentTab) return;
    currentTab = tab;
    document.querySelectorAll('#ws-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    renderTab();
  };

  function renderTab() {
    if (tabCleanup) { tabCleanup(); tabCleanup = null; }
    const el = document.getElementById('tab-content');
    el.innerHTML = '';
    switch (currentTab) {
      case 'activity': tabCleanup = renderActivity(el, prefix); break;
      case 'usage': tabCleanup = renderUsage(el, prefix); break;
      case 'sessions': tabCleanup = renderSessions(el, prefix); break;
      case 'resources': tabCleanup = renderResources(el, prefix); break;
      case 'status': renderStatusTab(el, prefix); break;
    }
  }

  renderTab();

  return () => {
    if (tabCleanup) tabCleanup();
  };
}

async function loadStatus(prefix) {
  const el = document.getElementById('ws-status');
  if (!el) return;
  try {
    const data = await api.get(`${prefix}/status`);
    el.innerHTML = `<span class="badge badge-success">Online</span>`;
  } catch {
    el.innerHTML = `<span class="badge badge-error">Offline</span>`;
  }
}

async function renderStatusTab(el, prefix) {
  el.innerHTML = '<div class="loading">Loading status...</div>';
  try {
    let statusHtml = '';
    try {
      const status = await api.get(`${prefix}/status`);
      statusHtml = `
        <div class="card mb-16">
          <div class="card-title mb-8">Workspace Status</div>
          <pre class="text-mono text-sm" style="background:var(--bg-input);padding:12px;border-radius:6px;overflow-x:auto">${esc(JSON.stringify(status, null, 2))}</pre>
        </div>
      `;
    } catch (err) {
      statusHtml = `<div class="card mb-16"><p class="error-msg">Workspace offline: ${esc(err.message)}</p></div>`;
    }

    let intHtml = '';
    try {
      const integrations = await api.get(`${prefix}/integrations/status`);
      intHtml = `
        <div class="card">
          <div class="card-title mb-8">Integrations</div>
          <pre class="text-mono text-sm" style="background:var(--bg-input);padding:12px;border-radius:6px;overflow-x:auto">${esc(JSON.stringify(integrations, null, 2))}</pre>
        </div>
      `;
    } catch (err) {
      intHtml = `<div class="card"><p class="error-msg">Could not load integrations: ${esc(err.message)}</p></div>`;
    }

    el.innerHTML = statusHtml + intHtml;
  } catch (err) {
    el.innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
  }
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}
