import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { applyTextMutation, createClaw } from "@clawjs/claw";
import { extendClawWithWorkspace } from "@clawjs/workspace";

import { WorkspaceCompatStore } from "./compat-store.ts";

export interface RelayConnectorOptions {
  relayUrl: string;
  enrollmentToken: string;
  agentId: string;
  workspaceRoot: string;
  runtimeAdapter: string;
}

interface RuntimeContext {
  claw: Awaited<ReturnType<typeof createClaw>>;
  workspaceClaw: Awaited<ReturnType<typeof extendClawWithWorkspace>>;
  workspaceDir: string;
  compat: WorkspaceCompatStore;
  metadata: WorkspaceMaterialization;
}

interface WorkspaceMaterialization {
  workspaceId: string;
  displayName: string;
  workspaceDir: string;
  logicalAgentId: string;
  runtimeAgentId: string;
  materializationVersion: number;
  projectId?: string;
  legacy?: boolean;
}

const DEFAULT_PERSONAS = [
  {
    id: "assistant",
    name: "Assistant",
    avatar: "bot",
    role: "General Purpose",
    systemPrompt: "You are a helpful assistant.",
    skills: ["conversation"],
    channels: ["Chat"],
    isDefault: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

const DEFAULT_PLUGINS = [
  {
    id: "clawjs-tools",
    name: "clawjs-tools",
    version: "0.1.0",
    description: "Relay compatibility plugin catalog.",
    status: "active",
    config: {},
    installedAt: Date.now(),
    lastActivity: Date.now(),
  },
];

function toTimestamp(value: string | number | undefined): number {
  if (!value) return Date.now();
  if (typeof value === "number") return value;
  return new Date(value).getTime() || Date.now();
}

function sanitizePathSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "default";
}

function getLegacyWorkspaceDir(root: string, workspaceId: string): string {
  return path.join(root, workspaceId);
}

function getProjectBaseDir(root: string, projectId: string): string {
  return path.join(root, "projects", sanitizePathSegment(projectId), "base");
}

function getAgentTemplateDir(root: string, agentId: string): string {
  return path.join(root, "agents", sanitizePathSegment(agentId), "template");
}

function getMaterializedWorkspaceDir(root: string, projectId: string, agentId: string): string {
  return path.join(root, "materialized", sanitizePathSegment(projectId), sanitizePathSegment(agentId));
}

function getAssignmentRegistryDir(root: string): string {
  return path.join(root, ".relay", "assignments");
}

function getAssignmentRegistryPath(root: string, workspaceId: string): string {
  return path.join(getAssignmentRegistryDir(root), `${workspaceId}.json`);
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function renderRefsSection(
  title: string,
  refs: Array<{ id: string; label?: string; mode?: string; uri?: string; secretName?: string }>,
): string {
  return [
    `## ${title}`,
    "",
    ...(
      refs.length > 0
        ? refs.map((ref) => {
            const label = ref.label ?? ref.id;
            const target = ref.uri ?? ref.secretName ?? ref.id;
            const mode = ref.mode ?? "allow";
            return `- ${label}: ${target} (${mode})`;
          })
        : ["- none"]
    ),
  ].join("\n");
}

function upsertManagedBlocks(filePath: string, title: string, blocks: Array<{ blockId: string; content: string }>): void {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : `${title}\n\n`;
  let next = existing;
  for (const block of blocks) {
    next = applyTextMutation({
      originalContent: next,
      mode: "managed_block",
      blockId: block.blockId,
      content: block.content,
    });
  }
  fs.writeFileSync(filePath, next.endsWith("\n") ? next : `${next}\n`);
}

export class RelayConnectorRuntime {
  private readonly contexts = new Map<string, Promise<RuntimeContext>>();

  constructor(private readonly options: RelayConnectorOptions) {}

  listWorkspaces(): Array<{ workspaceId: string; displayName: string }> {
    ensureDir(this.options.workspaceRoot);
    const workspaces = new Map<string, { workspaceId: string; displayName: string }>();

    const registryDir = getAssignmentRegistryDir(this.options.workspaceRoot);
    if (fs.existsSync(registryDir)) {
      for (const entry of fs.readdirSync(registryDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const metadata = readJsonFile<WorkspaceMaterialization>(path.join(registryDir, entry.name));
        if (!metadata) continue;
        workspaces.set(metadata.workspaceId, {
          workspaceId: metadata.workspaceId,
          displayName: metadata.displayName,
        });
      }
    }

    const reserved = new Set([".relay", "projects", "agents", "materialized"]);
    for (const entry of fs.readdirSync(this.options.workspaceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || reserved.has(entry.name)) continue;
      if (!workspaces.has(entry.name)) {
        workspaces.set(entry.name, {
          workspaceId: entry.name,
          displayName: entry.name,
        });
      }
    }

    return [...workspaces.values()].sort((left, right) => left.workspaceId.localeCompare(right.workspaceId));
  }

  async getContext(workspaceId: string): Promise<RuntimeContext> {
    if (!this.contexts.has(workspaceId)) {
      this.contexts.set(workspaceId, this.createContext(workspaceId));
    }
    return await this.contexts.get(workspaceId)!;
  }

  private async createContext(workspaceId: string): Promise<RuntimeContext> {
    const metadata = this.resolveWorkspaceMaterialization(workspaceId);
    ensureDir(metadata.workspaceDir);

    const claw = await createClaw({
      runtime: {
        adapter: this.options.runtimeAdapter as "openclaw",
        ...(this.options.runtimeAdapter === "openclaw"
          ? {
              homeDir: process.env.OPENCLAW_STATE_DIR,
              configPath: process.env.OPENCLAW_CONFIG_PATH,
              agentDir: process.env.OPENCLAW_AGENT_DIR,
              env: process.env,
            }
          : {}),
      },
      workspace: {
        appId: "relay",
        workspaceId,
        agentId: metadata.logicalAgentId,
        logicalAgentId: metadata.logicalAgentId,
        runtimeAgentId: metadata.runtimeAgentId,
        ...(metadata.projectId ? { projectId: metadata.projectId } : {}),
        materializationVersion: metadata.materializationVersion,
        rootDir: metadata.workspaceDir,
      },
    });
    await claw.workspace.init();
    const workspaceClaw = await extendClawWithWorkspace(claw, { workspaceDir: metadata.workspaceDir });
    return {
      claw,
      workspaceClaw,
      workspaceDir: metadata.workspaceDir,
      compat: new WorkspaceCompatStore(metadata.workspaceDir),
      metadata,
    };
  }

  private resolveWorkspaceMaterialization(workspaceId: string): WorkspaceMaterialization {
    const registryPath = getAssignmentRegistryPath(this.options.workspaceRoot, workspaceId);
    const registered = readJsonFile<WorkspaceMaterialization>(registryPath);
    if (registered) {
      return registered;
    }
    return {
      workspaceId,
      displayName: workspaceId,
      workspaceDir: getLegacyWorkspaceDir(this.options.workspaceRoot, workspaceId),
      logicalAgentId: this.options.agentId,
      runtimeAgentId: this.options.agentId,
      materializationVersion: 1,
      legacy: true,
    };
  }

  private materializeWorkspace(workspaceId: string, payload: Record<string, unknown> | undefined): WorkspaceMaterialization {
    const projectId = typeof payload?.projectId === "string" && payload.projectId.trim() ? payload.projectId.trim() : undefined;
    const logicalAgentId = typeof payload?.logicalAgentId === "string" && payload.logicalAgentId.trim()
      ? payload.logicalAgentId.trim()
      : this.options.agentId;
    const runtimeAgentId = typeof payload?.runtimeAgentId === "string" && payload.runtimeAgentId.trim()
      ? payload.runtimeAgentId.trim()
      : logicalAgentId;
    const materializationVersion = typeof payload?.materializationVersion === "number" ? payload.materializationVersion : 1;

    if (!projectId) {
      const legacyDir = getLegacyWorkspaceDir(this.options.workspaceRoot, workspaceId);
      ensureDir(legacyDir);
      return {
        workspaceId,
        displayName: typeof payload?.displayName === "string" ? payload.displayName : workspaceId,
        workspaceDir: legacyDir,
        logicalAgentId,
        runtimeAgentId,
        materializationVersion,
        legacy: true,
      };
    }

    const projectDir = getProjectBaseDir(this.options.workspaceRoot, projectId);
    const agentTemplateDir = getAgentTemplateDir(this.options.workspaceRoot, logicalAgentId);
    const workspaceDir = getMaterializedWorkspaceDir(this.options.workspaceRoot, projectId, logicalAgentId);
    ensureDir(projectDir);
    ensureDir(agentTemplateDir);
    ensureDir(workspaceDir);

    const projectDisplayName = typeof payload?.projectDisplayName === "string" ? payload.projectDisplayName : projectId;
    const projectDescription = typeof payload?.projectDescription === "string" ? payload.projectDescription : "";
    const projectInstructions = typeof payload?.projectInstructions === "string" ? payload.projectInstructions : "";
    const agentDisplayName = typeof payload?.logicalAgentDisplayName === "string" ? payload.logicalAgentDisplayName : logicalAgentId;
    const agentRole = typeof payload?.logicalAgentRole === "string" ? payload.logicalAgentRole : "";
    const agentDescription = typeof payload?.logicalAgentDescription === "string" ? payload.logicalAgentDescription : "";
    const agentInstructions = typeof payload?.agentInstructions === "string" ? payload.agentInstructions : "";
    const assignmentDisplayName = typeof payload?.assignmentDisplayName === "string" ? payload.assignmentDisplayName : `${projectDisplayName} / ${agentDisplayName}`;
    const assignmentInstructions = typeof payload?.assignmentInstructions === "string" ? payload.assignmentInstructions : "";
    const projectResourceRefs = Array.isArray(payload?.projectResourceRefs) ? payload.projectResourceRefs as Array<Record<string, unknown>> : [];
    const projectSecretRefs = Array.isArray(payload?.projectSecretRefs) ? payload.projectSecretRefs as Array<Record<string, unknown>> : [];
    const agentResourceRefs = Array.isArray(payload?.agentResourceRefs) ? payload.agentResourceRefs as Array<Record<string, unknown>> : [];
    const agentSecretRefs = Array.isArray(payload?.agentSecretRefs) ? payload.agentSecretRefs as Array<Record<string, unknown>> : [];
    const assignmentResourceRefs = Array.isArray(payload?.assignmentResourceRefs) ? payload.assignmentResourceRefs as Array<Record<string, unknown>> : [];
    const assignmentSecretRefs = Array.isArray(payload?.assignmentSecretRefs) ? payload.assignmentSecretRefs as Array<Record<string, unknown>> : [];

    upsertManagedBlocks(path.join(projectDir, "SOUL.md"), "# Project Base", [{
      blockId: "project-context",
      content: [
        `# Project: ${projectDisplayName}`,
        "",
        ...(projectDescription ? [projectDescription, ""] : []),
        ...(projectInstructions ? ["## Instructions", "", projectInstructions] : []),
      ].join("\n").trim(),
    }]);
    upsertManagedBlocks(path.join(projectDir, "TOOLS.md"), "# Project Access", [{
      blockId: "project-access",
      content: [
        renderRefsSection("Resources", projectResourceRefs.map((ref) => ({
          id: String(ref.id ?? ""),
          label: typeof ref.label === "string" ? ref.label : undefined,
          uri: typeof ref.uri === "string" ? ref.uri : undefined,
          mode: typeof ref.mode === "string" ? ref.mode : undefined,
        }))),
        "",
        renderRefsSection("Secrets", projectSecretRefs.map((ref) => ({
          id: String(ref.id ?? ""),
          label: typeof ref.label === "string" ? ref.label : undefined,
          secretName: typeof ref.secretName === "string" ? ref.secretName : undefined,
          mode: typeof ref.mode === "string" ? ref.mode : undefined,
        }))),
      ].join("\n"),
    }]);

    upsertManagedBlocks(path.join(agentTemplateDir, "AGENTS.md"), "# Agent Template", [{
      blockId: "agent-context",
      content: [
        `# Agent: ${agentDisplayName}`,
        "",
        ...(agentRole ? [`Role: ${agentRole}`, ""] : []),
        ...(agentDescription ? [agentDescription, ""] : []),
        ...(agentInstructions ? ["## Instructions", "", agentInstructions] : []),
      ].join("\n").trim(),
    }]);
    upsertManagedBlocks(path.join(agentTemplateDir, "TOOLS.md"), "# Agent Access", [{
      blockId: "agent-access",
      content: [
        renderRefsSection("Resources", agentResourceRefs.map((ref) => ({
          id: String(ref.id ?? ""),
          label: typeof ref.label === "string" ? ref.label : undefined,
          uri: typeof ref.uri === "string" ? ref.uri : undefined,
          mode: typeof ref.mode === "string" ? ref.mode : undefined,
        }))),
        "",
        renderRefsSection("Secrets", agentSecretRefs.map((ref) => ({
          id: String(ref.id ?? ""),
          label: typeof ref.label === "string" ? ref.label : undefined,
          secretName: typeof ref.secretName === "string" ? ref.secretName : undefined,
          mode: typeof ref.mode === "string" ? ref.mode : undefined,
        }))),
      ].join("\n"),
    }]);

    upsertManagedBlocks(path.join(workspaceDir, "SOUL.md"), "# Materialized Workspace", [
      {
        blockId: "project-context",
        content: [
          `# Project: ${projectDisplayName}`,
          "",
          ...(projectDescription ? [projectDescription, ""] : []),
          ...(projectInstructions ? ["## Project Instructions", "", projectInstructions] : []),
        ].join("\n").trim(),
      },
      {
        blockId: "agent-context",
        content: [
          `# Agent: ${agentDisplayName}`,
          "",
          ...(agentRole ? [`Role: ${agentRole}`, ""] : []),
          ...(agentDescription ? [agentDescription, ""] : []),
        ].join("\n").trim(),
      },
      {
        blockId: "assignment-context",
        content: [
          `# Assignment: ${assignmentDisplayName}`,
          "",
          `- projectId: ${projectId}`,
          `- logicalAgentId: ${logicalAgentId}`,
          `- runtimeAgentId: ${runtimeAgentId}`,
          `- workspaceId: ${workspaceId}`,
          `- materializationVersion: ${materializationVersion}`,
        ].join("\n"),
      },
    ]);

    upsertManagedBlocks(path.join(workspaceDir, "AGENTS.md"), "# Materialized Instructions", [
      {
        blockId: "project-context",
        content: projectInstructions || "Project instructions are not defined.",
      },
      {
        blockId: "agent-context",
        content: agentInstructions || "Agent instructions are not defined.",
      },
      {
        blockId: "assignment-context",
        content: assignmentInstructions || "Assignment overrides are not defined.",
      },
    ]);

    upsertManagedBlocks(path.join(workspaceDir, "TOOLS.md"), "# Materialized Access", [
      {
        blockId: "project-access",
        content: [
          renderRefsSection("Project Resources", projectResourceRefs.map((ref) => ({
            id: String(ref.id ?? ""),
            label: typeof ref.label === "string" ? ref.label : undefined,
            uri: typeof ref.uri === "string" ? ref.uri : undefined,
            mode: typeof ref.mode === "string" ? ref.mode : undefined,
          }))),
          "",
          renderRefsSection("Project Secrets", projectSecretRefs.map((ref) => ({
            id: String(ref.id ?? ""),
            label: typeof ref.label === "string" ? ref.label : undefined,
            secretName: typeof ref.secretName === "string" ? ref.secretName : undefined,
            mode: typeof ref.mode === "string" ? ref.mode : undefined,
          }))),
        ].join("\n"),
      },
      {
        blockId: "agent-access",
        content: [
          renderRefsSection("Agent Resources", agentResourceRefs.map((ref) => ({
            id: String(ref.id ?? ""),
            label: typeof ref.label === "string" ? ref.label : undefined,
            uri: typeof ref.uri === "string" ? ref.uri : undefined,
            mode: typeof ref.mode === "string" ? ref.mode : undefined,
          }))),
          "",
          renderRefsSection("Agent Secrets", agentSecretRefs.map((ref) => ({
            id: String(ref.id ?? ""),
            label: typeof ref.label === "string" ? ref.label : undefined,
            secretName: typeof ref.secretName === "string" ? ref.secretName : undefined,
            mode: typeof ref.mode === "string" ? ref.mode : undefined,
          }))),
        ].join("\n"),
      },
      {
        blockId: "assignment-access",
        content: [
          renderRefsSection("Assignment Resources", assignmentResourceRefs.map((ref) => ({
            id: String(ref.id ?? ""),
            label: typeof ref.label === "string" ? ref.label : undefined,
            uri: typeof ref.uri === "string" ? ref.uri : undefined,
            mode: typeof ref.mode === "string" ? ref.mode : undefined,
          }))),
          "",
          renderRefsSection("Assignment Secrets", assignmentSecretRefs.map((ref) => ({
            id: String(ref.id ?? ""),
            label: typeof ref.label === "string" ? ref.label : undefined,
            secretName: typeof ref.secretName === "string" ? ref.secretName : undefined,
            mode: typeof ref.mode === "string" ? ref.mode : undefined,
          }))),
        ].join("\n"),
      },
    ]);

    const metadata: WorkspaceMaterialization = {
      workspaceId,
      displayName: assignmentDisplayName,
      workspaceDir,
      projectId,
      logicalAgentId,
      runtimeAgentId,
      materializationVersion,
    };
    writeJsonFile(getAssignmentRegistryPath(this.options.workspaceRoot, workspaceId), metadata);
    writeJsonFile(path.join(workspaceDir, ".relay-assignment.json"), metadata);
    return metadata;
  }

  async execute(
    operation: string,
    workspaceId: string | undefined,
    payload: Record<string, unknown> | undefined,
    emitStream: (event: string, payload: Record<string, unknown>) => void,
  ): Promise<Record<string, unknown>> {
    const targetWorkspaceId = workspaceId ?? "main";
    if (operation === "admin.workspace.create") {
      const metadata = this.materializeWorkspace(targetWorkspaceId, payload);
      this.contexts.delete(targetWorkspaceId);
      const created = await this.getContext(targetWorkspaceId);
      return {
        ok: true,
        workspaceId: targetWorkspaceId,
        displayName: metadata.displayName,
        workspaceDir: created.workspaceDir,
        runtimeAgentId: metadata.runtimeAgentId,
        logicalAgentId: metadata.logicalAgentId,
        ...(metadata.projectId ? { projectId: metadata.projectId } : {}),
      };
    }

    const { claw, workspaceClaw, compat } = await this.getContext(targetWorkspaceId);
    const compatRead = <T>(name: string, fallback: T[] = []) => compat.readCollection<T>(name, fallback);
    const compatWrite = <T>(name: string, entries: T[]) => compat.writeCollection(name, entries);

    switch (operation) {
      case "workspace.status": {
        const runtime = await claw.runtime.status();
        const manifest = await claw.workspace.attach();
        return {
          status: {
            workspaceId: targetWorkspaceId,
            projectId: manifest?.projectId,
            logicalAgentId: manifest?.logicalAgentId,
            runtimeAgentId: manifest?.runtimeAgentId,
            runtime,
            online: true,
          },
        };
      }
      case "integrations.status": {
        const runtime = await claw.runtime.status();
        const channels = await claw.channels.list().catch(() => []);
        return { integrations: { runtime, channels } };
      }
      case "sessions.list":
        return { sessions: claw.conversations.listSessions() };
      case "sessions.create": {
        const title = typeof payload?.title === "string" ? payload.title : undefined;
        const message = typeof payload?.message === "string" ? payload.message : undefined;
        const session = claw.conversations.createSession(title);
        if (message) {
          claw.conversations.appendMessage(session.sessionId, { role: "user", content: message });
        }
        return { session: claw.conversations.getSession(session.sessionId) };
      }
      case "sessions.get": {
        const sessionId = String(payload?.sessionId ?? "");
        return { session: claw.conversations.getSession(sessionId) };
      }
      case "sessions.update": {
        const sessionId = String(payload?.sessionId ?? "");
        const title = String(payload?.title ?? "");
        const updated = claw.conversations.updateSessionTitle(sessionId, title);
        return { ok: !!updated, title };
      }
      case "sessions.search": {
        const query = String(payload?.q ?? "");
        const limit = typeof payload?.limit === "number" ? payload.limit : undefined;
        const sessions = await claw.conversations.searchSessions({ query, limit });
        return { sessions };
      }
      case "sessions.append-message": {
        const sessionId = String(payload?.sessionId ?? "");
        const role = payload?.role === "assistant" ? "assistant" : "user";
        const content = String(payload?.content ?? "");
        const session = claw.conversations.appendMessage(sessionId, { role, content });
        return { session };
      }
      case "sessions.generate-title": {
        const sessionId = String(payload?.sessionId ?? "");
        const title = await claw.conversations.generateTitle({ sessionId, transport: "auto" });
        return { title };
      }
      case "sessions.reply": {
        const sessionId = String(payload?.sessionId ?? "");
        const message = typeof payload?.message === "string" ? payload.message : undefined;
        if (message) {
          claw.conversations.appendMessage(sessionId, { role: "user", content: message });
        }
        let reply = "";
        for await (const chunk of claw.conversations.streamAssistantReply({
          sessionId,
          ...(typeof payload?.systemPrompt === "string" ? { systemPrompt: payload.systemPrompt } : {}),
          ...(typeof payload?.transport === "string" ? { transport: payload.transport as "auto" | "cli" | "gateway" } : {}),
        })) {
          if (!chunk.done) reply += chunk.delta;
        }
        return {
          reply: reply.trim(),
          session: claw.conversations.getSession(sessionId),
        };
      }
      case "sessions.stream": {
        const sessionId = String(payload?.sessionId ?? "");
        const message = typeof payload?.message === "string" ? payload.message : undefined;
        if (message) {
          claw.conversations.appendMessage(sessionId, { role: "user", content: message });
        }
        for await (const event of claw.conversations.streamAssistantReplyEvents({
          sessionId,
          ...(typeof payload?.systemPrompt === "string" ? { systemPrompt: payload.systemPrompt } : {}),
          ...(typeof payload?.transport === "string" ? { transport: payload.transport as "auto" | "cli" | "gateway" } : {}),
        })) {
          emitStream(
            event.type,
            event.type === "error"
              ? { ...event, error: event.error.message }
              : event as unknown as Record<string, unknown>,
          );
        }
        return {
          ok: true,
          session: claw.conversations.getSession(sessionId),
        };
      }
      case "sessions.delete-all": {
        const metadata = this.resolveWorkspaceMaterialization(targetWorkspaceId);
        const conversationsDir = path.join(metadata.workspaceDir, ".clawjs", "conversations");
        let deleted = 0;
        if (fs.existsSync(conversationsDir)) {
          for (const entry of fs.readdirSync(conversationsDir)) {
            try {
              fs.rmSync(path.join(conversationsDir, entry), { recursive: true, force: true });
              deleted += 1;
            } catch {}
          }
        }
        this.contexts.delete(targetWorkspaceId);
        return { ok: true, deleted };
      }
      case "workspace.delete": {
        const metadata = this.resolveWorkspaceMaterialization(targetWorkspaceId);
        this.contexts.delete(targetWorkspaceId);
        if (fs.existsSync(metadata.workspaceDir)) {
          fs.rmSync(metadata.workspaceDir, { recursive: true, force: true });
        }
        const registryPath = getAssignmentRegistryPath(this.options.workspaceRoot, targetWorkspaceId);
        if (fs.existsSync(registryPath)) fs.rmSync(registryPath, { force: true });
        return { ok: true, workspaceId: targetWorkspaceId };
      }
      case "chat.feedback":
        return { ok: true };
      case "tasks.list":
        return { tasks: await workspaceClaw.tasks.list() };
      case "tasks.create":
        return { task: await workspaceClaw.tasks.create(payload as Record<string, unknown>) };
      case "tasks.update": {
        const id = String(payload?.id ?? "");
        return { task: await workspaceClaw.tasks.update(id, payload as Record<string, unknown>) };
      }
      case "tasks.delete": {
        const id = String(payload?.id ?? "");
        await workspaceClaw.tasks.remove(id);
        return { ok: true };
      }
      case "notes.list":
        return { notes: await workspaceClaw.notes.list() };
      case "notes.create":
        return { note: await workspaceClaw.notes.create(payload as Record<string, unknown>) };
      case "notes.update": {
        const id = String(payload?.id ?? "");
        return { note: await workspaceClaw.notes.update(id, payload as Record<string, unknown>) };
      }
      case "notes.delete": {
        const id = String(payload?.id ?? "");
        await workspaceClaw.notes.remove(id);
        return { ok: true };
      }
      case "memory.list": {
        const [notes, tasks] = await Promise.all([workspaceClaw.notes.list(), workspaceClaw.tasks.list()]);
        const entries = [
          ...notes.map((note: any) => ({
            id: note.id,
            kind: "knowledge",
            title: note.title,
            content: note.blocks?.map((block: any) => block.text).join("\n") ?? "",
            source: "notes",
            tags: note.tags ?? [],
            createdAt: toTimestamp(note.createdAt),
            updatedAt: toTimestamp(note.updatedAt),
          })),
          ...tasks.map((task: any) => ({
            id: task.id,
            kind: "index",
            title: task.title,
            content: task.description ?? "",
            source: "tasks",
            tags: task.labels ?? [],
            createdAt: toTimestamp(task.createdAt),
            updatedAt: toTimestamp(task.updatedAt),
          })),
        ];
        return { entries };
      }
      case "memory.create":
        return { entry: await workspaceClaw.notes.create({ title: payload?.title, content: payload?.content, tags: payload?.tags }) };
      case "memory.update": {
        const id = String(payload?.id ?? "");
        return { entry: await workspaceClaw.notes.update(id, { title: payload?.title, content: payload?.content, tags: payload?.tags }) };
      }
      case "memory.delete": {
        const id = String(payload?.id ?? "");
        await workspaceClaw.notes.remove(id);
        return { ok: true };
      }
      case "inbox.list":
        return {
          messages: (await workspaceClaw.inbox.list({ limit: 100 })).map((thread: any) => ({
            id: thread.id,
            channel: thread.channel,
            subject: thread.subject,
            preview: thread.preview,
            content: thread.preview,
            read: thread.status !== "unread",
            timestamp: toTimestamp(thread.latestMessageAt || thread.updatedAt),
            threadId: thread.externalThreadId ?? thread.id,
            from: thread.participantPersonIds?.[0] ?? thread.channel,
          })),
        };
      case "inbox.update": {
        const id = String(payload?.id ?? "");
        if (payload?.read === true) {
          const thread = await workspaceClaw.inbox.readThread(id);
          return { message: thread?.thread ?? null };
        }
        return { ok: true };
      }
      case "inbox.delete": {
        const id = String(payload?.id ?? "");
        await workspaceClaw.inbox.archive(id);
        return { ok: true };
      }
      case "people.list": {
        const hidden = new Set(compatRead<string>("people-hidden"));
        const people = (await workspaceClaw.people.list({ limit: 100 })).filter((person: any) => !hidden.has(person.id));
        return { people };
      }
      case "people.create":
        return { person: await workspaceClaw.people.upsert(payload as Record<string, unknown>) };
      case "people.update":
        return { person: await workspaceClaw.people.upsert(payload as Record<string, unknown>) };
      case "people.delete": {
        const hidden = new Set(compatRead<string>("people-hidden"));
        hidden.add(String(payload?.id ?? ""));
        compatWrite("people-hidden", [...hidden]);
        return { ok: true };
      }
      case "events.list":
        return { events: await workspaceClaw.events.list({ limit: 100 }) };
      case "events.create":
        return { event: await workspaceClaw.events.create(payload as Record<string, unknown>) };
      case "events.update": {
        const id = String(payload?.id ?? "");
        return { event: await workspaceClaw.events.update(id, payload as Record<string, unknown>) };
      }
      case "events.delete": {
        const id = String(payload?.id ?? "");
        await workspaceClaw.events.remove(id);
        return { ok: true };
      }
      case "personas.list":
        return { personas: compatRead("personas", DEFAULT_PERSONAS) };
      case "personas.create": {
        const personas = compatRead<any>("personas", DEFAULT_PERSONAS);
        const persona = { id: randomUUID(), createdAt: Date.now(), updatedAt: Date.now(), ...payload };
        personas.push(persona);
        compatWrite("personas", personas);
        return { persona };
      }
      case "personas.update": {
        const personas = compatRead<any>("personas", DEFAULT_PERSONAS);
        const id = String(payload?.id ?? "");
        const index = personas.findIndex((entry: any) => entry.id === id);
        if (index === -1) throw new Error("Persona not found");
        personas[index] = { ...personas[index], ...payload, updatedAt: Date.now() };
        compatWrite("personas", personas);
        return { persona: personas[index] };
      }
      case "personas.delete": {
        const personas = compatRead<any>("personas", DEFAULT_PERSONAS).filter((entry: any) => entry.id !== String(payload?.id ?? ""));
        compatWrite("personas", personas);
        return { ok: true };
      }
      case "plugins.list":
        return { plugins: compatRead("plugins", DEFAULT_PLUGINS) };
      case "plugins.create": {
        const plugins = compatRead<any>("plugins", DEFAULT_PLUGINS);
        const plugin = { id: randomUUID(), installedAt: Date.now(), lastActivity: Date.now(), ...payload };
        plugins.push(plugin);
        compatWrite("plugins", plugins);
        return { plugin };
      }
      case "plugins.update": {
        const plugins = compatRead<any>("plugins", DEFAULT_PLUGINS);
        const id = String(payload?.id ?? "");
        const index = plugins.findIndex((entry: any) => entry.id === id);
        if (index === -1) throw new Error("Plugin not found");
        plugins[index] = { ...plugins[index], ...payload, lastActivity: Date.now() };
        compatWrite("plugins", plugins);
        return { plugin: plugins[index] };
      }
      case "plugins.delete": {
        const plugins = compatRead<any>("plugins", DEFAULT_PLUGINS).filter((entry: any) => entry.id !== String(payload?.id ?? ""));
        compatWrite("plugins", plugins);
        return { ok: true };
      }
      case "routines.list":
        return { routines: compatRead("routines"), executions: compatRead("routine-executions") };
      case "routines.create": {
        const routines = compatRead<any>("routines");
        const routine = { id: randomUUID(), enabled: true, createdAt: Date.now(), updatedAt: Date.now(), ...payload };
        routines.push(routine);
        compatWrite("routines", routines);
        return { routine };
      }
      case "routines.update": {
        const routines = compatRead<any>("routines");
        const executions = compatRead<any>("routine-executions");
        const id = String(payload?.id ?? "");
        const index = routines.findIndex((entry: any) => entry.id === id);
        if (index === -1) throw new Error("Routine not found");
        if (payload?.runNow) {
          const execution = {
            id: randomUUID(),
            routineId: id,
            status: "success",
            startedAt: Date.now(),
            completedAt: Date.now(),
            output: "Routine executed by relay connector.",
          };
          executions.push(execution);
          compatWrite("routine-executions", executions);
          return { routine: routines[index], execution };
        }
        routines[index] = { ...routines[index], ...payload, updatedAt: Date.now() };
        compatWrite("routines", routines);
        return { routine: routines[index] };
      }
      case "routines.delete": {
        const id = String(payload?.id ?? "");
        compatWrite("routines", compatRead<any>("routines").filter((entry: any) => entry.id !== id));
        compatWrite("routine-executions", compatRead<any>("routine-executions").filter((entry: any) => entry.routineId !== id));
        return { ok: true };
      }
      case "skills.list":
        return { skills: await claw.skills.list() };
      case "skills.search":
        return { results: await claw.skills.search(String(payload?.q ?? ""), { limit: Number(payload?.limit ?? 10) }) };
      case "skills.sources":
        return { sources: await claw.skills.sources() };
      case "images.list":
        return { images: claw.image.list(payload as Record<string, unknown>) };
      case "images.get":
        return { image: claw.image.get(String(payload?.imageId ?? "")) };
      case "images.create":
        return { image: await claw.image.generate(payload as Record<string, unknown>) };
      case "images.delete":
        return { removed: claw.image.remove(String(payload?.imageId ?? "")) };
      case "admin.runtime.status":
        return { runtime: await claw.runtime.status() };
      case "admin.runtime.setup":
        await claw.runtime.setupWorkspace();
        return { ok: true };
      case "admin.runtime.install":
        await claw.runtime.install("npm");
        return { ok: true };
      case "admin.runtime.uninstall":
        await claw.runtime.uninstall("npm");
        return { ok: true };
      case "admin.config.read":
        return { values: claw.files.readSettingsValues() };
      case "admin.config.write":
        claw.files.writeSettingsValues((payload?.values ?? {}) as Record<string, unknown>);
        return { ok: true };
      case "admin.workspace-file.read":
        return { file: claw.files.readWorkspaceFile(String(payload?.fileName ?? "")) };
      case "admin.workspace-file.write":
        claw.files.writeWorkspaceFile(String(payload?.fileName ?? ""), String(payload?.content ?? ""));
        return { ok: true };
      default:
        throw new Error(`Unsupported relay operation: ${operation}`);
    }
  }
}
