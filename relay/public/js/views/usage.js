import { api } from '../api.js';

export function renderUsage(container, prefix) {
  container.innerHTML = '<div class="loading">Loading usage...</div>';

  async function load() {
    try {
      const { usage } = await api.get(`${prefix}/usage`);

      let totalIn = 0, totalOut = 0, totalCost = 0;
      for (const u of usage) {
        totalIn += u.tokensIn || 0;
        totalOut += u.tokensOut || 0;
        totalCost += u.estimatedCostUsd || 0;
      }

      container.innerHTML = `
        <div class="stats">
          <div class="stat-card">
            <div class="stat-label">Tokens In</div>
            <div class="stat-value">${totalIn.toLocaleString()}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Tokens Out</div>
            <div class="stat-value">${totalOut.toLocaleString()}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Estimated Cost</div>
            <div class="stat-value">$${totalCost.toFixed(4)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Records</div>
            <div class="stat-value">${usage.length}</div>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Time</th><th>Tokens In</th><th>Tokens Out</th><th>Cost (USD)</th></tr>
            </thead>
            <tbody>
              ${usage.length ? usage.map(u => `
                <tr>
                  <td class="text-sm">${fmtTime(u.createdAt)}</td>
                  <td>${(u.tokensIn || 0).toLocaleString()}</td>
                  <td>${(u.tokensOut || 0).toLocaleString()}</td>
                  <td>$${(u.estimatedCostUsd || 0).toFixed(4)}</td>
                </tr>
              `).join('') : '<tr><td colspan="4" class="text-muted">No usage records yet</td></tr>'}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
    }
  }

  load();
  const iv = setInterval(load, 15000);
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
