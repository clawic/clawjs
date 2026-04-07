const state = {
  token: "",
  namespaces: [],
  collections: [],
  currentNamespace: null,
  currentCollection: null,
  websocket: null,
};

const els = {
  loginView: document.getElementById("login-view"),
  appView: document.getElementById("app-view"),
  loginForm: document.getElementById("login-form"),
  loginEmail: document.getElementById("login-email"),
  loginPassword: document.getElementById("login-password"),
  loginError: document.getElementById("login-error"),
  namespaceList: document.getElementById("namespace-list"),
  namespaceForm: document.getElementById("namespace-form"),
  namespaceId: document.getElementById("namespace-id"),
  namespaceDisplayName: document.getElementById("namespace-display-name"),
  collectionList: document.getElementById("collection-list"),
  collectionForm: document.getElementById("collection-form"),
  collectionName: document.getElementById("collection-name"),
  collectionDisplayName: document.getElementById("collection-display-name"),
  collectionFields: document.getElementById("collection-fields"),
  activeNamespaceName: document.getElementById("active-namespace-name"),
  activeCollectionName: document.getElementById("active-collection-name"),
  schemaTitle: document.getElementById("schema-title"),
  schemaEditor: document.getElementById("schema-editor"),
  schemaSave: document.getElementById("schema-save"),
  recordsTable: document.getElementById("records-table"),
  recordsRefresh: document.getElementById("records-refresh"),
  recordForm: document.getElementById("record-form"),
  recordId: document.getElementById("record-id"),
  recordData: document.getElementById("record-data"),
  recordReset: document.getElementById("record-reset"),
  tokenForm: document.getElementById("token-form"),
  tokenLabel: document.getElementById("token-label"),
  tokenCollection: document.getElementById("token-collection"),
  tokenOperations: document.getElementById("token-operations"),
  tokenOutput: document.getElementById("token-output"),
  tokenList: document.getElementById("token-list"),
  fileForm: document.getElementById("file-form"),
  fileInput: document.getElementById("file-input"),
  fileRecordId: document.getElementById("file-record-id"),
  fileList: document.getElementById("file-list"),
  eventList: document.getElementById("event-list"),
  settingsRefresh: document.getElementById("settings-refresh"),
  settingsOutput: document.getElementById("settings-output"),
  liveStatus: document.getElementById("live-status"),
};

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function exampleFields() {
  return pretty([
    { name: "title", type: "text", required: true },
    { name: "status", type: "select", options: ["draft", "active", "done"] },
    { name: "website", type: "url" },
  ]);
}

function exampleRecord() {
  return pretty({
    title: "Hello world",
    status: "draft",
  });
}

async function request(path, init = {}) {
  const headers = new Headers(init.headers || {});
  if (state.token) headers.set("authorization", `Bearer ${state.token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(path, { ...init, headers });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(typeof payload === "string" ? payload : payload.error || JSON.stringify(payload));
  }
  return payload;
}

function renderNamespaces() {
  els.namespaceList.innerHTML = "";
  for (const namespace of state.namespaces) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `list-item ${state.currentNamespace?.id === namespace.id ? "active" : ""}`;
    button.dataset.testid = `namespace-${namespace.id}`;
    button.innerHTML = `<strong>${namespace.displayName}</strong><span class="muted">${namespace.id}</span>`;
    button.onclick = async () => {
      state.currentNamespace = namespace;
      state.currentCollection = null;
      await refreshNamespace();
    };
    els.namespaceList.appendChild(button);
  }
}

function renderCollections() {
  els.collectionList.innerHTML = "";
  for (const collection of state.collections) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `list-item ${state.currentCollection?.name === collection.name ? "active" : ""}`;
    button.dataset.testid = `collection-${collection.name}`;
    button.innerHTML = `<strong>${collection.displayName}</strong><span class="muted">${collection.name}${collection.protected ? " · protected" : ""}</span>`;
    button.onclick = async () => {
      state.currentCollection = collection;
      await refreshCollection();
    };
    els.collectionList.appendChild(button);
  }
}

function renderRecords(items = []) {
  const collection = state.currentCollection;
  if (!collection) {
    els.recordsTable.innerHTML = '<p class="muted">Select a collection.</p>';
    return;
  }
  const fields = ["id", ...collection.fields.map((field) => field.name), "createdAt"];
  const rows = items.map((item) => `
    <tr>
      ${fields.map((field) => `<td>${field === "id" ? `<button type="button" class="secondary record-edit" data-id="${item.id}">${item[field] ?? ""}</button>` : `${item[field] ?? ""}`}</td>`).join("")}
      <td><button type="button" class="secondary record-delete" data-id="${item.id}">Delete</button></td>
    </tr>
  `).join("");
  els.recordsTable.innerHTML = `
    <table data-testid="records-table">
      <thead>
        <tr>${fields.map((field) => `<th>${field}</th>`).join("")}<th>Actions</th></tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="${fields.length + 1}" class="muted">No records yet.</td></tr>`}</tbody>
    </table>
  `;
  els.recordsTable.querySelectorAll(".record-edit").forEach((button) => {
    button.addEventListener("click", () => {
      const item = items.find((entry) => entry.id === button.dataset.id);
      if (!item) return;
      els.recordId.value = item.id;
      const payload = { ...item };
      delete payload.id;
      delete payload.createdAt;
      delete payload.updatedAt;
      els.recordData.value = pretty(payload);
    });
  });
  els.recordsTable.querySelectorAll(".record-delete").forEach((button) => {
    button.addEventListener("click", async () => {
      await request(`/v1/namespaces/${state.currentNamespace.id}/collections/${collection.name}/records/${button.dataset.id}`, {
        method: "DELETE",
      });
      await refreshRecords();
    });
  });
}

function renderTokens(items = []) {
  els.tokenList.innerHTML = "";
  for (const token of items) {
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <strong>${token.label}</strong>
      <span class="muted">${token.collectionName || "namespace-wide"} · ${token.operations.join(", ")}</span>
      <span class="muted">${token.revokedAt ? `revoked ${token.revokedAt}` : "active"}</span>
      <button type="button" class="secondary" data-id="${token.id}">Revoke</button>
    `;
    item.querySelector("button").onclick = async () => {
      await request(`/v1/namespaces/${state.currentNamespace.id}/tokens/${token.id}/revoke`, { method: "POST" });
      await refreshTokens();
    };
    els.tokenList.appendChild(item);
  }
}

function renderFiles(items = []) {
  els.fileList.innerHTML = "";
  for (const file of items) {
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <strong>${file.filename}</strong>
      <span class="muted">${file.collectionName || "unbound"} · ${file.sizeBytes} bytes</span>
      <div class="row">
        <a class="button secondary" href="${file.downloadPath}" target="_blank" rel="noreferrer">Open</a>
        <button type="button" class="secondary" data-id="${file.id}">Delete</button>
      </div>
    `;
    item.querySelector("button").onclick = async () => {
      await request(`/v1/files/${file.id}`, { method: "DELETE" });
      await refreshFiles();
    };
    els.fileList.appendChild(item);
  }
}

function pushEvent(event) {
  const summary = event.record?.name || event.record?.title || "";
  const node = document.createElement("div");
  node.className = "list-item";
  node.innerHTML = `
    <strong>${event.type}</strong>
    <span class="muted">${event.collectionName} · ${event.recordId}</span>
    <span class="muted">${summary}</span>
    <span class="muted">${event.at}</span>
  `;
  els.eventList.prepend(node);
}

function connectRealtime() {
  if (state.websocket) {
    state.websocket.close();
  }
  if (!state.token) return;
  const url = new URL("/v1/realtime", window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", state.token);
  state.websocket = new WebSocket(url);
}

function subscribeRealtime() {
  if (!state.websocket || state.websocket.readyState !== WebSocket.OPEN || !state.currentNamespace || !state.currentCollection) return;
  state.websocket.send(JSON.stringify({
    type: "subscribe",
    namespaceId: state.currentNamespace.id,
    collectionName: state.currentCollection.name,
  }));
}

async function refreshNamespaces() {
  const payload = await request("/v1/namespaces");
  state.namespaces = payload.items;
  if (!state.currentNamespace) {
    state.currentNamespace = state.namespaces[0] || null;
  }
  renderNamespaces();
}

async function refreshNamespace() {
  renderNamespaces();
  els.activeNamespaceName.textContent = state.currentNamespace?.displayName || "No database";
  if (!state.currentNamespace) return;
  const payload = await request(`/v1/namespaces/${state.currentNamespace.id}/collections`);
  state.collections = payload.items;
  if (!state.currentCollection) {
    state.currentCollection = state.collections[0] || null;
  } else {
    state.currentCollection = state.collections.find((item) => item.name === state.currentCollection.name) || state.collections[0] || null;
  }
  renderCollections();
  await Promise.all([refreshCollection(), refreshTokens(), refreshFiles(), refreshSettings()]);
}

async function refreshCollection() {
  renderCollections();
  const collection = state.currentCollection;
  els.activeCollectionName.textContent = collection?.displayName || "Select one";
  if (!collection) {
    els.schemaTitle.textContent = "Collection schema";
    els.schemaEditor.value = pretty([]);
    renderRecords([]);
    return;
  }
  const payload = await request(`/v1/namespaces/${state.currentNamespace.id}/collections/${collection.name}`);
  state.currentCollection = payload;
  els.schemaTitle.textContent = payload.displayName;
  els.schemaEditor.value = pretty(payload.fields);
  els.recordData.value = exampleRecord();
  renderCollections();
  await refreshRecords();
  subscribeRealtime();
}

async function refreshRecords() {
  if (!state.currentNamespace || !state.currentCollection) return;
  const payload = await request(`/v1/namespaces/${state.currentNamespace.id}/collections/${state.currentCollection.name}/records`);
  renderRecords(payload.items);
}

async function refreshTokens() {
  if (!state.currentNamespace) return;
  const payload = await request(`/v1/namespaces/${state.currentNamespace.id}/tokens`);
  renderTokens(payload.items);
}

async function refreshFiles() {
  if (!state.currentNamespace) return;
  const payload = await request(`/v1/namespaces/${state.currentNamespace.id}/files`);
  renderFiles(payload.items);
}

async function refreshSettings() {
  const [health, settings] = await Promise.all([
    request("/v1/health"),
    request("/v1/settings"),
  ]);
  els.settingsOutput.textContent = pretty({ health, settings });
}

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    els.loginError.textContent = "";
    const payload = await request("/v1/auth/admin/login", {
      method: "POST",
      body: JSON.stringify({
        email: els.loginEmail.value,
        password: els.loginPassword.value,
      }),
    });
    state.token = payload.accessToken;
    els.loginView.classList.add("hidden");
    els.appView.classList.remove("hidden");
    connectRealtime();
    state.websocket.addEventListener("open", () => {
      els.liveStatus.textContent = "connected";
      subscribeRealtime();
    });
    state.websocket.addEventListener("close", () => {
      els.liveStatus.textContent = "closed";
    });
    state.websocket.addEventListener("message", (message) => {
      const payload = JSON.parse(message.data);
      if (payload.type === "event") {
        pushEvent(payload.event);
        refreshRecords().catch(() => {});
      }
      if (payload.type === "subscribed") {
        els.liveStatus.textContent = `watching ${payload.collectionName}`;
      }
    });
    await refreshNamespaces();
    await refreshNamespace();
  } catch (error) {
    els.loginError.textContent = error.message;
  }
});

els.namespaceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await request("/v1/namespaces", {
    method: "POST",
    body: JSON.stringify({
      id: els.namespaceId.value,
      displayName: els.namespaceDisplayName.value,
    }),
  });
  els.namespaceId.value = "";
  els.namespaceDisplayName.value = "";
  await refreshNamespaces();
  await refreshNamespace();
});

els.collectionFields.value = exampleFields();
els.recordData.value = exampleRecord();

els.collectionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.currentNamespace) return;
  await request(`/v1/namespaces/${state.currentNamespace.id}/collections`, {
    method: "POST",
    body: JSON.stringify({
      name: els.collectionName.value,
      displayName: els.collectionDisplayName.value,
      fields: JSON.parse(els.collectionFields.value || "[]"),
      indexes: [],
    }),
  });
  els.collectionName.value = "";
  els.collectionDisplayName.value = "";
  els.collectionFields.value = exampleFields();
  await refreshNamespace();
});

els.schemaSave.addEventListener("click", async () => {
  if (!state.currentNamespace || !state.currentCollection) return;
  await request(`/v1/namespaces/${state.currentNamespace.id}/collections/${state.currentCollection.name}`, {
    method: "PATCH",
    body: JSON.stringify({
      fields: JSON.parse(els.schemaEditor.value || "[]"),
    }),
  });
  await refreshCollection();
});

els.recordsRefresh.addEventListener("click", () => {
  refreshRecords().catch(() => {});
});

els.recordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.currentNamespace || !state.currentCollection) return;
  const payload = JSON.parse(els.recordData.value || "{}");
  if (els.recordId.value) {
    await request(`/v1/namespaces/${state.currentNamespace.id}/collections/${state.currentCollection.name}/records/${els.recordId.value}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  } else {
    await request(`/v1/namespaces/${state.currentNamespace.id}/collections/${state.currentCollection.name}/records`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
  els.recordId.value = "";
  els.recordData.value = exampleRecord();
  await refreshRecords();
});

els.recordReset.addEventListener("click", () => {
  els.recordId.value = "";
  els.recordData.value = exampleRecord();
});

els.tokenForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.currentNamespace) return;
  const payload = await request(`/v1/namespaces/${state.currentNamespace.id}/tokens`, {
    method: "POST",
    body: JSON.stringify({
      label: els.tokenLabel.value,
      collectionName: els.tokenCollection.value || undefined,
      operations: els.tokenOperations.value.split(",").map((entry) => entry.trim()).filter(Boolean),
    }),
  });
  els.tokenOutput.textContent = pretty(payload);
  els.tokenLabel.value = "";
  els.tokenCollection.value = "";
  await refreshTokens();
});

els.fileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.currentNamespace || !els.fileInput.files[0]) return;
  const form = new FormData();
  form.set("namespaceId", state.currentNamespace.id);
  if (state.currentCollection) {
    form.set("collectionName", state.currentCollection.name);
  }
  if (els.fileRecordId.value) {
    form.set("recordId", els.fileRecordId.value);
  }
  form.set("file", els.fileInput.files[0]);
  await request("/v1/files", {
    method: "POST",
    body: form,
  });
  els.fileInput.value = "";
  els.fileRecordId.value = "";
  await refreshFiles();
});

els.settingsRefresh.addEventListener("click", () => {
  refreshSettings().catch(() => {});
});
