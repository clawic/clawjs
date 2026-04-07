import { api } from '../api.js';
import { getAuth, isAdmin } from '../auth.js';

export function renderAdmin(container) {
  if (!isAdmin()) {
    container.innerHTML = '<div class="error-msg">Admin access required.</div>';
    return;
  }

  const { tenantId } = getAuth();

  container.innerHTML = `
    <div class="page-header">
      <h2>Admin Panel</h2>
    </div>

    <div class="card mb-16">
      <div class="card-title mb-8">Create Enrollment Token</div>
      <p class="text-sm text-muted mb-16">Generate a token to enroll a new connector for an agent.</p>
      <div class="flex gap-8" style="flex-wrap:wrap;align-items:flex-end">
        <div class="form-group" style="margin:0;flex:1;min-width:160px">
          <label for="enroll-agent">Agent ID</label>
          <input type="text" id="enroll-agent" value="demo-agent" placeholder="agent-id">
        </div>
        <div class="form-group" style="margin:0;flex:1;min-width:160px">
          <label for="enroll-desc">Description</label>
          <input type="text" id="enroll-desc" placeholder="optional description">
        </div>
        <button class="btn btn-primary" id="enroll-btn">Create Token</button>
      </div>
      <div id="enroll-result"></div>
    </div>

    <div class="card mb-16">
      <div class="card-title mb-8">Create Workspace</div>
      <p class="text-sm text-muted mb-16">Create a new workspace for an agent.</p>
      <div class="flex gap-8" style="flex-wrap:wrap;align-items:flex-end">
        <div class="form-group" style="margin:0;flex:1;min-width:140px">
          <label for="ws-agent">Agent ID</label>
          <input type="text" id="ws-agent" value="demo-agent">
        </div>
        <div class="form-group" style="margin:0;flex:1;min-width:140px">
          <label for="ws-id">Workspace ID</label>
          <input type="text" id="ws-id" placeholder="my-workspace">
        </div>
        <div class="form-group" style="margin:0;flex:1;min-width:140px">
          <label for="ws-name">Display Name</label>
          <input type="text" id="ws-name" placeholder="My Workspace">
        </div>
        <button class="btn btn-primary" id="ws-create-btn">Create</button>
      </div>
      <div id="ws-create-result"></div>
    </div>

    <div class="card mb-16" style="border-color: var(--red)">
      <div class="card-title mb-8" style="color: var(--red)">Delete Data</div>
      <p class="text-sm text-muted mb-16">Select what you want to delete. This action is irreversible.</p>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer">
          <input type="checkbox" id="del-conversations"> All conversations (sessions across all workspaces)
        </label>
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer">
          <input type="checkbox" id="del-activity"> Activity log
        </label>
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer">
          <input type="checkbox" id="del-usage"> Usage records
        </label>
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer">
          <input type="checkbox" id="del-projects"> All projects / workspaces
        </label>
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer">
          <input type="checkbox" id="del-agents"> All agents (connectors)
        </label>
      </div>
      <div class="flex gap-8">
        <button class="btn btn-danger" id="delete-data-btn">Delete Selected</button>
        <button class="btn btn-sm" id="select-all-btn">Select all</button>
      </div>
      <div id="delete-data-result"></div>
    </div>

    <div class="card">
      <div class="card-title mb-8">Runtime Management</div>
      <p class="text-sm text-muted mb-16">Manage the runtime for an agent (setup, install, uninstall, status).</p>
      <div class="flex gap-8" style="flex-wrap:wrap;align-items:flex-end">
        <div class="form-group" style="margin:0;flex:1;min-width:160px">
          <label for="rt-agent">Agent ID</label>
          <input type="text" id="rt-agent" value="demo-agent">
        </div>
        <div class="form-group" style="margin:0;min-width:140px">
          <label for="rt-action">Action</label>
          <select id="rt-action">
            <option value="status">Status</option>
            <option value="setup">Setup</option>
            <option value="install">Install</option>
            <option value="uninstall">Uninstall</option>
          </select>
        </div>
        <button class="btn btn-primary" id="rt-btn">Run</button>
      </div>
      <div id="rt-result"></div>
    </div>
  `;

  // Enrollment
  document.getElementById('enroll-btn').onclick = async () => {
    const agentId = document.getElementById('enroll-agent').value.trim();
    const description = document.getElementById('enroll-desc').value.trim();
    const resultEl = document.getElementById('enroll-result');
    resultEl.innerHTML = '<div class="text-sm text-muted mt-8">Creating...</div>';

    try {
      const data = await api.post('/admin/connectors/enrollments', {
        tenantId,
        agentId,
        description: description || undefined,
      });
      resultEl.innerHTML = `
        <div class="mt-8">
          <span class="badge badge-success">Token created</span>
          <div class="token-display">${esc(data.enrollmentToken || data.token || JSON.stringify(data))}</div>
          <p class="text-sm text-muted mt-8">This token expires in 1 hour. Use it to enroll a connector.</p>
        </div>
      `;
    } catch (err) {
      resultEl.innerHTML = `<div class="error-msg mt-8">${esc(err.message)}</div>`;
    }
  };

  // Workspace creation
  document.getElementById('ws-create-btn').onclick = async () => {
    const agentId = document.getElementById('ws-agent').value.trim();
    const workspaceId = document.getElementById('ws-id').value.trim();
    const displayName = document.getElementById('ws-name').value.trim();
    const resultEl = document.getElementById('ws-create-result');

    if (!workspaceId) {
      resultEl.innerHTML = '<div class="error-msg mt-8">Workspace ID is required</div>';
      return;
    }

    resultEl.innerHTML = '<div class="text-sm text-muted mt-8">Creating...</div>';
    try {
      const data = await api.post(`/admin/tenants/${tenantId}/agents/${agentId}/workspaces`, {
        workspaceId,
        displayName: displayName || workspaceId,
      });
      resultEl.innerHTML = `<div class="mt-8"><span class="badge badge-success">Workspace created</span> <a href="#/workspace/${tenantId}/${agentId}/${workspaceId}">Open workspace</a></div>`;
    } catch (err) {
      resultEl.innerHTML = `<div class="error-msg mt-8">${esc(err.message)}</div>`;
    }
  };

  // Delete data - select all
  document.getElementById('select-all-btn').onclick = () => {
    ['del-conversations','del-activity','del-usage','del-projects','del-agents'].forEach(id => {
      document.getElementById(id).checked = true;
    });
  };

  // Delete data - execute
  document.getElementById('delete-data-btn').onclick = async () => {
    const opts = {
      conversations: document.getElementById('del-conversations').checked,
      activity: document.getElementById('del-activity').checked,
      usage: document.getElementById('del-usage').checked,
      projects: document.getElementById('del-projects').checked,
      agents: document.getElementById('del-agents').checked,
    };

    const selected = Object.entries(opts).filter(([k,v]) => v).map(([k]) => k);
    if (selected.length === 0) {
      alert('Please select at least one option to delete.');
      return;
    }

    // Confirmation modal
    const confirmed = await showConfirmModal(selected);
    if (!confirmed) return;

    const resultEl = document.getElementById('delete-data-result');
    resultEl.innerHTML = '<div class="text-sm text-muted mt-8">Deleting...</div>';

    const log = [];
    try {
      // Load agents and workspaces upfront
      const { agents } = await api.get(`/tenants/${tenantId}/agents`);

      // 1. Delete conversations (iterate agents/workspaces, call clear endpoint)
      if (opts.conversations) {
        let sessionsDeleted = 0;
        for (const a of agents) {
          try {
            const { workspaces } = await api.get(`/tenants/${tenantId}/agents/${a.agentId}/workspaces`);
            for (const w of workspaces) {
              try {
                const res = await api.post(`/admin/tenants/${tenantId}/agents/${a.agentId}/workspaces/${w.workspaceId}/sessions/clear`, {});
                sessionsDeleted += (res?.deleted || 0);
              } catch (err) {
                log.push(`  skip ${a.agentId}/${w.workspaceId}: ${err.message}`);
              }
            }
          } catch (err) {
            log.push(`  skip agent ${a.agentId}: ${err.message}`);
          }
        }
        log.push(`Conversations: ${sessionsDeleted} session file(s) deleted`);
      }

      // 2. Delete activity
      if (opts.activity) {
        const res = await api.del(`/admin/tenants/${tenantId}/activity`);
        log.push(`Activity: ${res.deleted} record(s) deleted`);
      }

      // 3. Delete usage
      if (opts.usage) {
        const res = await api.del(`/admin/tenants/${tenantId}/usage`);
        log.push(`Usage: ${res.deleted} record(s) deleted`);
      }

      // 4. Delete projects (workspaces)
      if (opts.projects) {
        let count = 0;
        for (const a of agents) {
          try {
            const { workspaces } = await api.get(`/tenants/${tenantId}/agents/${a.agentId}/workspaces`);
            for (const w of workspaces) {
              try {
                await api.del(`/admin/tenants/${tenantId}/agents/${a.agentId}/workspaces/${w.workspaceId}`);
                count += 1;
              } catch (err) {
                log.push(`  skip ${a.agentId}/${w.workspaceId}: ${err.message}`);
              }
            }
          } catch {}
        }
        log.push(`Projects: ${count} workspace(s) deleted`);
      }

      // 5. Delete agents
      if (opts.agents) {
        let count = 0;
        for (const a of agents) {
          try {
            await api.del(`/admin/tenants/${tenantId}/agents/${a.agentId}`);
            count += 1;
          } catch (err) {
            log.push(`  skip agent ${a.agentId}: ${err.message}`);
          }
        }
        log.push(`Agents: ${count} agent(s) deleted`);
      }

      resultEl.innerHTML = `
        <div class="mt-8">
          <span class="badge badge-success">Delete completed</span>
          <pre class="text-mono text-sm" style="background:var(--bg-input);padding:12px;border-radius:6px;overflow-x:auto;margin-top:8px">${esc(log.join('\n'))}</pre>
        </div>
      `;
      // Uncheck all
      ['del-conversations','del-activity','del-usage','del-projects','del-agents'].forEach(id => {
        document.getElementById(id).checked = false;
      });
    } catch (err) {
      resultEl.innerHTML = `<div class="error-msg mt-8">${esc(err.message)}</div>`;
    }
  };

  // Runtime management
  document.getElementById('rt-btn').onclick = async () => {
    const agentId = document.getElementById('rt-agent').value.trim();
    const action = document.getElementById('rt-action').value;
    const resultEl = document.getElementById('rt-result');

    resultEl.innerHTML = '<div class="text-sm text-muted mt-8">Running...</div>';
    try {
      const data = await api.post(`/admin/tenants/${tenantId}/agents/${agentId}/runtime/${action}`, {});
      resultEl.innerHTML = `
        <div class="mt-8">
          <span class="badge badge-success">${action} completed</span>
          <pre class="text-mono text-sm" style="background:var(--bg-input);padding:12px;border-radius:6px;overflow-x:auto;margin-top:8px">${esc(JSON.stringify(data, null, 2))}</pre>
        </div>
      `;
    } catch (err) {
      resultEl.innerHTML = `<div class="error-msg mt-8">${esc(err.message)}</div>`;
    }
  };
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

function showConfirmModal(selected) {
  return new Promise((resolve) => {
    const labels = {
      conversations: 'All conversations',
      activity: 'Activity log',
      usage: 'Usage records',
      projects: 'All projects / workspaces',
      agents: 'All agents (connectors)',
    };
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3 style="color: var(--red)">Confirm deletion</h3>
        <p class="text-sm mb-16">You are about to permanently delete:</p>
        <ul style="margin-left:20px;margin-bottom:16px">
          ${selected.map(k => `<li class="text-sm">${labels[k] || k}</li>`).join('')}
        </ul>
        <p class="text-sm text-muted mb-16">Type <span class="text-mono" style="color:var(--red)">DELETE</span> to confirm:</p>
        <div class="form-group">
          <input type="text" id="confirm-input" placeholder="DELETE" autofocus>
        </div>
        <div class="flex gap-8">
          <button class="btn btn-danger" id="confirm-yes">Delete</button>
          <button class="btn" id="confirm-no">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#confirm-input');
    const yesBtn = overlay.querySelector('#confirm-yes');

    const cleanup = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.querySelector('#confirm-no').onclick = () => cleanup(false);
    overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };

    yesBtn.onclick = () => {
      if (input.value === 'DELETE') {
        cleanup(true);
      } else {
        input.style.borderColor = 'var(--red)';
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value === 'DELETE') cleanup(true);
      if (e.key === 'Escape') cleanup(false);
    });
  });
}
