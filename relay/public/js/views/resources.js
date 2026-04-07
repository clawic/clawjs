import { api } from '../api.js';

const RESOURCE_TYPES = [
  'tasks', 'notes', 'memory', 'inbox', 'people',
  'events', 'personas', 'plugins', 'routines', 'images',
];

export function renderResources(container, prefix) {
  let activeType = 'tasks';

  container.innerHTML = `
    <div class="resource-nav" id="resource-nav">
      ${RESOURCE_TYPES.map(t => `<button class="btn btn-sm ${t === activeType ? 'active' : ''}" data-type="${t}">${t}</button>`).join('')}
    </div>
    <div id="resource-content"><div class="loading">Loading...</div></div>
  `;

  document.getElementById('resource-nav').onclick = (e) => {
    const type = e.target.dataset?.type;
    if (!type || type === activeType) return;
    activeType = type;
    document.querySelectorAll('#resource-nav .btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
    loadResource();
  };

  async function loadResource() {
    const el = document.getElementById('resource-content');
    el.innerHTML = '<div class="loading">Loading...</div>';

    try {
      const data = await api.get(`${prefix}/${activeType}`);
      const items = data[activeType] || data.items || data || [];

      el.innerHTML = `
        <div class="flex-between mb-16">
          <span class="text-muted text-sm">${items.length} item${items.length !== 1 ? 's' : ''}</span>
          <button class="btn btn-sm btn-primary" id="create-resource-btn">+ Create</button>
        </div>
        ${items.length ? renderItems(items) : '<div class="card"><p class="text-muted">No items</p></div>'}
      `;

      document.getElementById('create-resource-btn').onclick = () => showCreateModal();

      el.querySelectorAll('.delete-item-btn').forEach(btn => {
        btn.onclick = async () => {
          if (!confirm('Delete this item?')) return;
          try {
            await api.del(`${prefix}/${activeType}`, { id: btn.dataset.id });
            loadResource();
          } catch (err) {
            alert('Delete failed: ' + err.message);
          }
        };
      });
    } catch (err) {
      el.innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
    }
  }

  function renderItems(items) {
    return `<div class="table-wrap"><table>
      <thead><tr>
        ${getColumns(items).map(c => `<th>${c}</th>`).join('')}
        <th>Actions</th>
      </tr></thead>
      <tbody>
        ${items.map(item => {
          const cols = getColumns(items);
          return `<tr>
            ${cols.map(c => `<td class="text-sm">${esc(truncate(item[c], 80))}</td>`).join('')}
            <td><button class="btn btn-sm btn-danger delete-item-btn" data-id="${item.id}">Delete</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
  }

  function getColumns(items) {
    if (!items.length) return [];
    const keys = Object.keys(items[0]);
    const priority = ['id', 'title', 'name', 'content', 'text', 'status', 'role', 'createdAt'];
    const sorted = priority.filter(k => keys.includes(k));
    const rest = keys.filter(k => !sorted.includes(k)).slice(0, 3);
    return [...sorted, ...rest].slice(0, 6);
  }

  function showCreateModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3>Create ${activeType.slice(0, -1)}</h3>
        <div class="form-group">
          <label>JSON data</label>
          <textarea id="create-json" rows="8" placeholder='{"title": "...", "content": "..."}'>{}</textarea>
        </div>
        <div id="create-error" class="error-msg hidden"></div>
        <div class="flex gap-8 mt-16">
          <button class="btn btn-primary" id="create-submit">Create</button>
          <button class="btn" id="create-cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#create-cancel').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    overlay.querySelector('#create-submit').onclick = async () => {
      const errEl = overlay.querySelector('#create-error');
      errEl.classList.add('hidden');
      try {
        const body = JSON.parse(overlay.querySelector('#create-json').value);
        await api.post(`${prefix}/${activeType}`, body);
        overlay.remove();
        loadResource();
      } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
      }
    };
  }

  loadResource();
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

function truncate(s, max) {
  s = String(s ?? '');
  return s.length > max ? s.slice(0, max) + '...' : s;
}
