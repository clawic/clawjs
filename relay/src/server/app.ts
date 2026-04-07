import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AuthClaims } from "../shared/protocol.ts";
import {
  deriveAssignmentWorkspaceId,
  deriveRuntimeAgentId,
  type ProjectResourceRef,
  type ProjectSecretRef,
} from "../shared/project-model.ts";
import { RelayAuthService } from "./auth.ts";
import { loadRelayConfig, type RelayConfig } from "./config.ts";
import { ConnectorRegistry, OfflineError } from "./connector-registry.ts";
import { RelayDatabase } from "./db.ts";
import { RelayLogger } from "./logger.ts";

interface RelayAppOptions {
  config?: Partial<RelayConfig>;
  logger?: RelayLogger;
}

type WorkspaceParams = {
  tenantId: string;
  agentId: string;
  workspaceId: string;
  sessionId?: string;
};

type ProjectAgentParams = {
  tenantId: string;
  projectId: string;
  agentId: string;
  sessionId?: string;
};

function parseBearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function ensureScope(claims: AuthClaims, scope: string): boolean {
  return claims.role === "admin" || claims.scopes.includes("*") || claims.scopes.includes(scope);
}

function authorizeTenant(claims: AuthClaims, tenantId: string): void {
  if (claims.tenantId !== tenantId) {
    throw new Error("Forbidden: tenant mismatch");
  }
}

function authorizeWorkspace(claims: AuthClaims, params: WorkspaceParams): void {
  if (claims.tenantId !== params.tenantId) {
    throw new Error("Forbidden: tenant mismatch");
  }
  if (claims.agentId && claims.agentId !== params.agentId) {
    throw new Error("Forbidden: agent mismatch");
  }
  if (claims.workspaceId && claims.workspaceId !== params.workspaceId) {
    throw new Error("Forbidden: workspace mismatch");
  }
}

async function requireClaims(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: RelayAuthService,
  scope: string,
): Promise<AuthClaims | null> {
  const token = parseBearerToken(request);
  if (!token) {
    await reply.code(401).send({ error: "Unauthorized", message: "Missing bearer token." });
    return null;
  }

  try {
    const claims = await auth.verifyAccessToken(token);
    if (!ensureScope(claims, scope)) {
      await reply.code(403).send({ error: "Forbidden", message: `Scope ${scope} is required.` });
      return null;
    }
    return claims;
  } catch {
    await reply.code(401).send({ error: "Unauthorized", message: "Invalid bearer token." });
    return null;
  }
}

function tokensFromText(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

async function readRequestBody(request: FastifyRequest): Promise<Record<string, unknown>> {
  return (await request.body ?? {}) as Record<string, unknown>;
}

function normalizeUploadData(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:")) {
    const [, base64Data = ""] = trimmed.split(",", 2);
    return base64Data;
  }
  return trimmed;
}

function parseProjectResourceRefs(value: unknown): ProjectResourceRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const ref = entry as Record<string, unknown>;
    const id = typeof ref.id === "string" ? ref.id.trim() : "";
    if (!id) return [];
    return [{
      id,
      ...(typeof ref.label === "string" ? { label: ref.label } : {}),
      ...(typeof ref.uri === "string" ? { uri: ref.uri } : {}),
      ...(ref.mode === "allow" || ref.mode === "deny" ? { mode: ref.mode } : {}),
      ...(ref.metadata && typeof ref.metadata === "object" && !Array.isArray(ref.metadata)
        ? { metadata: ref.metadata as Record<string, unknown> }
        : {}),
    }];
  });
}

function parseProjectSecretRefs(value: unknown): ProjectSecretRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const ref = entry as Record<string, unknown>;
    const id = typeof ref.id === "string" ? ref.id.trim() : "";
    if (!id) return [];
    return [{
      id,
      ...(typeof ref.label === "string" ? { label: ref.label } : {}),
      ...(typeof ref.secretName === "string" ? { secretName: ref.secretName } : {}),
      ...(ref.mode === "allow" || ref.mode === "deny" ? { mode: ref.mode } : {}),
      ...(ref.metadata && typeof ref.metadata === "object" && !Array.isArray(ref.metadata)
        ? { metadata: ref.metadata as Record<string, unknown> }
        : {}),
    }];
  });
}

function assignmentWorkspaceParams(params: ProjectAgentParams, workspaceId: string): WorkspaceParams {
  return {
    tenantId: params.tenantId,
    agentId: params.agentId,
    workspaceId,
    ...(params.sessionId ? { sessionId: params.sessionId } : {}),
  };
}

async function invokeWorkspace(
  request: FastifyRequest<{ Params: WorkspaceParams }>,
  reply: FastifyReply,
  auth: RelayAuthService,
  registry: ConnectorRegistry,
  db: RelayDatabase,
  scope: string,
  operation: string,
  payload?: Record<string, unknown>,
  paramsOverride?: WorkspaceParams,
): Promise<Record<string, unknown> | null> {
  const claims = await requireClaims(request, reply, auth, scope);
  if (!claims) return null;
  const params = paramsOverride ?? request.params;
  try {
    authorizeWorkspace(claims, params);
  } catch (error) {
    await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    return null;
  }

  try {
    const result = await registry.invoke({
      tenantId: params.tenantId,
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      operation,
      payload,
    });
    db.appendActivity({
      tenantId: params.tenantId,
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      capability: operation,
      status: "success",
      detail: `${operation} completed`,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.appendActivity({
      tenantId: params.tenantId,
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      capability: operation,
      status: "error",
      detail: message,
    });
    if (error instanceof OfflineError) {
      await reply.code(503).send({ error: "offline", message });
      return null;
    }
    await reply.code(502).send({ error: "relay_connector_error", message });
    return null;
  }
}

async function invokeProjectAssignment(
  request: FastifyRequest<{ Params: ProjectAgentParams }>,
  reply: FastifyReply,
  auth: RelayAuthService,
  registry: ConnectorRegistry,
  db: RelayDatabase,
  scope: string,
  operation: string,
  payload?: Record<string, unknown>,
  paramsOverride?: ProjectAgentParams,
): Promise<Record<string, unknown> | null> {
  const params = paramsOverride ?? request.params;
  const assignment = db.getProjectAssignment(params.tenantId, params.projectId, params.agentId);
  if (!assignment) {
    await reply.code(404).send({ error: "project_agent_assignment_not_found" });
    return null;
  }
  return await invokeWorkspace(
    request as unknown as FastifyRequest<{ Params: WorkspaceParams }>,
    reply,
    auth,
    registry,
    db,
    scope,
    operation,
    payload,
    assignmentWorkspaceParams(params, assignment.workspaceId),
  );
}

async function requireProjectAssignmentAccess(
  request: FastifyRequest<{ Params: ProjectAgentParams }>,
  reply: FastifyReply,
  auth: RelayAuthService,
  db: RelayDatabase,
  scope: string,
): Promise<{
  assignment: NonNullable<ReturnType<RelayDatabase["getProjectAssignment"]>>;
  params: ProjectAgentParams;
} | null> {
  const claims = await requireClaims(request, reply, auth, scope);
  if (!claims) return null;
  const params = request.params;
  const assignment = db.getProjectAssignment(params.tenantId, params.projectId, params.agentId);
  if (!assignment) {
    await reply.code(404).send({ error: "project_agent_assignment_not_found" });
    return null;
  }
  try {
    authorizeWorkspace(claims, assignmentWorkspaceParams(params, assignment.workspaceId));
  } catch (error) {
    await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    return null;
  }
  return { assignment, params };
}

export async function buildRelayApp(options: RelayAppOptions = {}) {
  const config = loadRelayConfig(options.config);
  const logger = options.logger ?? new RelayLogger();
  const db = new RelayDatabase(config.dbPath);
  const auth = new RelayAuthService(config, db);
  const registry = new ConnectorRegistry(db, logger, config.requestTimeoutMs);
  const app = Fastify({ logger: false });

  const materializeProjectAssignment = async (input: {
    tenantId: string;
    projectId: string;
    agentId: string;
    displayName?: string;
    instructions?: string;
    resourceRefs?: ProjectResourceRef[];
    secretRefs?: ProjectSecretRef[];
  }) => {
    const project = db.getProject(input.tenantId, input.projectId);
    if (!project) {
      throw new Error(`Unknown project: ${input.projectId}`);
    }
    const agent = db.getAgent(input.tenantId, input.agentId);
    if (!agent) {
      throw new Error(`Unknown agent: ${input.agentId}`);
    }

    const workspaceId = deriveAssignmentWorkspaceId(input.projectId, input.agentId);
    const runtimeAgentId = deriveRuntimeAgentId(input.projectId, input.agentId);
    const displayName = input.displayName ?? `${project.displayName} / ${agent.displayName}`;

    const result = await registry.invoke({
      tenantId: input.tenantId,
      agentId: input.agentId,
      workspaceId,
      operation: "admin.workspace.create",
      payload: {
        workspaceId,
        displayName,
        projectId: project.projectId,
        projectDisplayName: project.displayName,
        projectDescription: project.description,
        projectInstructions: project.instructions,
        logicalAgentId: agent.agentId,
        logicalAgentDisplayName: agent.displayName,
        logicalAgentRole: agent.role,
        logicalAgentDescription: agent.description,
        agentInstructions: agent.instructions,
        runtimeAgentId,
        assignmentDisplayName: displayName,
        assignmentInstructions: input.instructions,
        projectResourceRefs: project.resourceRefs,
        projectSecretRefs: project.secretRefs,
        agentResourceRefs: agent.resourceRefs,
        agentSecretRefs: agent.secretRefs,
        assignmentResourceRefs: input.resourceRefs ?? [],
        assignmentSecretRefs: input.secretRefs ?? [],
        materializationVersion: 1,
      },
    });

    db.upsertWorkspaces(input.tenantId, input.agentId, [{
      workspaceId,
      displayName: typeof result.displayName === "string" ? result.displayName : displayName,
    }]);

    return db.upsertProjectAssignment({
      tenantId: input.tenantId,
      projectId: input.projectId,
      agentId: input.agentId,
      workspaceId,
      runtimeAgentId,
      displayName,
      instructions: input.instructions,
      resourceRefs: input.resourceRefs ?? [],
      secretRefs: input.secretRefs ?? [],
    });
  };

  if (config.corsOrigins.length > 0) {
    await app.register(cors, {
      origin: config.corsOrigins,
      credentials: true,
    });
  }

  await app.register(websocket);

  app.get("/v1/health", async () => ({
    ok: true,
    service: "clawjs-relay",
    uptimeSeconds: Math.round(process.uptime()),
  }));

  app.post("/v1/auth/login", async (request, reply) => {
    const body = await readRequestBody(request);
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const tenantId = typeof body.tenantId === "string" && body.tenantId.trim() ? body.tenantId.trim() : "demo-tenant";

    const user = db.getUserByEmail(email);
    if (!user || !db.verifyPassword(user, password)) {
      return await reply.code(401).send({ error: "invalid_credentials" });
    }

    const membership = db.getMembership(user.id, tenantId);
    if (!membership) {
      return await reply.code(403).send({ error: "no_membership" });
    }

    const tokens = await auth.issueTokenPair({
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId,
      scopes: membership.scopes,
    });
    return {
      tenantId,
      role: user.role,
      scopes: membership.scopes,
      ...tokens,
    };
  });

  app.post("/v1/auth/refresh", async (request, reply) => {
    const body = await readRequestBody(request);
    const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : "";
    const consumed = db.consumeRefreshToken(refreshToken);
    if (!consumed) {
      return await reply.code(401).send({ error: "invalid_refresh_token" });
    }
    const user = consumed.userId === "admin-user"
      ? db.getUserByEmail("admin@relay.local")
      : db.getUserByEmail("user@relay.local");
    if (!user) {
      return await reply.code(401).send({ error: "invalid_refresh_token" });
    }
    const tokens = await auth.issueTokenPair({
      userId: consumed.userId,
      email: user.email,
      role: user.role,
      tenantId: consumed.tenantId,
      scopes: consumed.scopes,
      ...(consumed.agentId ? { agentId: consumed.agentId } : {}),
      ...(consumed.workspaceId ? { workspaceId: consumed.workspaceId } : {}),
    });
    return {
      tenantId: consumed.tenantId,
      role: user.role,
      scopes: consumed.scopes,
      ...tokens,
    };
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    const body = await readRequestBody(request);
    const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : "";
    db.revokeRefreshToken(refreshToken);
    return await reply.send({ ok: true });
  });

  app.post("/v1/connector/enroll", async (request, reply) => {
    const body = await readRequestBody(request);
    const enrollmentToken = typeof body.enrollmentToken === "string" ? body.enrollmentToken : "";
    const result = db.consumeEnrollment(enrollmentToken);
    if (!result) {
      return await reply.code(401).send({ error: "invalid_enrollment_token" });
    }
    return result;
  });

  app.get("/v1/connector/connect", { websocket: true }, async (socket, request) => {
    const token = parseBearerToken(request as unknown as FastifyRequest);
    if (!token) {
      socket.close();
      return;
    }
    const authContext = db.verifyConnectorToken(token);
    if (!authContext) {
      socket.close();
      return;
    }
    registry.attach(socket as any, authContext);
  });

  app.post("/v1/admin/connectors/enrollments", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "admin:*");
    if (!claims) return;
    const body = await readRequestBody(request);
    const tenantId = typeof body.tenantId === "string" && body.tenantId.trim() ? body.tenantId.trim() : claims.tenantId;
    const agentId = typeof body.agentId === "string" && body.agentId.trim() ? body.agentId.trim() : "";
    const description = typeof body.description === "string" ? body.description : undefined;
    if (!agentId) {
      return await reply.code(400).send({ error: "agentId is required" });
    }
    const enrollmentToken = db.createEnrollment(tenantId, agentId, description);
    return {
      tenantId,
      agentId,
      enrollmentToken,
    };
  });

  app.get("/v1/tenants/:tenantId/agents", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "agent:read");
    if (!claims) return;
    const { tenantId } = request.params as { tenantId: string };
    try {
      authorizeTenant(claims, tenantId);
    } catch (error) {
      return await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    }
    return { agents: db.listAgents(tenantId) };
  });

  app.get("/v1/tenants/:tenantId/projects", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "agent:read");
    if (!claims) return;
    const { tenantId } = request.params as { tenantId: string };
    try {
      authorizeTenant(claims, tenantId);
    } catch (error) {
      return await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    }
    return { projects: db.listProjects(tenantId) };
  });

  app.post("/v1/tenants/:tenantId/projects", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "admin:*");
    if (!claims) return;
    const { tenantId } = request.params as { tenantId: string };
    try {
      authorizeTenant(claims, tenantId);
    } catch (error) {
      return await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    }
    const body = await readRequestBody(request);
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (!projectId || !displayName) {
      return await reply.code(400).send({ error: "projectId and displayName are required" });
    }
    const project = db.upsertProject({
      tenantId,
      projectId,
      displayName,
      ...(typeof body.description === "string" ? { description: body.description } : {}),
      ...(typeof body.instructions === "string" ? { instructions: body.instructions } : {}),
      resourceRefs: parseProjectResourceRefs(body.resourceRefs),
      secretRefs: parseProjectSecretRefs(body.secretRefs),
    });
    return { project };
  });

  app.get("/v1/tenants/:tenantId/projects/:projectId", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "agent:read");
    if (!claims) return;
    const params = request.params as { tenantId: string; projectId: string };
    try {
      authorizeTenant(claims, params.tenantId);
    } catch (error) {
      return await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    }
    const project = db.getProject(params.tenantId, params.projectId);
    if (!project) {
      return await reply.code(404).send({ error: "project_not_found" });
    }
    return { project };
  });

  app.patch("/v1/tenants/:tenantId/projects/:projectId", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "admin:*");
    if (!claims) return;
    const params = request.params as { tenantId: string; projectId: string };
    try {
      authorizeTenant(claims, params.tenantId);
    } catch (error) {
      return await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    }
    const current = db.getProject(params.tenantId, params.projectId);
    if (!current) {
      return await reply.code(404).send({ error: "project_not_found" });
    }
    const body = await readRequestBody(request);
    const project = db.upsertProject({
      tenantId: params.tenantId,
      projectId: params.projectId,
      displayName: typeof body.displayName === "string" && body.displayName.trim() ? body.displayName.trim() : current.displayName,
      description: typeof body.description === "string" ? body.description : current.description,
      instructions: typeof body.instructions === "string" ? body.instructions : current.instructions,
      resourceRefs: Array.isArray(body.resourceRefs) ? parseProjectResourceRefs(body.resourceRefs) : current.resourceRefs,
      secretRefs: Array.isArray(body.secretRefs) ? parseProjectSecretRefs(body.secretRefs) : current.secretRefs,
    });

    for (const assignment of db.listProjectAgents(params.tenantId, params.projectId)) {
      await materializeProjectAssignment({
        tenantId: params.tenantId,
        projectId: params.projectId,
        agentId: assignment.agentId,
        displayName: assignment.displayName,
        instructions: assignment.instructions,
        resourceRefs: assignment.resourceRefs,
        secretRefs: assignment.secretRefs,
      });
    }

    return { project };
  });

  app.get("/v1/tenants/:tenantId/projects/:projectId/agents", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "agent:read");
    if (!claims) return;
    const params = request.params as { tenantId: string; projectId: string };
    try {
      authorizeTenant(claims, params.tenantId);
    } catch (error) {
      return await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    }
    const project = db.getProject(params.tenantId, params.projectId);
    if (!project) {
      return await reply.code(404).send({ error: "project_not_found" });
    }
    const assignments = db.listProjectAgents(params.tenantId, params.projectId).map((assignment) => {
      const agent = db.getAgent(params.tenantId, assignment.agentId);
      return {
        ...assignment,
        ...(agent ? { agent } : {}),
      };
    });
    return { project, agents: assignments };
  });

  app.get("/v1/tenants/:tenantId/agents/:agentId/projects", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "agent:read");
    if (!claims) return;
    const params = request.params as { tenantId: string; agentId: string };
    if (claims.tenantId !== params.tenantId || (claims.agentId && claims.agentId !== params.agentId)) {
      return await reply.code(403).send({ error: "Forbidden", message: "scope mismatch" });
    }
    const agent = db.getAgent(params.tenantId, params.agentId);
    if (!agent) {
      return await reply.code(404).send({ error: "agent_not_found" });
    }
    return {
      agent,
      projects: db.listAgentProjects(params.tenantId, params.agentId),
    };
  });

  app.post("/v1/tenants/:tenantId/projects/:projectId/agents/:agentId", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "admin:*");
    if (!claims) return;
    const params = request.params as { tenantId: string; projectId: string; agentId: string };
    try {
      authorizeTenant(claims, params.tenantId);
    } catch (error) {
      return await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    }
    const project = db.getProject(params.tenantId, params.projectId);
    if (!project) {
      return await reply.code(404).send({ error: "project_not_found" });
    }
    const body = await readRequestBody(request);
    db.upsertAgent(
      params.tenantId,
      params.agentId,
      typeof body.agentDisplayName === "string" && body.agentDisplayName.trim() ? body.agentDisplayName.trim() : params.agentId,
      {
        ...(typeof body.agentRole === "string" ? { role: body.agentRole } : {}),
        ...(typeof body.agentDescription === "string" ? { description: body.agentDescription } : {}),
        ...(typeof body.agentInstructions === "string" ? { instructions: body.agentInstructions } : {}),
        ...(Array.isArray(body.agentResourceRefs) ? { resourceRefs: parseProjectResourceRefs(body.agentResourceRefs) } : {}),
        ...(Array.isArray(body.agentSecretRefs) ? { secretRefs: parseProjectSecretRefs(body.agentSecretRefs) } : {}),
      },
    );

    try {
      const assignment = await materializeProjectAssignment({
        tenantId: params.tenantId,
        projectId: params.projectId,
        agentId: params.agentId,
        displayName: typeof body.displayName === "string" ? body.displayName : `${project.displayName} / ${params.agentId}`,
        instructions: typeof body.instructions === "string" ? body.instructions : undefined,
        resourceRefs: parseProjectResourceRefs(body.resourceRefs),
        secretRefs: parseProjectSecretRefs(body.secretRefs),
      });
      return { assignment };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return await reply.code(error instanceof OfflineError ? 503 : 502).send({ error: "project_assignment_create_failed", message });
    }
  });

  app.delete("/v1/tenants/:tenantId/projects/:projectId/agents/:agentId", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "admin:*");
    if (!claims) return;
    const params = request.params as { tenantId: string; projectId: string; agentId: string };
    try {
      authorizeTenant(claims, params.tenantId);
    } catch (error) {
      return await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
    }
    const assignment = db.getProjectAssignment(params.tenantId, params.projectId, params.agentId);
    if (!assignment) {
      return await reply.code(404).send({ error: "project_agent_assignment_not_found" });
    }
    try {
      await registry.invoke({
        tenantId: params.tenantId,
        agentId: params.agentId,
        workspaceId: assignment.workspaceId,
        operation: "workspace.delete",
        payload: {},
      });
    } catch {
      // Best-effort delete. The DB cleanup still proceeds.
    }
    db.deleteWorkspace(params.tenantId, params.agentId, assignment.workspaceId);
    db.deleteProjectAssignment(params.tenantId, params.projectId, params.agentId);
    return { ok: true };
  });

  app.get("/v1/tenants/:tenantId/agents/:agentId/workspaces", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "workspace:read");
    if (!claims) return;
    const params = request.params as { tenantId: string; agentId: string };
    if (claims.tenantId !== params.tenantId || (claims.agentId && claims.agentId !== params.agentId)) {
      return await reply.code(403).send({ error: "Forbidden", message: "scope mismatch" });
    }
    return { workspaces: db.listWorkspaces(params.tenantId, params.agentId) };
  });

  app.get("/v1/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/status", async (request, reply) => {
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "workspace.status",
    );
    if (!result) return;
    return result;
  });

  app.get("/v1/tenants/:tenantId/projects/:projectId/agents/:agentId/status", async (request, reply) => {
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "workspace.status",
    );
    if (!result) return;
    return result;
  });

  app.post("/v1/admin/tenants/:tenantId/agents/:agentId/workspaces", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "admin:*");
    if (!claims) return;
    const params = request.params as { tenantId: string; agentId: string };
    const body = await readRequestBody(request);
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
    if (!workspaceId) {
      return await reply.code(400).send({ error: "workspaceId is required" });
    }
    try {
      const result = await registry.invoke({
        tenantId: params.tenantId,
        agentId: params.agentId,
        workspaceId,
        operation: "admin.workspace.create",
        payload: {
          workspaceId,
          displayName: typeof body.displayName === "string" ? body.displayName : workspaceId,
        },
      });
      db.upsertWorkspaces(params.tenantId, params.agentId, [{
        workspaceId,
        displayName: typeof result.displayName === "string" ? result.displayName : workspaceId,
      }]);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return await reply.code(error instanceof OfflineError ? 503 : 502).send({ error: "admin_workspace_create_failed", message });
    }
  });

  app.post("/v1/admin/tenants/:tenantId/agents/:agentId/runtime/:action", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "admin:*");
    if (!claims) return;
    const params = request.params as { tenantId: string; agentId: string; action: string };
    const action = params.action;
    if (!["setup", "install", "uninstall", "status"].includes(action)) {
      return await reply.code(404).send({ error: "unsupported_runtime_action" });
    }
    try {
      const result = await registry.invoke({
        tenantId: params.tenantId,
        agentId: params.agentId,
        operation: `admin.runtime.${action}`,
        payload: action === "status" ? {} : await readRequestBody(request),
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return await reply.code(error instanceof OfflineError ? 503 : 502).send({ error: "admin_runtime_failed", message });
    }
  });

  // --- Admin data deletion endpoints ---
  app.delete("/v1/admin/tenants/:tenantId/activity", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "admin:*");
    if (!claims) return;
    const { tenantId } = request.params as { tenantId: string };
    if (claims.tenantId !== tenantId) {
      return await reply.code(403).send({ error: "Forbidden" });
    }
    const query = request.query as { agentId?: string };
    const deleted = db.clearActivity(tenantId, query.agentId);
    return { ok: true, deleted };
  });

  app.delete("/v1/admin/tenants/:tenantId/usage", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "admin:*");
    if (!claims) return;
    const { tenantId } = request.params as { tenantId: string };
    if (claims.tenantId !== tenantId) {
      return await reply.code(403).send({ error: "Forbidden" });
    }
    const query = request.query as { agentId?: string };
    const deleted = db.clearUsage(tenantId, query.agentId);
    return { ok: true, deleted };
  });

  app.delete("/v1/admin/tenants/:tenantId/agents/:agentId", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "admin:*");
    if (!claims) return;
    const params = request.params as { tenantId: string; agentId: string };
    if (claims.tenantId !== params.tenantId) {
      return await reply.code(403).send({ error: "Forbidden" });
    }
    db.deleteAgent(params.tenantId, params.agentId);
    return { ok: true };
  });

  app.delete("/v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId", async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "admin:*");
    if (!claims) return;
    const params = request.params as WorkspaceParams;
    if (claims.tenantId !== params.tenantId) {
      return await reply.code(403).send({ error: "Forbidden" });
    }
    // Try to delete the workspace files via the connector (best-effort)
    try {
      await registry.invoke({
        tenantId: params.tenantId,
        agentId: params.agentId,
        workspaceId: params.workspaceId,
        operation: "workspace.delete",
        payload: {},
      });
    } catch {
      // Ignore connector errors, still clean the DB
    }
    db.deleteWorkspace(params.tenantId, params.agentId, params.workspaceId);
    return { ok: true };
  });

  app.post("/v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/sessions/clear", async (request, reply) => {
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "admin:*",
      "sessions.delete-all",
    );
    if (!result) return;
    return result;
  });

  app.get("/v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/config", async (request, reply) => {
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "admin:*",
      "admin.config.read",
    );
    if (!result) return;
    return result;
  });

  app.put("/v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/config", async (request, reply) => {
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "admin:*",
      "admin.config.write",
      await readRequestBody(request),
    );
    if (!result) return;
    return result;
  });

  app.get("/v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/workspace-files/:fileName", async (request, reply) => {
    const params = request.params as WorkspaceParams & { fileName: string };
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "admin:*",
      "admin.workspace-file.read",
      { fileName: params.fileName },
      params,
    );
    if (!result) return;
    return result;
  });

  app.put("/v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/workspace-files/:fileName", async (request, reply) => {
    const params = request.params as WorkspaceParams & { fileName: string };
    const body = await readRequestBody(request);
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "admin:*",
      "admin.workspace-file.write",
      { fileName: params.fileName, content: body.content },
      params,
    );
    if (!result) return;
    return result;
  });

  const workspacePrefix = "/v1/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId";
  const projectWorkspacePrefix = "/v1/tenants/:tenantId/projects/:projectId/agents/:agentId";

  app.get(`${workspacePrefix}/activity`, async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "workspace:read");
    if (!claims) return;
    const params = request.params as WorkspaceParams;
    authorizeWorkspace(claims, params);
    return {
      activity: db.listActivity(params.tenantId, params.agentId, params.workspaceId),
    };
  });

  app.get(`${projectWorkspacePrefix}/activity`, async (request, reply) => {
    const access = await requireProjectAssignmentAccess(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      db,
      "workspace:read",
    );
    if (!access) return;
    return {
      activity: db.listActivity(access.params.tenantId, access.params.agentId, access.assignment.workspaceId),
    };
  });

  app.get(`${workspacePrefix}/usage`, async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "workspace:read");
    if (!claims) return;
    const params = request.params as WorkspaceParams;
    authorizeWorkspace(claims, params);
    return {
      usage: db.listUsage(params.tenantId, params.agentId, params.workspaceId),
    };
  });

  app.get(`${projectWorkspacePrefix}/usage`, async (request, reply) => {
    const access = await requireProjectAssignmentAccess(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      db,
      "workspace:read",
    );
    if (!access) return;
    return {
      usage: db.listUsage(access.params.tenantId, access.params.agentId, access.assignment.workspaceId),
    };
  });

  app.get(`${workspacePrefix}/integrations/status`, async (request, reply) => {
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "integrations.status",
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/integrations/status`, async (request, reply) => {
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "integrations.status",
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/sessions`, async (request, reply) => {
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:read",
      "sessions.list",
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/sessions`, async (request, reply) => {
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:read",
      "sessions.list",
    );
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/sessions`, async (request, reply) => {
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.create",
      await readRequestBody(request),
    );
    if (!result) return;
    return result;
  });

  app.post(`${projectWorkspacePrefix}/sessions`, async (request, reply) => {
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.create",
      await readRequestBody(request),
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/sessions:search`, async (request, reply) => {
    const query = request.query as { q?: string; limit?: string };
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:read",
      "sessions.search",
      {
        q: query.q ?? "",
        ...(query.limit ? { limit: Number(query.limit) } : {}),
      },
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/sessions:search`, async (request, reply) => {
    const query = request.query as { q?: string; limit?: string };
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:read",
      "sessions.search",
      {
        q: query.q ?? "",
        ...(query.limit ? { limit: Number(query.limit) } : {}),
      },
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/sessions/:sessionId`, async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:read",
      "sessions.get",
      { sessionId: params.sessionId },
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/sessions/:sessionId`, async (request, reply) => {
    const params = request.params as ProjectAgentParams;
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:read",
      "sessions.get",
      { sessionId: params.sessionId },
    );
    if (!result) return;
    return result;
  });

  app.patch(`${workspacePrefix}/sessions/:sessionId`, async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const body = await readRequestBody(request);
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.update",
      { sessionId: params.sessionId, title: body.title },
    );
    if (!result) return;
    return result;
  });

  app.patch(`${projectWorkspacePrefix}/sessions/:sessionId`, async (request, reply) => {
    const params = request.params as ProjectAgentParams;
    const body = await readRequestBody(request);
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.update",
      { sessionId: params.sessionId, title: body.title },
    );
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/sessions/:sessionId/messages`, async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const body = await readRequestBody(request);
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.append-message",
      { sessionId: params.sessionId, ...body },
    );
    if (!result) return;
    return result;
  });

  app.post(`${projectWorkspacePrefix}/sessions/:sessionId/messages`, async (request, reply) => {
    const params = request.params as ProjectAgentParams;
    const body = await readRequestBody(request);
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.append-message",
      { sessionId: params.sessionId, ...body },
    );
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/sessions/:sessionId/reply`, async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const body = await readRequestBody(request);
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.reply",
      { sessionId: params.sessionId, ...body },
    );
    if (!result) return;
    const inputMessage = typeof body.message === "string" ? body.message : "";
    const replyText = typeof result.reply === "string" ? result.reply : "";
    db.recordUsage({
      tenantId: params.tenantId,
      agentId: params.agentId,
      workspaceId: params.workspaceId,
      tokensIn: tokensFromText(inputMessage),
      tokensOut: tokensFromText(replyText),
    });
    return result;
  });

  app.post(`${projectWorkspacePrefix}/sessions/:sessionId/reply`, async (request, reply) => {
    const params = request.params as ProjectAgentParams;
    const body = await readRequestBody(request);
    const assignment = db.getProjectAssignment(params.tenantId, params.projectId, params.agentId);
    if (!assignment) {
      return await reply.code(404).send({ error: "project_agent_assignment_not_found" });
    }
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.reply",
      { sessionId: params.sessionId, ...body },
    );
    if (!result) return;
    const inputMessage = typeof body.message === "string" ? body.message : "";
    const replyText = typeof result.reply === "string" ? result.reply : "";
    db.recordUsage({
      tenantId: params.tenantId,
      agentId: params.agentId,
      workspaceId: assignment.workspaceId,
      tokensIn: tokensFromText(inputMessage),
      tokensOut: tokensFromText(replyText),
    });
    return result;
  });

  app.get(`${workspacePrefix}/sessions/:sessionId/stream`, async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "chat:stream");
    if (!claims) return;
    const params = request.params as WorkspaceParams;
    try {
      authorizeWorkspace(claims, params);
    } catch (error) {
      await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
      return;
    }
    const query = request.query as { message?: string; systemPrompt?: string; transport?: string };
    reply.hijack();
    reply.raw.statusCode = 200;
    reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("cache-control", "no-cache, no-transform");
    reply.raw.setHeader("connection", "keep-alive");

    let streamedText = "";
    const writeEvent = (event: string, payload: Record<string, unknown>) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      await registry.invoke({
        tenantId: params.tenantId,
        agentId: params.agentId,
        workspaceId: params.workspaceId,
        operation: "sessions.stream",
        payload: {
          sessionId: params.sessionId,
          ...(query.message ? { message: query.message } : {}),
          ...(query.systemPrompt ? { systemPrompt: query.systemPrompt } : {}),
          ...(query.transport ? { transport: query.transport } : {}),
        },
        onStream: (stream) => {
          const payload = stream.payload;
          if (typeof payload.delta === "string") streamedText += payload.delta;
          writeEvent(stream.event, payload);
        },
      });
      db.recordUsage({
        tenantId: params.tenantId,
        agentId: params.agentId,
        workspaceId: params.workspaceId,
        tokensIn: tokensFromText(query.message ?? ""),
        tokensOut: tokensFromText(streamedText),
      });
      writeEvent("complete", { ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeEvent("error", { error: message });
    } finally {
      reply.raw.end();
    }
  });

  app.get(`${projectWorkspacePrefix}/sessions/:sessionId/stream`, async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "chat:stream");
    if (!claims) return;
    const params = request.params as ProjectAgentParams;
    const assignment = db.getProjectAssignment(params.tenantId, params.projectId, params.agentId);
    if (!assignment) {
      return await reply.code(404).send({ error: "project_agent_assignment_not_found" });
    }
    try {
      authorizeWorkspace(claims, assignmentWorkspaceParams(params, assignment.workspaceId));
    } catch (error) {
      await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
      return;
    }
    const query = request.query as { message?: string; systemPrompt?: string; transport?: string };
    reply.hijack();
    reply.raw.statusCode = 200;
    reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("cache-control", "no-cache, no-transform");
    reply.raw.setHeader("connection", "keep-alive");

    let streamedText = "";
    const writeEvent = (event: string, payload: Record<string, unknown>) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      await registry.invoke({
        tenantId: params.tenantId,
        agentId: params.agentId,
        workspaceId: assignment.workspaceId,
        operation: "sessions.stream",
        payload: {
          sessionId: params.sessionId,
          ...(query.message ? { message: query.message } : {}),
          ...(query.systemPrompt ? { systemPrompt: query.systemPrompt } : {}),
          ...(query.transport ? { transport: query.transport } : {}),
        },
        onStream: (stream) => {
          const streamPayload = stream.payload;
          if (typeof streamPayload.delta === "string") streamedText += streamPayload.delta;
          writeEvent(stream.event, streamPayload);
        },
      });
      db.recordUsage({
        tenantId: params.tenantId,
        agentId: params.agentId,
        workspaceId: assignment.workspaceId,
        tokensIn: tokensFromText(query.message ?? ""),
        tokensOut: tokensFromText(streamedText),
      });
      writeEvent("complete", { ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeEvent("error", { error: message });
    } finally {
      reply.raw.end();
    }
  });

  app.post(`${workspacePrefix}/sessions/:sessionId/stream`, async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "chat:stream");
    if (!claims) return;
    const params = request.params as WorkspaceParams;
    try {
      authorizeWorkspace(claims, params);
    } catch (error) {
      await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
      return;
    }
    const body = await readRequestBody(request);
    reply.hijack();
    reply.raw.statusCode = 200;
    reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("cache-control", "no-cache, no-transform");
    reply.raw.setHeader("connection", "keep-alive");

    let streamedText = "";
    const writeEvent = (event: string, payload: Record<string, unknown>) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      await registry.invoke({
        tenantId: params.tenantId,
        agentId: params.agentId,
        workspaceId: params.workspaceId,
        operation: "sessions.stream",
        payload: {
          sessionId: params.sessionId,
          ...(typeof body.message === "string" ? { message: body.message } : {}),
          ...(typeof body.systemPrompt === "string" ? { systemPrompt: body.systemPrompt } : {}),
          ...(typeof body.transport === "string" ? { transport: body.transport } : {}),
          ...(Array.isArray(body.documentIds) ? { documentIds: body.documentIds } : {}),
        },
        onStream: (stream) => {
          const payload = stream.payload;
          if (typeof payload.delta === "string") streamedText += payload.delta;
          writeEvent(stream.event, payload);
        },
      });
      db.recordUsage({
        tenantId: params.tenantId,
        agentId: params.agentId,
        workspaceId: params.workspaceId,
        tokensIn: tokensFromText(typeof body.message === "string" ? body.message : ""),
        tokensOut: tokensFromText(streamedText),
      });
      writeEvent("complete", { ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeEvent("error", { error: message });
    } finally {
      reply.raw.end();
    }
  });

  app.post(`${projectWorkspacePrefix}/sessions/:sessionId/stream`, async (request, reply) => {
    const claims = await requireClaims(request, reply, auth, "chat:stream");
    if (!claims) return;
    const params = request.params as ProjectAgentParams;
    const assignment = db.getProjectAssignment(params.tenantId, params.projectId, params.agentId);
    if (!assignment) {
      return await reply.code(404).send({ error: "project_agent_assignment_not_found" });
    }
    try {
      authorizeWorkspace(claims, assignmentWorkspaceParams(params, assignment.workspaceId));
    } catch (error) {
      await reply.code(403).send({ error: "Forbidden", message: error instanceof Error ? error.message : String(error) });
      return;
    }
    const body = await readRequestBody(request);
    reply.hijack();
    reply.raw.statusCode = 200;
    reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("cache-control", "no-cache, no-transform");
    reply.raw.setHeader("connection", "keep-alive");

    let streamedText = "";
    const writeEvent = (event: string, payload: Record<string, unknown>) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      await registry.invoke({
        tenantId: params.tenantId,
        agentId: params.agentId,
        workspaceId: assignment.workspaceId,
        operation: "sessions.stream",
        payload: {
          sessionId: params.sessionId,
          ...(typeof body.message === "string" ? { message: body.message } : {}),
          ...(typeof body.systemPrompt === "string" ? { systemPrompt: body.systemPrompt } : {}),
          ...(typeof body.transport === "string" ? { transport: body.transport } : {}),
          ...(Array.isArray(body.documentIds) ? { documentIds: body.documentIds } : {}),
        },
        onStream: (stream) => {
          const payload = stream.payload;
          if (typeof payload.delta === "string") streamedText += payload.delta;
          writeEvent(stream.event, payload);
        },
      });
      db.recordUsage({
        tenantId: params.tenantId,
        agentId: params.agentId,
        workspaceId: assignment.workspaceId,
        tokensIn: tokensFromText(typeof body.message === "string" ? body.message : ""),
        tokensOut: tokensFromText(streamedText),
      });
      writeEvent("complete", { ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeEvent("error", { error: message });
    } finally {
      reply.raw.end();
    }
  });

  app.post(`${workspacePrefix}/sessions/:sessionId/generate-title`, async (request, reply) => {
    const params = request.params as WorkspaceParams;
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.generate-title",
      { sessionId: params.sessionId },
    );
    if (!result) return;
    return result;
  });

  app.post(`${projectWorkspacePrefix}/sessions/:sessionId/generate-title`, async (request, reply) => {
    const params = request.params as ProjectAgentParams;
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "sessions.generate-title",
      { sessionId: params.sessionId },
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/documents`, async (request, reply) => {
    const query = request.query as { sessionId?: string };
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.list",
      {
        ...(typeof query.sessionId === "string" ? { sessionId: query.sessionId } : {}),
      },
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/documents`, async (request, reply) => {
    const query = request.query as { sessionId?: string };
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.list",
      {
        ...(typeof query.sessionId === "string" ? { sessionId: query.sessionId } : {}),
      },
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/documents:search`, async (request, reply) => {
    const query = request.query as { q?: string; limit?: string; sessionId?: string };
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.search",
      {
        q: query.q ?? "",
        ...(query.limit ? { limit: Number(query.limit) } : {}),
        ...(typeof query.sessionId === "string" ? { sessionId: query.sessionId } : {}),
      },
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/documents:search`, async (request, reply) => {
    const query = request.query as { q?: string; limit?: string; sessionId?: string };
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.search",
      {
        q: query.q ?? "",
        ...(query.limit ? { limit: Number(query.limit) } : {}),
        ...(typeof query.sessionId === "string" ? { sessionId: query.sessionId } : {}),
      },
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/documents/:documentId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { documentId: string };
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.get",
      { documentId: params.documentId },
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/documents/:documentId`, async (request, reply) => {
    const params = request.params as ProjectAgentParams & { documentId: string };
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.get",
      { documentId: params.documentId },
    );
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/documents/register`, async (request, reply) => {
    const body = await readRequestBody(request);
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.register",
      body,
    );
    if (!result) return;
    return result;
  });

  app.post(`${projectWorkspacePrefix}/documents/register`, async (request, reply) => {
    const body = await readRequestBody(request);
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.register",
      body,
    );
    if (!result) return;
    return result;
  });

  app.post(`${workspacePrefix}/documents/upload`, async (request, reply) => {
    const body = await readRequestBody(request);
    const begin = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.upload.begin",
      {
        name: body.name,
        mimeType: body.mimeType,
        ...(typeof body.origin === "string" ? { origin: body.origin } : {}),
        ...(typeof body.sessionId === "string" ? { sessionId: body.sessionId } : {}),
      },
    );
    if (!begin) return;
    const uploadId = typeof begin.uploadId === "string" ? begin.uploadId : "";
    const chunk = normalizeUploadData(body.data);
    const chunkResult = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.upload.chunk",
      { uploadId, chunk },
    );
    if (!chunkResult) return;
    const commit = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.upload.commit",
      { uploadId },
    );
    if (!commit) return;
    return commit;
  });

  app.post(`${projectWorkspacePrefix}/documents/upload`, async (request, reply) => {
    const body = await readRequestBody(request);
    const begin = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.upload.begin",
      {
        name: body.name,
        mimeType: body.mimeType,
        ...(typeof body.origin === "string" ? { origin: body.origin } : {}),
        ...(typeof body.sessionId === "string" ? { sessionId: body.sessionId } : {}),
      },
    );
    if (!begin) return;
    const uploadId = typeof begin.uploadId === "string" ? begin.uploadId : "";
    const chunk = normalizeUploadData(body.data);
    const chunkResult = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.upload.chunk",
      { uploadId, chunk },
    );
    if (!chunkResult) return;
    const commit = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.upload.commit",
      { uploadId },
    );
    if (!commit) return;
    return commit;
  });

  app.get(`${workspacePrefix}/documents/:documentId/download`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { documentId: string };
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.download",
      { documentId: params.documentId },
    );
    if (!result) return;
    const document = (result.document ?? null) as { name?: string; mimeType?: string } | null;
    const contentBase64 = typeof result.contentBase64 === "string" ? result.contentBase64 : "";
    if (!document || !contentBase64) {
      return await reply.code(404).send({ error: "document_not_found" });
    }
    reply.header("content-type", document.mimeType ?? "application/octet-stream");
    reply.header("content-disposition", `attachment; filename="${document.name ?? params.documentId}"`);
    return Buffer.from(contentBase64, "base64");
  });

  app.get(`${projectWorkspacePrefix}/documents/:documentId/download`, async (request, reply) => {
    const params = request.params as ProjectAgentParams & { documentId: string };
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "documents.download",
      { documentId: params.documentId },
    );
    if (!result) return;
    const document = (result.document ?? null) as { name?: string; mimeType?: string } | null;
    const contentBase64 = typeof result.contentBase64 === "string" ? result.contentBase64 : "";
    if (!document || !contentBase64) {
      return await reply.code(404).send({ error: "document_not_found" });
    }
    reply.header("content-type", document.mimeType ?? "application/octet-stream");
    reply.header("content-disposition", `attachment; filename="${document.name ?? params.documentId}"`);
    return Buffer.from(contentBase64, "base64");
  });

  app.post(`${workspacePrefix}/chat/feedback`, async (request, reply) => {
    const body = await readRequestBody(request);
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "chat.feedback",
      body,
    );
    if (!result) return;
    return result;
  });

  app.post(`${projectWorkspacePrefix}/chat/feedback`, async (request, reply) => {
    const body = await readRequestBody(request);
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "chat:write",
      "chat.feedback",
      body,
    );
    if (!result) return;
    return result;
  });

  const resourceMap = [
    { path: "tasks", scope: "workspace:data" },
    { path: "notes", scope: "workspace:data" },
    { path: "memory", scope: "workspace:data" },
    { path: "inbox", scope: "workspace:data" },
    { path: "people", scope: "workspace:data" },
    { path: "events", scope: "workspace:data" },
    { path: "personas", scope: "workspace:data" },
    { path: "plugins", scope: "workspace:data" },
    { path: "routines", scope: "workspace:data" },
    { path: "images", scope: "workspace:data" },
  ] as const;

  for (const resource of resourceMap) {
    app.get(`${workspacePrefix}/${resource.path}`, async (request, reply) => {
      const query = request.query as Record<string, unknown>;
      const result = await invokeWorkspace(
        request as FastifyRequest<{ Params: WorkspaceParams }>,
        reply,
        auth,
        registry,
        db,
        resource.scope,
        `${resource.path}.list`,
        query,
      );
      if (!result) return;
      return result;
    });

    app.get(`${projectWorkspacePrefix}/${resource.path}`, async (request, reply) => {
      const query = request.query as Record<string, unknown>;
      const result = await invokeProjectAssignment(
        request as FastifyRequest<{ Params: ProjectAgentParams }>,
        reply,
        auth,
        registry,
        db,
        resource.scope,
        `${resource.path}.list`,
        query,
      );
      if (!result) return;
      return result;
    });

    app.post(`${workspacePrefix}/${resource.path}`, async (request, reply) => {
      const result = await invokeWorkspace(
        request as FastifyRequest<{ Params: WorkspaceParams }>,
        reply,
        auth,
        registry,
        db,
        resource.scope,
        `${resource.path}.create`,
        await readRequestBody(request),
      );
      if (!result) return;
      return result;
    });

    app.post(`${projectWorkspacePrefix}/${resource.path}`, async (request, reply) => {
      const result = await invokeProjectAssignment(
        request as FastifyRequest<{ Params: ProjectAgentParams }>,
        reply,
        auth,
        registry,
        db,
        resource.scope,
        `${resource.path}.create`,
        await readRequestBody(request),
      );
      if (!result) return;
      return result;
    });

    app.put(`${workspacePrefix}/${resource.path}`, async (request, reply) => {
      const result = await invokeWorkspace(
        request as FastifyRequest<{ Params: WorkspaceParams }>,
        reply,
        auth,
        registry,
        db,
        resource.scope,
        `${resource.path}.update`,
        await readRequestBody(request),
      );
      if (!result) return;
      return result;
    });

    app.put(`${projectWorkspacePrefix}/${resource.path}`, async (request, reply) => {
      const result = await invokeProjectAssignment(
        request as FastifyRequest<{ Params: ProjectAgentParams }>,
        reply,
        auth,
        registry,
        db,
        resource.scope,
        `${resource.path}.update`,
        await readRequestBody(request),
      );
      if (!result) return;
      return result;
    });

    app.delete(`${workspacePrefix}/${resource.path}`, async (request, reply) => {
      const body = await readRequestBody(request);
      const query = request.query as Record<string, unknown>;
      const payload = Object.keys(body).length > 0 ? body : query;
      const result = await invokeWorkspace(
        request as FastifyRequest<{ Params: WorkspaceParams }>,
        reply,
        auth,
        registry,
        db,
        resource.scope,
        `${resource.path}.delete`,
        payload,
      );
      if (!result) return;
      return result;
    });

    app.delete(`${projectWorkspacePrefix}/${resource.path}`, async (request, reply) => {
      const body = await readRequestBody(request);
      const query = request.query as Record<string, unknown>;
      const payload = Object.keys(body).length > 0 ? body : query;
      const result = await invokeProjectAssignment(
        request as FastifyRequest<{ Params: ProjectAgentParams }>,
        reply,
        auth,
        registry,
        db,
        resource.scope,
        `${resource.path}.delete`,
        payload,
      );
      if (!result) return;
      return result;
    });
  }

  app.get(`${workspacePrefix}/images/:imageId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { imageId: string };
    const result = await invokeWorkspace(
      { ...request, params } as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "images.get",
      { imageId: params.imageId },
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/images/:imageId`, async (request, reply) => {
    const params = request.params as ProjectAgentParams & { imageId: string };
    const result = await invokeProjectAssignment(
      { ...request, params } as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "images.get",
      { imageId: params.imageId },
      params,
    );
    if (!result) return;
    return result;
  });

  app.delete(`${workspacePrefix}/images/:imageId`, async (request, reply) => {
    const params = request.params as WorkspaceParams & { imageId: string };
    const result = await invokeWorkspace(
      { ...request, params } as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "images.delete",
      { imageId: params.imageId },
    );
    if (!result) return;
    return result;
  });

  app.delete(`${projectWorkspacePrefix}/images/:imageId`, async (request, reply) => {
    const params = request.params as ProjectAgentParams & { imageId: string };
    const result = await invokeProjectAssignment(
      { ...request, params } as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:data",
      "images.delete",
      { imageId: params.imageId },
      params,
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/skills/list`, async (request, reply) => {
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "skills.list",
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/skills/list`, async (request, reply) => {
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "skills.list",
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/skills/search`, async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "skills.search",
      query,
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/skills/search`, async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "skills.search",
      query,
    );
    if (!result) return;
    return result;
  });

  app.get(`${workspacePrefix}/skills/sources`, async (request, reply) => {
    const result = await invokeWorkspace(
      request as FastifyRequest<{ Params: WorkspaceParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "skills.sources",
    );
    if (!result) return;
    return result;
  });

  app.get(`${projectWorkspacePrefix}/skills/sources`, async (request, reply) => {
    const result = await invokeProjectAssignment(
      request as FastifyRequest<{ Params: ProjectAgentParams }>,
      reply,
      auth,
      registry,
      db,
      "workspace:read",
      "skills.sources",
    );
    if (!result) return;
    return result;
  });

  // --- Static frontend serving ---
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const publicDir = path.resolve(__dirname, "../../public");
  await app.register(fastifyStatic, {
    root: publicDir,
    prefix: "/",
    wildcard: false,
  });

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/v1/")) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.sendFile("index.html");
  });

  return { app, db, auth, registry, logger, config };
}
