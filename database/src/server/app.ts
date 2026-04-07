import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";

import { DatabaseAuthService, type AuthPrincipal } from "./auth.ts";
import { loadDatabaseConfig, type DatabaseServiceConfig } from "./config.ts";
import { DatabaseServiceStore } from "./db.ts";
import { RealtimeHub } from "./realtime.ts";
import type { DatabaseOperation, RecordChangeEvent } from "../shared/types.ts";

function resolvePublicRoot(): string {
  const candidates = [
    fileURLToPath(new URL("../public", import.meta.url)),
    fileURLToPath(new URL("../../public", import.meta.url)),
    path.join(process.cwd(), "public"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

const publicRoot = resolvePublicRoot();

function parseBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (header) {
    const [scheme, token] = header.split(" ");
    if (scheme?.toLowerCase() === "bearer" && token) {
      return token;
    }
  }
  const rawUrl = request.raw.url ?? request.url;
  if (rawUrl) {
    const parsed = new URL(rawUrl, "http://localhost");
    const queryToken = parsed.searchParams.get("token");
    if (queryToken?.trim()) {
      return queryToken;
    }
  }
  return null;
}

function readBody(request: FastifyRequest): Record<string, unknown> {
  return ((request.body ?? {}) as Record<string, unknown>);
}

function parseOptionalJson(value: string | undefined): Record<string, unknown> | undefined {
  if (!value?.trim()) return undefined;
  return JSON.parse(value) as Record<string, unknown>;
}

function ensureAllowed(principal: AuthPrincipal, input: {
  namespaceId?: string;
  collectionName?: string;
  operation?: DatabaseOperation;
}): void {
  if (principal.kind === "admin") return;
  if (input.namespaceId && principal.namespaceId !== input.namespaceId) {
    throw new Error("Forbidden: namespace mismatch");
  }
  if (input.collectionName && principal.collectionName && principal.collectionName !== input.collectionName) {
    throw new Error("Forbidden: collection mismatch");
  }
  if (input.operation && !principal.operations.includes(input.operation)) {
    throw new Error(`Forbidden: operation ${input.operation} is required`);
  }
}

async function resolvePrincipal(
  request: FastifyRequest,
  auth: DatabaseAuthService,
  store: DatabaseServiceStore,
): Promise<AuthPrincipal | null> {
  const token = parseBearerToken(request);
  if (!token) return null;
  const admin = await auth.verifyAdminToken(token);
  if (admin) return admin;
  const scopedToken = store.authenticateScopedToken(token);
  if (!scopedToken) return null;
  return {
    kind: "token",
    tokenId: scopedToken.id,
    namespaceId: scopedToken.namespaceId,
    collectionName: scopedToken.collectionName,
    operations: scopedToken.operations,
  };
}

async function requirePrincipal(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: DatabaseAuthService,
  store: DatabaseServiceStore,
  requirement?: {
    namespaceId?: string;
    collectionName?: string;
    operation?: DatabaseOperation;
    adminOnly?: boolean;
  },
): Promise<AuthPrincipal | null> {
  const principal = await resolvePrincipal(request, auth, store);
  if (!principal) {
    await reply.code(401).send({ error: "Unauthorized" });
    return null;
  }
  if (requirement?.adminOnly && principal.kind !== "admin") {
    await reply.code(403).send({ error: "Forbidden", message: "Admin access required." });
    return null;
  }
  try {
    ensureAllowed(principal, requirement ?? {});
    return principal;
  } catch (error) {
    await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

async function readUpload(request: FastifyRequest): Promise<{
  namespaceId: string;
  collectionName?: string;
  recordId?: string;
  filename: string;
  contentType: string;
  bytes: Buffer;
}> {
  const parts = request.parts();
  let namespaceId = "";
  let collectionName = "";
  let recordId = "";
  let bytes = Buffer.alloc(0);
  let filename = "upload.bin";
  let contentType = "application/octet-stream";

  for await (const part of parts) {
    if (part.type === "file") {
      const chunks: Buffer[] = [];
      for await (const chunk of part.file) {
        chunks.push(Buffer.from(chunk));
      }
      bytes = Buffer.concat(chunks);
      filename = part.filename || filename;
      contentType = part.mimetype || contentType;
      continue;
    }
    if (part.fieldname === "namespaceId") namespaceId = String(part.value ?? "");
    if (part.fieldname === "collectionName") collectionName = String(part.value ?? "");
    if (part.fieldname === "recordId") recordId = String(part.value ?? "");
  }

  if (!namespaceId) throw new Error("namespaceId is required");
  if (bytes.length === 0) throw new Error("file is required");
  return {
    namespaceId,
    ...(collectionName ? { collectionName } : {}),
    ...(recordId ? { recordId } : {}),
    filename,
    contentType,
    bytes,
  };
}

export interface BuildDatabaseAppOptions {
  config?: Partial<DatabaseServiceConfig>;
}

export function buildDatabaseApp(options: BuildDatabaseAppOptions = {}) {
  const config = loadDatabaseConfig(options.config);
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.filesDir, { recursive: true });

  const app = Fastify({ logger: false });
  const auth = new DatabaseAuthService(config.jwtSecret);
  const store = new DatabaseServiceStore(config.dbPath, config.filesDir);
  const realtime = new RealtimeHub();

  const emitChange = (event: RecordChangeEvent) => {
    realtime.broadcast(event);
  };

  app.addHook("onClose", async () => {
    store.close();
  });

  app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
  });
  app.register(multipart);
  app.register(fastifyStatic, {
    root: publicRoot,
    prefix: "/static/",
  });
  app.register(async (wsApp) => {
    await wsApp.register(websocket, {
      errorHandler(error, socket) {
        console.error(error);
        socket.terminate();
      },
    });

    wsApp.get("/v1/realtime", { websocket: true }, async (socket, request) => {
      const principal = await resolvePrincipal(request as FastifyRequest, auth, store);
      if (!principal) {
        socket.close();
        return;
      }
      realtime.attach(socket, principal);
    });
  });

  app.get("/", async (_request, reply) => {
    reply.type("text/html; charset=utf-8");
    return fs.readFileSync(path.join(publicRoot, "index.html"), "utf8");
  });

  app.get("/favicon.ico", async (_request, reply) => {
    await reply.code(204).send();
  });

  app.get("/v1/health", async () => ({
    ok: true,
    service: "database",
    host: config.host,
    port: config.port,
  }));

  app.post("/v1/auth/admin/login", async (request, reply) => {
    const body = readBody(request);
    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";
    const admin = store.verifyAdmin(email, password);
    if (!admin) {
      return await reply.code(401).send({ error: "Invalid email or password." });
    }
    const accessToken = await auth.issueAdminToken({
      adminId: admin.id,
      email: admin.email,
    });
    return {
      accessToken,
      admin: {
        id: admin.id,
        email: admin.email,
      },
    };
  });

  app.get("/v1/auth/me", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store);
    if (!principal) return null;
    return {
      principal,
    };
  });

  app.get("/v1/settings", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { adminOnly: true });
    if (!principal) return null;
    return {
      service: "database",
      host: config.host,
      port: config.port,
      dataDir: config.dataDir,
      filesDir: config.filesDir,
    };
  });

  app.get("/v1/namespaces", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { adminOnly: true });
    if (!principal) return null;
    return {
      items: store.listNamespaces(),
    };
  });

  app.post("/v1/namespaces", async (request, reply) => {
    const principal = await requirePrincipal(request, reply, auth, store, { adminOnly: true });
    if (!principal) return null;
    try {
      const body = readBody(request);
      const displayName = typeof body.displayName === "string" ? body.displayName : "";
      const namespace = store.createNamespace({
        id: typeof body.id === "string" ? body.id : undefined,
        displayName,
      });
      return await reply.code(201).send(namespace);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/v1/namespaces/:namespaceId/collections", async (request, reply) => {
    const params = request.params as { namespaceId: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      operation: "schema:read",
    });
    if (!principal) return null;
    return {
      items: store.listCollections(params.namespaceId),
    };
  });

  app.post("/v1/namespaces/:namespaceId/collections", async (request, reply) => {
    const params = request.params as { namespaceId: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      operation: "schema:write",
    });
    if (!principal) return null;
    try {
      const body = readBody(request);
      const collection = store.createCollection(params.namespaceId, {
        name: String(body.name ?? ""),
        displayName: typeof body.displayName === "string" ? body.displayName : undefined,
        fields: Array.isArray(body.fields) ? body.fields as never[] : [],
        indexes: Array.isArray(body.indexes) ? body.indexes as never[] : [],
      });
      return await reply.code(201).send(collection);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/v1/namespaces/:namespaceId/collections/:collectionName", async (request, reply) => {
    const params = request.params as { namespaceId: string; collectionName: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      collectionName: params.collectionName,
      operation: "schema:read",
    });
    if (!principal) return null;
    const collection = store.getCollection(params.namespaceId, params.collectionName);
    if (!collection) {
      return await reply.code(404).send({ error: "collection_not_found" });
    }
    return collection;
  });

  app.patch("/v1/namespaces/:namespaceId/collections/:collectionName", async (request, reply) => {
    const params = request.params as { namespaceId: string; collectionName: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      collectionName: params.collectionName,
      operation: "schema:write",
    });
    if (!principal) return null;
    try {
      const body = readBody(request);
      return store.updateCollection(params.namespaceId, params.collectionName, {
        displayName: typeof body.displayName === "string" ? body.displayName : undefined,
        fields: Array.isArray(body.fields) ? body.fields as never[] : undefined,
        indexes: Array.isArray(body.indexes) ? body.indexes as never[] : undefined,
      });
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/v1/namespaces/:namespaceId/collections/:collectionName", async (request, reply) => {
    const params = request.params as { namespaceId: string; collectionName: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      collectionName: params.collectionName,
      operation: "schema:write",
    });
    if (!principal) return null;
    try {
      const removed = store.deleteCollection(params.namespaceId, params.collectionName);
      return { ok: removed };
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/v1/namespaces/:namespaceId/collections/:collectionName/records", async (request, reply) => {
    const params = request.params as { namespaceId: string; collectionName: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      collectionName: params.collectionName,
      operation: "records:list",
    });
    if (!principal) return null;
    try {
      return store.listRecords(params.namespaceId, params.collectionName, {
        filter: parseOptionalJson(typeof request.query === "object" && request.query && "filter" in request.query ? String((request.query as { filter?: string }).filter) : undefined),
        sort: typeof request.query === "object" && request.query && "sort" in request.query ? String((request.query as { sort?: string }).sort) : undefined,
        limit: typeof request.query === "object" && request.query && "limit" in request.query ? Number((request.query as { limit?: string }).limit) : undefined,
        offset: typeof request.query === "object" && request.query && "offset" in request.query ? Number((request.query as { offset?: string }).offset) : undefined,
      });
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/v1/namespaces/:namespaceId/collections/:collectionName/records", async (request, reply) => {
    const params = request.params as { namespaceId: string; collectionName: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      collectionName: params.collectionName,
      operation: "records:create",
    });
    if (!principal) return null;
    try {
      const record = store.createRecord(params.namespaceId, params.collectionName, readBody(request));
      emitChange({
        type: "record.created",
        namespaceId: params.namespaceId,
        collectionName: params.collectionName,
        recordId: record.id,
        record,
        at: new Date().toISOString(),
      });
      return await reply.code(201).send(record);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/v1/namespaces/:namespaceId/collections/:collectionName/records/:recordId", async (request, reply) => {
    const params = request.params as { namespaceId: string; collectionName: string; recordId: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      collectionName: params.collectionName,
      operation: "records:read",
    });
    if (!principal) return null;
    const record = store.getRecord(params.namespaceId, params.collectionName, params.recordId);
    if (!record) {
      return await reply.code(404).send({ error: "record_not_found" });
    }
    return record;
  });

  app.patch("/v1/namespaces/:namespaceId/collections/:collectionName/records/:recordId", async (request, reply) => {
    const params = request.params as { namespaceId: string; collectionName: string; recordId: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      collectionName: params.collectionName,
      operation: "records:update",
    });
    if (!principal) return null;
    try {
      const record = store.updateRecord(params.namespaceId, params.collectionName, params.recordId, readBody(request));
      emitChange({
        type: "record.updated",
        namespaceId: params.namespaceId,
        collectionName: params.collectionName,
        recordId: record.id,
        record,
        at: new Date().toISOString(),
      });
      return record;
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.delete("/v1/namespaces/:namespaceId/collections/:collectionName/records/:recordId", async (request, reply) => {
    const params = request.params as { namespaceId: string; collectionName: string; recordId: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      collectionName: params.collectionName,
      operation: "records:delete",
    });
    if (!principal) return null;
    const ok = store.deleteRecord(params.namespaceId, params.collectionName, params.recordId);
    if (ok) {
      emitChange({
        type: "record.deleted",
        namespaceId: params.namespaceId,
        collectionName: params.collectionName,
        recordId: params.recordId,
        at: new Date().toISOString(),
      });
    }
    return { ok };
  });

  app.get("/v1/namespaces/:namespaceId/files", async (request, reply) => {
    const params = request.params as { namespaceId: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      operation: "files:read",
    });
    if (!principal) return null;
    return {
      items: store.listFiles(params.namespaceId),
    };
  });

  app.post("/v1/files", async (request, reply) => {
    try {
      const upload = await readUpload(request);
      const principal = await requirePrincipal(request, reply, auth, store, {
        namespaceId: upload.namespaceId,
        collectionName: upload.collectionName,
        operation: "files:write",
      });
      if (!principal) return null;
      const asset = store.saveFile(upload);
      return await reply.code(201).send(asset);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/v1/files/:fileId", async (request, reply) => {
    const params = request.params as { fileId: string };
    const file = store.getFile(params.fileId);
    if (!file) {
      return await reply.code(404).send({ error: "file_not_found" });
    }
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: file.namespaceId,
      collectionName: file.collectionName ?? undefined,
      operation: "files:read",
    });
    if (!principal) return null;
    reply.header("content-type", file.contentType);
    reply.header("content-disposition", `inline; filename="${file.filename}"`);
    return reply.send(fs.createReadStream(file.storagePath));
  });

  app.delete("/v1/files/:fileId", async (request, reply) => {
    const params = request.params as { fileId: string };
    const file = store.getFile(params.fileId);
    if (!file) {
      return await reply.code(404).send({ error: "file_not_found" });
    }
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: file.namespaceId,
      collectionName: file.collectionName ?? undefined,
      operation: "files:write",
    });
    if (!principal) return null;
    return {
      ok: store.deleteFile(params.fileId),
    };
  });

  app.get("/v1/namespaces/:namespaceId/tokens", async (request, reply) => {
    const params = request.params as { namespaceId: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      operation: "tokens:issue",
    });
    if (!principal) return null;
    return {
      items: store.listScopedTokens(params.namespaceId),
    };
  });

  app.post("/v1/namespaces/:namespaceId/tokens", async (request, reply) => {
    const params = request.params as { namespaceId: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      operation: "tokens:issue",
    });
    if (!principal) return null;
    try {
      const body = readBody(request);
      const created = store.createScopedToken({
        label: String(body.label ?? "token"),
        namespaceId: params.namespaceId,
        collectionName: typeof body.collectionName === "string" && body.collectionName ? body.collectionName : undefined,
        operations: Array.isArray(body.operations) ? body.operations as DatabaseOperation[] : [],
      });
      return await reply.code(201).send(created);
    } catch (error) {
      return await reply.code(400).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/v1/namespaces/:namespaceId/tokens/:tokenId/revoke", async (request, reply) => {
    const params = request.params as { namespaceId: string; tokenId: string };
    const principal = await requirePrincipal(request, reply, auth, store, {
      namespaceId: params.namespaceId,
      operation: "tokens:revoke",
    });
    if (!principal) return null;
    return {
      ok: store.revokeScopedToken(params.namespaceId, params.tokenId),
    };
  });

  return { app, config, store };
}
