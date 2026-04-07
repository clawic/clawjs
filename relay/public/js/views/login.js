import { login } from '../auth.js';

export function renderLogin(container) {
  container.innerHTML = `
    <div class="login-container">
      <div class="login-card">
        <h1>Relay Dashboard</h1>
        <p class="subtitle">Sign in to manage your agents and workspaces</p>
        <form id="login-form">
          <div class="form-group">
            <label for="email">Email</label>
            <input type="email" id="email" value="admin@relay.local" autofocus>
          </div>
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" value="relay-admin">
          </div>
          <div class="form-group">
            <label for="tenantId">Tenant ID</label>
            <input type="text" id="tenantId" value="demo-tenant">
          </div>
          <div id="login-error" class="error-msg hidden"></div>
          <button type="submit" class="btn btn-primary btn-block mt-8">Sign In</button>
        </form>
      </div>
    </div>
  `;

  document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('login-error');
    errEl.classList.add('hidden');

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const tenantId = document.getElementById('tenantId').value;

    try {
      await login(email, password, tenantId);
      location.hash = '#/agents';
    } catch (err) {
      errEl.textContent = err.message || 'Login failed';
      errEl.classList.remove('hidden');
    }
  };
}
