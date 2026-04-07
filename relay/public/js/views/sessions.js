import { api } from '../api.js';

export function renderSessions(container, prefix) {
  let activeSessionId = null;
  let abortController = null;

  container.innerHTML = `
    <div class="chat-layout">
      <div class="session-list">
        <div class="session-list-header">
          <h3>Sessions</h3>
          <button class="btn btn-sm btn-primary" id="new-session-btn">+ New</button>
        </div>
        <div class="session-items" id="session-items">
          <div class="loading">Loading...</div>
        </div>
      </div>
      <div class="chat-pane" id="chat-pane">
        <div class="chat-empty">Select or create a session</div>
      </div>
    </div>
  `;

  document.getElementById('new-session-btn').onclick = createSession;

  async function loadSessions() {
    try {
      const data = await api.get(`${prefix}/sessions`);
      const sessions = data.sessions || data || [];
      const el = document.getElementById('session-items');
      if (!el) return;

      if (!sessions.length) {
        el.innerHTML = '<div class="text-sm text-muted" style="padding:12px">No sessions yet</div>';
        return;
      }

      el.innerHTML = sessions.map(s => `
        <div class="session-item ${s.sessionId === activeSessionId ? 'active' : ''}" data-id="${s.sessionId}">
          <div class="session-item-title">${esc(s.title || s.sessionId)}</div>
          <div class="session-item-date">${fmtTime(s.createdAt || s.updatedAt)}</div>
        </div>
      `).join('');

      el.querySelectorAll('.session-item').forEach(item => {
        item.onclick = () => openSession(item.dataset.id);
      });
    } catch (err) {
      const el = document.getElementById('session-items');
      if (el) el.innerHTML = `<div class="error-msg text-sm" style="padding:12px">${esc(err.message)}</div>`;
    }
  }

  async function createSession() {
    try {
      const data = await api.post(`${prefix}/sessions`, {});
      const session = data.session || data;
      const sessionId = session.sessionId || session.id;
      if (sessionId) {
        await loadSessions();
        openSession(sessionId);
      }
    } catch (err) {
      alert('Failed to create session: ' + err.message);
    }
  }

  async function openSession(sessionId) {
    activeSessionId = sessionId;
    // Update active state in list
    document.querySelectorAll('.session-item').forEach(item => {
      item.classList.toggle('active', item.dataset.id === sessionId);
    });

    const pane = document.getElementById('chat-pane');
    pane.innerHTML = '<div class="loading">Loading messages...</div>';

    try {
      const data = await api.get(`${prefix}/sessions/${sessionId}`);
      const session = data.session || data;
      const messages = session.messages || session.transcript || [];

      pane.innerHTML = `
        <div class="chat-messages" id="chat-messages">
          ${messages.length ? messages.map(renderMessage).join('') : '<div class="text-sm text-muted" style="padding:12px">No messages yet. Start chatting below.</div>'}
        </div>
        <div class="chat-input-bar">
          <textarea id="chat-input" placeholder="Type a message..." rows="1"></textarea>
          <button class="btn btn-primary" id="send-btn">Send</button>
        </div>
      `;

      scrollToBottom();

      const input = document.getElementById('chat-input');
      const sendBtn = document.getElementById('send-btn');

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });

      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      });

      sendBtn.onclick = sendMessage;
    } catch (err) {
      pane.innerHTML = `<div class="error-msg" style="padding:20px">${esc(err.message)}</div>`;
    }
  }

  async function sendMessage() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;
    sendBtn.textContent = '...';

    // Append user message
    appendMessageBubble('user', text);
    scrollToBottom();

    // Create assistant bubble for streaming
    const assistantEl = appendMessageBubble('assistant', '');
    scrollToBottom();

    try {
      if (abortController) abortController.abort();
      abortController = new AbortController();

      const url = `${prefix}/sessions/${activeSessionId}/stream?message=${encodeURIComponent(text)}`;
      const headers = { 'Content-Type': 'application/json' };
      const token = sessionStorage.getItem('accessToken');
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/v1${url}`, { headers, signal: abortController.signal });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || errBody.error || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

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
            if (!raw) continue;
            try {
              const data = JSON.parse(raw);
              if (data.delta) {
                fullText += data.delta;
                assistantEl.textContent = fullText;
                scrollToBottom();
              }
              if (eventType === 'error' && data.error) {
                assistantEl.innerHTML = `<span class="error-msg">${esc(data.error)}</span>`;
              }
            } catch {}
            eventType = null;
          }
        }
      }

      if (!fullText) {
        assistantEl.textContent = '(no response)';
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        assistantEl.innerHTML = `<span class="error-msg">${esc(err.message)}</span>`;
      }
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';
      abortController = null;
    }
  }

  function appendMessageBubble(role, text) {
    const msgs = document.getElementById('chat-messages');
    // Remove the "no messages" placeholder
    const placeholder = msgs.querySelector('.text-muted');
    if (placeholder) placeholder.remove();

    const div = document.createElement('div');
    div.className = `msg msg-${role}`;
    div.textContent = text;
    msgs.appendChild(div);
    return div;
  }

  function scrollToBottom() {
    const msgs = document.getElementById('chat-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

  loadSessions();

  return () => {
    if (abortController) abortController.abort();
  };
}

function renderMessage(msg) {
  const role = msg.role || (msg.type === 'user' ? 'user' : 'assistant');
  const text = msg.content || msg.text || msg.message || '';
  return `<div class="msg msg-${role}">${esc(text)}</div>`;
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
