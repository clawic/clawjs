import { api } from '../api.js';

export function renderActivity(container, prefix) {
  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Time</th><th>Capability</th><th>Status</th><th>Detail</th></tr>
        </thead>
        <tbody id="activity-body"><tr><td colspan="4" class="loading">Loading...</td></tr></tbody>
      </table>
    </div>
  `;

  async function load() {
    try {
      const { activity } = await api.get(`${prefix}/activity`);
      const tbody = document.getElementById('activity-body');
      if (!tbody) return;

      if (!activity.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-muted">No activity yet</td></tr>';
        return;
      }

      tbody.innerHTML = activity.map(a => `
        <tr>
          <td class="text-sm">${fmtTime(a.createdAt)}</td>
          <td><span class="text-mono text-sm">${esc(a.capability)}</span></td>
          <td><span class="badge badge-${a.status === 'success' ? 'success' : a.status === 'error' ? 'error' : 'info'}">${esc(a.status)}</span></td>
          <td class="text-sm">${esc(a.detail)}</td>
        </tr>
      `).join('');
    } catch (err) {
      const tbody = document.getElementById('activity-body');
      if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="error-msg">${esc(err.message)}</td></tr>`;
    }
  }

  load();
  const iv = setInterval(load, 10000);

  return () => clearInterval(iv);
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
