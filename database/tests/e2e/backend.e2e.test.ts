import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import WebSocket from "ws";

import { startDatabaseServer } from "./helpers.ts";

const servers: Array<Awaited<ReturnType<typeof startDatabaseServer>>> = [];

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (server) await server.close();
  }
});

async function boot() {
  const server = await startDatabaseServer("database-backend");
  servers.push(server);
  const login = await fetch(`${server.baseUrl}/v1/auth/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@database.local", password: "database-admin" }),
  });
  assert.equal(login.status, 200);
  const auth = await login.json() as { accessToken: string };
  return {
    ...server,
    adminToken: auth.accessToken,
  };
}

function authHeaders(token: string) {
  return {
    authorization: `Bearer ${token}`,
  };
}

test("namespace creation seeds protected built-ins and custom schemas keep index metadata", async () => {
  const server = await boot();

  const created = await fetch(`${server.baseUrl}/v1/namespaces`, {
    method: "POST",
    headers: {
      ...authHeaders(server.adminToken),
      "content-type": "application/json",
    },
    body: JSON.stringify({ id: "crm", displayName: "CRM" }),
  });
  assert.equal(created.status, 201);

  const collectionsResponse = await fetch(`${server.baseUrl}/v1/namespaces/crm/collections`, {
    headers: authHeaders(server.adminToken),
  });
  const collectionsPayload = await collectionsResponse.json() as { items: Array<{ name: string; protected: boolean }> };
  assert.deepEqual(collectionsPayload.items.slice(0, 4).map((item) => item.name).sort(), ["events", "notes", "people", "tasks"]);
  assert.equal(collectionsPayload.items.find((item) => item.name === "people")?.protected, true);

  const customCollection = await fetch(`${server.baseUrl}/v1/namespaces/crm/collections`, {
    method: "POST",
    headers: {
      ...authHeaders(server.adminToken),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: "leads",
      displayName: "Leads",
      fields: [
        { name: "name", type: "text", required: true },
        { name: "status", type: "select", options: ["new", "qualified"] },
        { name: "website", type: "url" },
      ],
      indexes: [
        { name: "leads_name_idx", fields: ["name"] },
      ],
    }),
  });
  assert.equal(customCollection.status, 201);
  const collectionPayload = await customCollection.json() as { indexes: Array<{ name: string }> };
  assert.equal(collectionPayload.indexes[0]?.name, "leads_name_idx");

  const extendBuiltIn = await fetch(`${server.baseUrl}/v1/namespaces/crm/collections/tasks`, {
    method: "PATCH",
    headers: {
      ...authHeaders(server.adminToken),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      fields: [
        { name: "title", type: "text", required: true },
        { name: "status", type: "select", required: true, options: ["todo", "in_progress", "done"] },
        { name: "priority", type: "select", options: ["low", "medium", "high", "urgent"] },
        { name: "dueAt", type: "date" },
        { name: "assignee", type: "relation", relation: { collectionName: "people" } },
        { name: "estimateHours", type: "number" },
      ],
    }),
  });
  assert.equal(extendBuiltIn.status, 200);

  const destructiveBuiltIn = await fetch(`${server.baseUrl}/v1/namespaces/crm/collections/tasks`, {
    method: "PATCH",
    headers: {
      ...authHeaders(server.adminToken),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      fields: [
        { name: "status", type: "select", required: true, options: ["todo", "in_progress", "done"] },
      ],
    }),
  });
  assert.equal(destructiveBuiltIn.status, 400);
});

test("record CRUD, scoped tokens, files, and realtime work together", async () => {
  const server = await boot();

  await fetch(`${server.baseUrl}/v1/namespaces`, {
    method: "POST",
    headers: {
      ...authHeaders(server.adminToken),
      "content-type": "application/json",
    },
    body: JSON.stringify({ id: "crm", displayName: "CRM" }),
  });

  await fetch(`${server.baseUrl}/v1/namespaces/crm/collections`, {
    method: "POST",
    headers: {
      ...authHeaders(server.adminToken),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: "leads",
      displayName: "Leads",
      fields: [
        { name: "name", type: "text", required: true },
        { name: "status", type: "select", options: ["new", "qualified"], required: true },
      ],
      indexes: [],
    }),
  });

  const tokenResponse = await fetch(`${server.baseUrl}/v1/namespaces/crm/tokens`, {
    method: "POST",
    headers: {
      ...authHeaders(server.adminToken),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      label: "crm-worker",
      collectionName: "leads",
      operations: [
        "schema:read",
        "records:list",
        "records:read",
        "records:create",
        "records:update",
        "records:delete",
        "files:read",
        "files:write",
        "realtime:subscribe",
      ],
    }),
  });
  assert.equal(tokenResponse.status, 201);
  const tokenPayload = await tokenResponse.json() as { token: string; record: { id: string } };
  const scopedHeaders = authHeaders(tokenPayload.token);

  const subscriptionReady = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("subscription timeout")), 5_000);
    const socket = new WebSocket(`${server.baseUrl.replace("http", "ws")}/v1/realtime?token=${tokenPayload.token}`);
    socket.on("open", () => {
      socket.send(JSON.stringify({
        type: "subscribe",
        namespaceId: "crm",
        collectionName: "leads",
      }));
    });
    socket.on("message", (buffer) => {
      const payload = JSON.parse(buffer.toString()) as { type: string };
      if (payload.type === "subscribed") {
        clearTimeout(timeout);
        socket.close();
        resolve();
      }
    });
    socket.on("error", reject);
  });

  const realtimeEvent = new Promise<Record<string, unknown>>((resolve, reject) => {
    const socket = new WebSocket(`${server.baseUrl.replace("http", "ws")}/v1/realtime?token=${tokenPayload.token}`);
    socket.on("open", () => {
      socket.send(JSON.stringify({
        type: "subscribe",
        namespaceId: "crm",
        collectionName: "leads",
      }));
    });
    socket.on("message", (buffer) => {
      const payload = JSON.parse(buffer.toString()) as { type: string; event?: Record<string, unknown> };
      if (payload.type === "event" && payload.event) {
        resolve(payload.event);
        socket.close();
      }
    });
    socket.on("error", reject);
  });

  await subscriptionReady;

  const createdRecordResponse = await fetch(`${server.baseUrl}/v1/namespaces/crm/collections/leads/records`, {
    method: "POST",
    headers: {
      ...scopedHeaders,
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: "Ada", status: "new" }),
  });
  assert.equal(createdRecordResponse.status, 201);
  const createdRecord = await createdRecordResponse.json() as { id: string; name: string };
  assert.equal(createdRecord.name, "Ada");

  const event = await realtimeEvent;
  assert.equal(event.type, "record.created");
  assert.equal(event.collectionName, "leads");

  await fetch(`${server.baseUrl}/v1/namespaces/crm/collections/leads/records/${createdRecord.id}`, {
    method: "PATCH",
    headers: {
      ...scopedHeaders,
      "content-type": "application/json",
    },
    body: JSON.stringify({ status: "qualified" }),
  });

  const listed = await fetch(`${server.baseUrl}/v1/namespaces/crm/collections/leads/records?filter=${encodeURIComponent(JSON.stringify({ status: "qualified" }))}&sort=-name`, {
    headers: scopedHeaders,
  });
  assert.equal(listed.status, 200);
  const listedPayload = await listed.json() as { total: number; items: Array<{ id: string; status: string }> };
  assert.equal(listedPayload.total, 1);
  assert.equal(listedPayload.items[0]?.status, "qualified");

  const forbiddenNamespace = await fetch(`${server.baseUrl}/v1/namespaces/main/collections/notes/records`, {
    headers: scopedHeaders,
  });
  assert.equal(forbiddenNamespace.status, 403);

  const form = new FormData();
  form.set("namespaceId", "crm");
  form.set("collectionName", "leads");
  form.set("recordId", createdRecord.id);
  form.set("file", new Blob(["hello file"]), "hello.txt");
  const uploaded = await fetch(`${server.baseUrl}/v1/files`, {
    method: "POST",
    headers: scopedHeaders,
    body: form,
  });
  assert.equal(uploaded.status, 201);
  const uploadedPayload = await uploaded.json() as { id: string; downloadPath: string };

  const downloaded = await fetch(`${server.baseUrl}${uploadedPayload.downloadPath}`, {
    headers: scopedHeaders,
  });
  assert.equal(downloaded.status, 200);
  assert.equal(await downloaded.text(), "hello file");

  const deletedFile = await fetch(`${server.baseUrl}/v1/files/${uploadedPayload.id}`, {
    method: "DELETE",
    headers: scopedHeaders,
  });
  assert.equal(deletedFile.status, 200);

  const deletedRecord = await fetch(`${server.baseUrl}/v1/namespaces/crm/collections/leads/records/${createdRecord.id}`, {
    method: "DELETE",
    headers: scopedHeaders,
  });
  assert.equal(deletedRecord.status, 200);

  const tokenList = await fetch(`${server.baseUrl}/v1/namespaces/crm/tokens`, {
    headers: authHeaders(server.adminToken),
  });
  const tokenListPayload = await tokenList.json() as { items: Array<{ id: string }> };
  assert.equal(tokenListPayload.items[0]?.id, tokenPayload.record.id);

  const revoke = await fetch(`${server.baseUrl}/v1/namespaces/crm/tokens/${tokenPayload.record.id}/revoke`, {
    method: "POST",
    headers: {
      ...authHeaders(server.adminToken),
    },
  });
  assert.equal(revoke.status, 200);

  const deniedAfterRevoke = await fetch(`${server.baseUrl}/v1/namespaces/crm/collections/leads/records`, {
    headers: scopedHeaders,
  });
  assert.equal(deniedAfterRevoke.status, 401);
});
