import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import WebSocket from "ws";

import { buildRelayApp } from "../../src/server/app.ts";
import { RelayLogger } from "../../src/server/logger.ts";
import { deriveAssignmentWorkspaceId, deriveRuntimeAgentId } from "../../src/shared/project-model.ts";

interface SessionRecord {
  sessionId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview: string;
  messages: Array<{ role: string; content: string }>;
}

const state = {
  sessionsByWorkspace: new Map<string, Map<string, SessionRecord>>(),
  workspaceFilesByWorkspace: new Map<string, Map<string, string>>(),
  tasks: [] as Array<Record<string, unknown>>,
  notes: [] as Array<Record<string, unknown>>,
  memory: [] as Array<Record<string, unknown>>,
  inbox: [] as Array<Record<string, unknown>>,
  people: [] as Array<Record<string, unknown>>,
  events: [] as Array<Record<string, unknown>>,
  personas: [] as Array<Record<string, unknown>>,
  plugins: [] as Array<Record<string, unknown>>,
  routines: [] as Array<Record<string, unknown>>,
  images: [] as Array<Record<string, unknown>>,
};

function sessionsForWorkspace(workspaceId: string): Map<string, SessionRecord> {
  if (!state.sessionsByWorkspace.has(workspaceId)) {
    state.sessionsByWorkspace.set(workspaceId, new Map());
  }
  return state.sessionsByWorkspace.get(workspaceId)!;
}

function workspaceFilesForWorkspace(workspaceId: string): Map<string, string> {
  if (!state.workspaceFilesByWorkspace.has(workspaceId)) {
    state.workspaceFilesByWorkspace.set(workspaceId, new Map());
  }
  return state.workspaceFilesByWorkspace.get(workspaceId)!;
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function summarizeSession(session: SessionRecord): SessionRecord {
  const lastMessage = session.messages.at(-1);
  return {
    ...session,
    updatedAt: session.updatedAt || session.createdAt,
    messageCount: session.messages.length,
    preview: lastMessage?.content ?? "",
  };
}

function startFakeConnector(url: string, connectorToken: string, agentId = "demo-agent") {
  const socket = new WebSocket(url.replace(/^http/, "ws") + "/v1/connector/connect", {
    headers: { Authorization: `Bearer ${connectorToken}` },
  });

  socket.on("open", () => {
    socket.send(JSON.stringify({
      type: "hello",
      payload: {
        tenantId: "demo-tenant",
        agentId,
        version: "test",
        capabilities: ["sessions", "workspace", "crud"],
        workspaces: [{ workspaceId: "main", displayName: "Main" }],
      },
    }));
  });

  socket.on("message", (buffer) => {
    const message = JSON.parse(buffer.toString()) as {
      type: string;
      requestId?: string;
      operation?: string;
      workspaceId?: string;
      payload?: Record<string, unknown>;
    };
    if (message.type !== "invoke") return;
    const respond = (payload: Record<string, unknown>) => {
      socket.send(JSON.stringify({ type: "result", requestId: message.requestId, payload }));
    };
    const sessionId = String(message.payload?.sessionId ?? "");
    const targetWorkspaceId = String(message.workspaceId ?? "main");
    const workspaceSessions = sessionsForWorkspace(targetWorkspaceId);
    const workspaceFiles = workspaceFilesForWorkspace(targetWorkspaceId);
    switch (message.operation) {
      case "workspace.status":
        respond({ status: { workspaceId: message.workspaceId, online: true } });
        return;
      case "integrations.status":
        respond({ integrations: { runtime: { adapter: "fake" }, channels: [] } });
        return;
      case "sessions.list":
        respond({
          sessions: [...workspaceSessions.values()].map((session) => {
            const summary = summarizeSession(session);
            workspaceSessions.set(summary.sessionId, summary);
            return {
              sessionId: summary.sessionId,
              title: summary.title,
              createdAt: summary.createdAt,
              updatedAt: summary.updatedAt,
              messageCount: summary.messageCount,
              preview: summary.preview,
            };
          }),
        });
        return;
      case "sessions.create": {
        const createdAt = Date.now();
        const created: SessionRecord = {
          sessionId: randomId("session"),
          title: String(message.payload?.title ?? "New chat"),
          createdAt,
          updatedAt: createdAt,
          messageCount: 0,
          preview: "",
          messages: [],
        };
        if (typeof message.payload?.message === "string") {
          created.messages.push({ role: "user", content: message.payload.message });
        }
        const summary = summarizeSession(created);
        workspaceSessions.set(summary.sessionId, summary);
        respond({ session: summary });
        return;
      }
      case "sessions.get":
        respond({ session: workspaceSessions.get(sessionId) ?? null });
        return;
      case "sessions.update": {
        const session = workspaceSessions.get(sessionId);
        if (session) {
          session.title = String(message.payload?.title ?? session.title);
          session.updatedAt = Date.now();
          workspaceSessions.set(sessionId, summarizeSession(session));
        }
        respond({ ok: true, title: session?.title ?? null });
        return;
      }
      case "sessions.search":
        respond({ sessions: [...workspaceSessions.values()].filter((session) => session.title.includes(String(message.payload?.q ?? ""))) });
        return;
      case "sessions.append-message": {
        const session = workspaceSessions.get(sessionId);
        if (session) {
          session.messages.push({ role: String(message.payload?.role ?? "user"), content: String(message.payload?.content ?? "") });
          session.updatedAt = Date.now();
          const summary = summarizeSession(session);
          workspaceSessions.set(sessionId, summary);
          respond({ session: summary });
          return;
        }
        respond({ session: null });
        return;
      }
      case "sessions.reply": {
        const session = workspaceSessions.get(sessionId)!;
        if (typeof message.payload?.message === "string") {
          session.messages.push({ role: "user", content: message.payload.message });
        }
        session.messages.push({ role: "assistant", content: "pong from relay" });
        session.updatedAt = Date.now();
        const summary = summarizeSession(session);
        workspaceSessions.set(sessionId, summary);
        respond({ reply: "pong from relay", session: summary });
        return;
      }
      case "sessions.stream": {
        socket.send(JSON.stringify({
          type: "stream",
          requestId: message.requestId,
          event: "transport",
          payload: { type: "transport", transport: "gateway", fallback: false },
        }));
        socket.send(JSON.stringify({
          type: "stream",
          requestId: message.requestId,
          event: "chunk",
          payload: { type: "chunk", delta: "hello " },
        }));
        socket.send(JSON.stringify({
          type: "stream",
          requestId: message.requestId,
          event: "chunk",
          payload: { type: "chunk", delta: "world" },
        }));
        socket.send(JSON.stringify({
          type: "stream",
          requestId: message.requestId,
          event: "done",
          payload: { type: "done" },
        }));
        socket.send(JSON.stringify({
          type: "stream",
          requestId: message.requestId,
          event: "title",
          payload: { type: "title", title: "hello world" },
        }));
        respond({ ok: true });
        return;
      }
      case "sessions.generate-title":
        respond({ title: "generated title" });
        return;
      case "chat.feedback":
        respond({ ok: true });
        return;
      case "tasks.list":
        respond({ tasks: state.tasks });
        return;
      case "tasks.create": {
        const task = { id: randomId("task"), ...message.payload };
        state.tasks.push(task);
        respond({ task });
        return;
      }
      case "tasks.update": {
        const index = state.tasks.findIndex((task) => task.id === message.payload?.id);
        if (index >= 0) state.tasks[index] = { ...state.tasks[index], ...message.payload };
        respond({ task: state.tasks[index] });
        return;
      }
      case "tasks.delete":
        state.tasks.splice(0, state.tasks.length, ...state.tasks.filter((task) => task.id !== message.payload?.id));
        respond({ ok: true });
        return;
      case "notes.list":
        respond({ notes: state.notes });
        return;
      case "notes.create": {
        const note = { id: randomId("note"), ...message.payload };
        state.notes.push(note);
        respond({ note });
        return;
      }
      case "notes.update": {
        const index = state.notes.findIndex((note) => note.id === message.payload?.id);
        if (index >= 0) state.notes[index] = { ...state.notes[index], ...message.payload };
        respond({ note: state.notes[index] });
        return;
      }
      case "notes.delete":
        state.notes.splice(0, state.notes.length, ...state.notes.filter((note) => note.id !== message.payload?.id));
        respond({ ok: true });
        return;
      case "memory.list":
        respond({ entries: state.memory });
        return;
      case "memory.create": {
        const entry = { id: randomId("memory"), ...message.payload };
        state.memory.push(entry);
        respond({ entry });
        return;
      }
      case "memory.update": {
        const index = state.memory.findIndex((entry) => entry.id === message.payload?.id);
        if (index >= 0) state.memory[index] = { ...state.memory[index], ...message.payload };
        respond({ entry: state.memory[index] });
        return;
      }
      case "memory.delete":
        state.memory.splice(0, state.memory.length, ...state.memory.filter((entry) => entry.id !== message.payload?.id));
        respond({ ok: true });
        return;
      case "inbox.list":
        respond({ messages: state.inbox });
        return;
      case "inbox.update":
        respond({ ok: true });
        return;
      case "inbox.delete":
        respond({ ok: true });
        return;
      case "people.list":
        respond({ people: state.people });
        return;
      case "people.create": {
        const person = { id: randomId("person"), ...message.payload };
        state.people.push(person);
        respond({ person });
        return;
      }
      case "people.update": {
        const index = state.people.findIndex((person) => person.id === message.payload?.id);
        if (index >= 0) state.people[index] = { ...state.people[index], ...message.payload };
        respond({ person: state.people[index] });
        return;
      }
      case "people.delete":
        respond({ ok: true });
        return;
      case "events.list":
        respond({ events: state.events });
        return;
      case "events.create": {
        const event = { id: randomId("event"), ...message.payload };
        state.events.push(event);
        respond({ event });
        return;
      }
      case "events.update": {
        const index = state.events.findIndex((event) => event.id === message.payload?.id);
        if (index >= 0) state.events[index] = { ...state.events[index], ...message.payload };
        respond({ event: state.events[index] });
        return;
      }
      case "events.delete":
        state.events.splice(0, state.events.length, ...state.events.filter((event) => event.id !== message.payload?.id));
        respond({ ok: true });
        return;
      case "personas.list":
        respond({ personas: state.personas });
        return;
      case "personas.create": {
        const persona = { id: randomId("persona"), ...message.payload };
        state.personas.push(persona);
        respond({ persona });
        return;
      }
      case "personas.update":
        respond({ persona: { ...message.payload } });
        return;
      case "personas.delete":
        respond({ ok: true });
        return;
      case "plugins.list":
        respond({ plugins: state.plugins });
        return;
      case "plugins.create": {
        const plugin = { id: randomId("plugin"), ...message.payload };
        state.plugins.push(plugin);
        respond({ plugin });
        return;
      }
      case "plugins.update":
        respond({ plugin: { ...message.payload } });
        return;
      case "plugins.delete":
        respond({ ok: true });
        return;
      case "routines.list":
        respond({ routines: state.routines, executions: [] });
        return;
      case "routines.create": {
        const routine = { id: randomId("routine"), ...message.payload };
        state.routines.push(routine);
        respond({ routine });
        return;
      }
      case "routines.update":
        respond({ routine: { ...message.payload } });
        return;
      case "routines.delete":
        respond({ ok: true });
        return;
      case "images.list":
        respond({ images: state.images });
        return;
      case "images.get":
        respond({ image: state.images.find((image) => image.id === message.payload?.imageId) ?? null });
        return;
      case "images.create": {
        const image = { id: randomId("image"), ...message.payload };
        state.images.push(image);
        respond({ image });
        return;
      }
      case "images.delete":
        respond({ removed: true });
        return;
      case "skills.list":
        respond({ skills: [{ id: "checks", enabled: true }] });
        return;
      case "skills.search":
        respond({ results: [{ id: "checks", title: "Checks" }] });
        return;
      case "skills.sources":
        respond({ sources: [{ id: "local", label: "Local" }] });
        return;
      case "admin.workspace.create":
        respond({ ok: true, workspaceId: message.workspaceId, displayName: message.payload?.displayName ?? message.workspaceId });
        return;
      case "admin.runtime.status":
        respond({ runtime: { adapter: "fake" } });
        return;
      case "admin.config.read":
        respond({ values: { mode: "fake" } });
        return;
      case "admin.workspace-file.read":
        respond({ file: workspaceFiles.get(String(message.payload?.fileName ?? "")) ?? "" });
        return;
      case "admin.workspace-file.write":
        workspaceFiles.set(String(message.payload?.fileName ?? ""), String(message.payload?.content ?? ""));
        respond({ ok: true });
        return;
      default:
        socket.send(JSON.stringify({
          type: "error",
          requestId: message.requestId,
          code: "unsupported",
          message: "token=secret-token-12345678 should be redacted",
        }));
    }
  });

  return socket;
}

let baseUrl = "";
let appRef: Awaited<ReturnType<typeof buildRelayApp>> | null = null;
let logger: RelayLogger;

before(async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-relay-e2e-"));
  logger = new RelayLogger();
  appRef = await buildRelayApp({
    logger,
    config: {
      port: 0,
      host: "127.0.0.1",
      dbPath: path.join(tempDir, "relay.sqlite"),
      jwtSecret: "relay-e2e-secret",
    },
  });
  await appRef.app.listen({ host: "127.0.0.1", port: 0 });
  const address = appRef.app.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve relay address");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await appRef?.app.close();
});

async function login(email: string, password: string) {
  const response = await fetch(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, tenantId: "demo-tenant" }),
  });
  assert.equal(response.status, 200);
  return await response.json() as {
    accessToken: string;
    refreshToken: string;
  };
}

describe("relay e2e", () => {
  test("login, refresh, logout, connector enrollment, routing, CRUD, SSE, offline and admin protection", async () => {
    const userTokens = await login("user@relay.local", "relay-user");

    const refreshResponse = await fetch(`${baseUrl}/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: userTokens.refreshToken }),
    });
    assert.equal(refreshResponse.status, 200);
    const refreshed = await refreshResponse.json() as { accessToken: string; refreshToken: string };
    assert.ok(refreshed.accessToken);
    assert.ok(refreshed.refreshToken);

    const logoutResponse = await fetch(`${baseUrl}/v1/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refreshed.refreshToken }),
    });
    assert.equal(logoutResponse.status, 200);

    const forbiddenAdmin = await fetch(`${baseUrl}/v1/admin/connectors/enrollments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ tenantId: "demo-tenant", agentId: "demo-agent" }),
    });
    assert.equal(forbiddenAdmin.status, 403);

    const adminTokens = await login("admin@relay.local", "relay-admin");
    const enrollmentResponse = await fetch(`${baseUrl}/v1/admin/connectors/enrollments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({ tenantId: "demo-tenant", agentId: "demo-agent", description: "e2e connector" }),
    });
    assert.equal(enrollmentResponse.status, 200);
    const enrollment = await enrollmentResponse.json() as { enrollmentToken: string };

    const connectorEnroll = await fetch(`${baseUrl}/v1/connector/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollmentToken: enrollment.enrollmentToken }),
    });
    const connectorToken = (await connectorEnroll.json() as { connectorToken: string }).connectorToken;
    const socket = startFakeConnector(baseUrl, connectorToken, "demo-agent");
    await new Promise((resolve) => socket.once("message", () => resolve(null)));

    const agentsResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    const agentsPayload = await agentsResponse.json() as { agents: Array<{ agentId: string; status: string }> };
    assert.equal(agentsPayload.agents[0]?.agentId, "demo-agent");
    assert.equal(agentsPayload.agents[0]?.status, "online");

    const workspacesResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    const workspacesPayload = await workspacesResponse.json() as { workspaces: Array<{ workspaceId: string }> };
    assert.equal(workspacesPayload.workspaces[0]?.workspaceId, "main");

    const workspaceFileWrite = await fetch(`${baseUrl}/v1/admin/tenants/demo-tenant/agents/demo-agent/workspaces/main/workspace-files/SOUL.md`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({ content: "# demo" }),
    });
    assert.equal(workspaceFileWrite.status, 200);

    const workspaceFileRead = await fetch(`${baseUrl}/v1/admin/tenants/demo-tenant/agents/demo-agent/workspaces/main/workspace-files/SOUL.md`, {
      headers: {
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
    });
    assert.equal(workspaceFileRead.status, 200);
    const workspaceFilePayload = await workspaceFileRead.json() as { file: string };
    assert.equal(workspaceFilePayload.file, "# demo");

    const offlineBefore = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/missing-agent/workspaces/main/status`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(offlineBefore.status, 503);

    const createSession = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ title: "E2E session", message: "hello relay" }),
    });
    const sessionPayload = await createSession.json() as { session: SessionRecord };
    const sessionId = sessionPayload.session.sessionId;
    assert.ok(sessionId);

    const readSession = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(readSession.status, 200);

    const patchSession = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/sessions/${sessionId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ title: "Patched" }),
    });
    assert.equal(patchSession.status, 200);

    const replyResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/sessions/${sessionId}/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ message: "ping" }),
    });
    const replyPayload = await replyResponse.json() as { reply: string };
    assert.equal(replyPayload.reply, "pong from relay");

    const streamResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/sessions/${sessionId}/stream?message=streaming`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    const streamText = await streamResponse.text();
    assert.match(streamText, /event: chunk/);
    assert.match(streamText, /hello world/);

    const taskCreate = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ title: "Task 1" }),
    });
    const task = await taskCreate.json() as { task: { id: string } };
    assert.ok(task.task.id);

    const noteCreate = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ title: "Note 1" }),
    });
    assert.equal(noteCreate.status, 200);

    const memoryCreate = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/memory`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ title: "Memory 1" }),
    });
    assert.equal(memoryCreate.status, 200);

    const peopleCreate = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/people`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ displayName: "Alice" }),
    });
    assert.equal(peopleCreate.status, 200);

    const eventCreate = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ title: "Launch" }),
    });
    assert.equal(eventCreate.status, 200);

    const personaCreate = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/personas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ name: "Researcher" }),
    });
    assert.equal(personaCreate.status, 200);

    const pluginCreate = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/plugins`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ name: "search" }),
    });
    assert.equal(pluginCreate.status, 200);

    const routineCreate = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/routines`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ label: "Daily" }),
    });
    assert.equal(routineCreate.status, 200);

    const imagesCreate = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/images`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ prompt: "diagram" }),
    });
    assert.equal(imagesCreate.status, 200);

    const skillsList = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/skills/list`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(skillsList.status, 200);

    const integrations = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/integrations/status`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(integrations.status, 200);

    const activity = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/activity`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    const activityPayload = await activity.json() as { activity: Array<{ capability: string }> };
    assert.ok(activityPayload.activity.some((entry) => entry.capability === "sessions.reply"));

    const usage = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/usage`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    const usagePayload = await usage.json() as { usage: Array<{ tokensOut: number }> };
    assert.ok((usagePayload.usage[0]?.tokensOut ?? 0) > 0);

    socket.close();
    await new Promise((resolve) => socket.once("close", () => resolve(null)));

    const offlineAfter = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/status`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(offlineAfter.status, 503);
  });

  test("logs redact secrets from connector errors", async () => {
    const userTokens = await login("user@relay.local", "relay-user");
    const response = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/tasks`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(response.status, 503);
    logger.error("Authorization: Bearer secret-token-12345678");
    const found = logger.entries.some((entry) => entry.message.includes("****5678") && !entry.message.includes("secret-token-12345678"));
    assert.equal(found, true);
  });

  test("project assignments expose project-scoped routes and preserve legacy workspace compatibility", async () => {
    const userTokens = await login("user@relay.local", "relay-user");
    const adminTokens = await login("admin@relay.local", "relay-admin");

    const enrollmentResponse = await fetch(`${baseUrl}/v1/admin/connectors/enrollments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({ tenantId: "demo-tenant", agentId: "project-agent", description: "project connector" }),
    });
    assert.equal(enrollmentResponse.status, 200);
    const enrollment = await enrollmentResponse.json() as { enrollmentToken: string };

    const connectorEnroll = await fetch(`${baseUrl}/v1/connector/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollmentToken: enrollment.enrollmentToken }),
    });
    const connectorToken = (await connectorEnroll.json() as { connectorToken: string }).connectorToken;
    const socket = startFakeConnector(baseUrl, connectorToken, "project-agent");
    await new Promise((resolve) => socket.once("message", () => resolve(null)));

    const createProject = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({
        projectId: "alpha-app",
        displayName: "Alpha App",
        description: "Mobile application launch.",
        instructions: "Always reason about Alpha App context first.",
        resourceRefs: [{ id: "docs", label: "Docs", uri: "https://docs.alpha.app", mode: "allow" }],
        secretRefs: [{ id: "deploy", label: "Deploy token", secretName: "alpha_deploy", mode: "allow" }],
      }),
    });
    assert.equal(createProject.status, 200);

    const attachAgent = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/alpha-app/agents/project-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({
        agentDisplayName: "DevOps",
        agentRole: "devops",
        agentInstructions: "Ship safely.",
        agentResourceRefs: [{ id: "docs", label: "Docs", uri: "https://docs.alpha.app", mode: "allow" }],
        agentSecretRefs: [{ id: "deploy", label: "Deploy token", secretName: "alpha_deploy", mode: "allow" }],
        displayName: "Alpha App / DevOps",
        instructions: "Only deploy from protected branches.",
        resourceRefs: [{ id: "docs", label: "Docs", uri: "https://docs.alpha.app", mode: "deny" }],
        secretRefs: [{ id: "deploy", label: "Deploy token", secretName: "alpha_deploy", mode: "deny" }],
      }),
    });
    assert.equal(attachAgent.status, 200);
    const assignmentPayload = await attachAgent.json() as {
      assignment: {
        workspaceId: string;
        runtimeAgentId: string;
        effectiveAccessPolicy: {
          resources: Array<{ id: string; mode?: string }>;
          secrets: Array<{ id: string; mode?: string }>;
        };
      };
    };

    const expectedWorkspaceId = deriveAssignmentWorkspaceId("alpha-app", "project-agent");
    const expectedRuntimeAgentId = deriveRuntimeAgentId("alpha-app", "project-agent");
    assert.equal(assignmentPayload.assignment.workspaceId, expectedWorkspaceId);
    assert.equal(assignmentPayload.assignment.runtimeAgentId, expectedRuntimeAgentId);
    assert.equal(assignmentPayload.assignment.effectiveAccessPolicy.resources[0]?.mode, "deny");
    assert.equal(assignmentPayload.assignment.effectiveAccessPolicy.secrets[0]?.mode, "deny");

    const listProjects = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(listProjects.status, 200);

    const listProjectAgents = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/alpha-app/agents`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(listProjectAgents.status, 200);
    const projectAgentsPayload = await listProjectAgents.json() as {
      agents: Array<{
        workspaceId: string;
        runtimeAgentId: string;
        effectiveAccessPolicy: {
          resources: Array<{ id: string; mode?: string }>;
          secrets: Array<{ id: string; mode?: string }>;
        };
      }>;
    };
    assert.equal(projectAgentsPayload.agents[0]?.workspaceId, expectedWorkspaceId);
    assert.equal(projectAgentsPayload.agents[0]?.runtimeAgentId, expectedRuntimeAgentId);
    assert.equal(projectAgentsPayload.agents[0]?.effectiveAccessPolicy.resources[0]?.mode, "deny");

    const listAgentProjects = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/project-agent/projects`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(listAgentProjects.status, 200);
    const agentProjectsPayload = await listAgentProjects.json() as {
      projects: Array<{ projectId: string; workspaceId: string; runtimeAgentId: string }>;
    };
    assert.equal(agentProjectsPayload.projects[0]?.projectId, "alpha-app");
    assert.equal(agentProjectsPayload.projects[0]?.workspaceId, expectedWorkspaceId);
    assert.equal(agentProjectsPayload.projects[0]?.runtimeAgentId, expectedRuntimeAgentId);

    const legacyWorkspaces = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/project-agent/workspaces`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(legacyWorkspaces.status, 200);
    const legacyWorkspacesPayload = await legacyWorkspaces.json() as { workspaces: Array<{ workspaceId: string }> };
    assert.equal(legacyWorkspacesPayload.workspaces.some((workspace) => workspace.workspaceId === expectedWorkspaceId), true);

    const createProjectSession = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/alpha-app/agents/project-agent/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ title: "Deploy plan", message: "prepare deploy" }),
    });
    assert.equal(createProjectSession.status, 200);
    const createdSession = await createProjectSession.json() as { session: SessionRecord };

    const projectReply = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/alpha-app/agents/project-agent/sessions/${createdSession.session.sessionId}/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ message: "ship it" }),
    });
    assert.equal(projectReply.status, 200);

    const projectTasks = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/alpha-app/agents/project-agent/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ title: "Cut release" }),
    });
    assert.equal(projectTasks.status, 200);

    const projectStatus = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/alpha-app/agents/project-agent/status`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(projectStatus.status, 200);

    const legacySessionList = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/project-agent/workspaces/${expectedWorkspaceId}/sessions`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(legacySessionList.status, 200);
    const legacySessionsPayload = await legacySessionList.json() as { sessions: Array<{ sessionId: string }> };
    assert.equal(legacySessionsPayload.sessions.some((session) => session.sessionId === createdSession.session.sessionId), true);

    const secondProject = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({
        projectId: "beta-app",
        displayName: "Beta App",
      }),
    });
    assert.equal(secondProject.status, 200);

    const attachSecondProject = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/beta-app/agents/project-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({
        agentDisplayName: "DevOps",
        displayName: "Beta App / DevOps",
      }),
    });
    assert.equal(attachSecondProject.status, 200);
    const secondWorkspaceId = deriveAssignmentWorkspaceId("beta-app", "project-agent");

    const createSecondSession = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/beta-app/agents/project-agent/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ title: "Beta deploy" }),
    });
    assert.equal(createSecondSession.status, 200);

    const alphaLegacySessions = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/project-agent/workspaces/${expectedWorkspaceId}/sessions`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    const alphaLegacyPayload = await alphaLegacySessions.json() as { sessions: Array<{ title: string }> };
    assert.equal(alphaLegacyPayload.sessions.some((session) => session.title === "Deploy plan"), true);
    assert.equal(alphaLegacyPayload.sessions.some((session) => session.title === "Beta deploy"), false);

    const betaLegacySessions = await fetch(`${baseUrl}/v1/tenants/demo-tenant/agents/project-agent/workspaces/${secondWorkspaceId}/sessions`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    const betaLegacyPayload = await betaLegacySessions.json() as { sessions: Array<{ title: string }> };
    assert.equal(betaLegacyPayload.sessions.some((session) => session.title === "Beta deploy"), true);
    assert.equal(betaLegacyPayload.sessions.some((session) => session.title === "Deploy plan"), false);

    socket.close();
    await new Promise((resolve) => socket.once("close", () => resolve(null)));
  });

  test("project assignment routes expose the payload shape consumed by the ios client", async () => {
    const userTokens = await login("user@relay.local", "relay-user");
    const adminTokens = await login("admin@relay.local", "relay-admin");

    const enrollmentResponse = await fetch(`${baseUrl}/v1/admin/connectors/enrollments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({ tenantId: "demo-tenant", agentId: "ios-agent", description: "ios contract connector" }),
    });
    assert.equal(enrollmentResponse.status, 200);
    const enrollment = await enrollmentResponse.json() as { enrollmentToken: string };

    const connectorEnroll = await fetch(`${baseUrl}/v1/connector/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enrollmentToken: enrollment.enrollmentToken }),
    });
    const connectorToken = (await connectorEnroll.json() as { connectorToken: string }).connectorToken;
    const socket = startFakeConnector(baseUrl, connectorToken, "ios-agent");
    await new Promise((resolve) => socket.once("message", () => resolve(null)));

    const createProject = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({
        projectId: "ios-chat",
        displayName: "iOS Chat",
        description: "Native chat surface",
      }),
    });
    assert.equal(createProject.status, 200);

    const attachAgent = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/ios-chat/agents/ios-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.accessToken}`,
      },
      body: JSON.stringify({
        agentDisplayName: "Support Agent",
        agentRole: "support",
        agentInstructions: "Handle mobile user chats.",
        displayName: "iOS Chat / Support Agent",
      }),
    });
    assert.equal(attachAgent.status, 200);

    const createSession = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/ios-chat/agents/ios-agent/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userTokens.accessToken}`,
      },
      body: JSON.stringify({ title: "Mobile thread", message: "hello relay" }),
    });
    assert.equal(createSession.status, 200);
    const createdSessionPayload = await createSession.json() as { session: SessionRecord };
    assert.equal(createdSessionPayload.session.messageCount, 1);
    assert.equal(createdSessionPayload.session.preview, "hello relay");

    const listProjects = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(listProjects.status, 200);
    const projectsPayload = await listProjects.json() as {
      projects: Array<{ projectId: string; displayName: string; description: string }>;
    };
    assert.equal(projectsPayload.projects.some((project) => project.projectId === "ios-chat" && project.displayName === "iOS Chat"), true);

    const listProjectAgents = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/ios-chat/agents`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(listProjectAgents.status, 200);
    const agentsPayload = await listProjectAgents.json() as {
      agents: Array<{ agentId: string; displayName: string; agent?: { displayName?: string; role?: string; description?: string } }>;
    };
    assert.equal(agentsPayload.agents[0]?.agentId, "ios-agent");
    assert.equal(agentsPayload.agents[0]?.agent?.displayName, "Support Agent");
    assert.equal(agentsPayload.agents[0]?.agent?.role, "support");

    const listSessions = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/ios-chat/agents/ios-agent/sessions`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(listSessions.status, 200);
    const sessionsPayload = await listSessions.json() as {
      sessions: Array<{ sessionId: string; title: string; createdAt: number; updatedAt: number; messageCount: number; preview: string }>;
    };
    assert.equal(sessionsPayload.sessions[0]?.sessionId, createdSessionPayload.session.sessionId);
    assert.equal(typeof sessionsPayload.sessions[0]?.createdAt, "number");
    assert.equal(typeof sessionsPayload.sessions[0]?.updatedAt, "number");
    assert.equal(sessionsPayload.sessions[0]?.messageCount, 1);
    assert.equal(sessionsPayload.sessions[0]?.preview, "hello relay");

    const readSession = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/ios-chat/agents/ios-agent/sessions/${createdSessionPayload.session.sessionId}`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(readSession.status, 200);
    const sessionPayload = await readSession.json() as { session: SessionRecord };
    assert.equal(sessionPayload.session.sessionId, createdSessionPayload.session.sessionId);
    assert.equal(sessionPayload.session.messages.at(-1)?.content, "hello relay");
    assert.equal(sessionPayload.session.messageCount, 1);

    const streamResponse = await fetch(`${baseUrl}/v1/tenants/demo-tenant/projects/ios-chat/agents/ios-agent/sessions/${createdSessionPayload.session.sessionId}/stream?message=ship`, {
      headers: { Authorization: `Bearer ${userTokens.accessToken}` },
    });
    assert.equal(streamResponse.status, 200);
    const streamText = await streamResponse.text();
    assert.match(streamText, /event: chunk/);
    assert.match(streamText, /"delta":"hello "/);
    assert.match(streamText, /event: complete/);

    socket.close();
    await new Promise((resolve) => socket.once("close", () => resolve(null)));
  });
});
