import fs from "fs";
import os from "os";
import path from "path";

import {
  createClaw,
  readOpenClawRuntimeConfig,
  resolveConversationsDir,
  resolveOpenClawContext,
} from "@clawjs/node";

import {
  DEFAULT_CLAWJS_OPENCLAW_AGENT_ID,
  LEGACY_CLAWJS_OPENCLAW_AGENT_ID,
} from "./openclaw-defaults.ts";

export interface ClawJSRuntimeIds {
  appId: string;
  workspaceId: string;
  agentId: string;
}

const CLAWJS_RUNTIME_IDS: ClawJSRuntimeIds = {
  appId: "clawjs-demo",
  workspaceId: "clawjs-demo",
  agentId: "clawjs-demo",
};

let clawPromise: Promise<Awaited<ReturnType<typeof createClaw>>> | null = null;
let clawPromiseKey: string | null = null;

export function resolveHomePath(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function readConfiguredEnv(primary: string, legacy?: string): string | null {
  const primaryValue = process.env[primary]?.trim();
  if (primaryValue) return primaryValue;
  const legacyValue = legacy ? process.env[legacy]?.trim() : undefined;
  return legacyValue || null;
}

export function resolveOpenClawStateDir(): string {
  const configured = readConfiguredEnv("OPENCLAW_STATE_DIR");
  if (configured) return resolveHomePath(configured);
  return path.join(os.homedir(), ".openclaw");
}

export function openClawConfigPath(): string {
  const configured = readConfiguredEnv("OPENCLAW_CONFIG_PATH");
  if (configured) return resolveHomePath(configured);
  return path.join(resolveOpenClawStateDir(), "openclaw.json");
}

interface OpenClawAgentConfig {
  id: string;
  name?: string;
  workspace?: string;
  agentDir?: string;
}

interface OpenClawConfig {
  agents?: {
    defaults?: {
      workspace?: string;
    };
    list?: OpenClawAgentConfig[];
  };
}

export function readOpenClawConfig(): OpenClawConfig | null {
  return readOpenClawRuntimeConfig({ configPath: openClawConfigPath() }) as OpenClawConfig | null;
}

export function getClawJSRuntimeIds(): ClawJSRuntimeIds {
  const configuredAgentId = readConfiguredEnv("CLAWLEN_OPENCLAW_AGENT_ID", "CLAWJS_LEGACY_OPENCLAW_AGENT_ID");
  if (!configuredAgentId) return CLAWJS_RUNTIME_IDS;
  return {
    appId: "clawjs-demo",
    workspaceId: configuredAgentId,
    agentId: configuredAgentId,
  };
}

function resolveClawJSContext() {
  const { agentId } = getClawJSRuntimeIds();
  return resolveOpenClawContext({
    agentId,
    configPath: openClawConfigPath(),
    stateDir: resolveOpenClawStateDir(),
    workspaceDir: readConfiguredEnv("CLAWLEN_OPENCLAW_WORKSPACE_DIR", "CLAWJS_LEGACY_OPENCLAW_WORKSPACE_DIR")
      || readConfiguredEnv("OPENCLAW_WORKSPACE_DIR")
      || undefined,
    agentDir: readConfiguredEnv("CLAWLEN_OPENCLAW_AGENT_DIR", "CLAWJS_LEGACY_OPENCLAW_AGENT_DIR") || undefined,
    conversationsDir: readConfiguredEnv("CLAWLEN_OPENCLAW_SESSIONS_DIR", "CLAWJS_LEGACY_OPENCLAW_SESSIONS_DIR") || undefined,
  });
}

function getConfiguredAgent(agentId: string): OpenClawAgentConfig | null {
  const context = resolveClawJSContext();
  if (context.configuredAgent?.id === agentId) {
    return context.configuredAgent;
  }
  if (agentId === DEFAULT_CLAWJS_OPENCLAW_AGENT_ID && context.configuredAgent?.id === LEGACY_CLAWJS_OPENCLAW_AGENT_ID) {
    return context.configuredAgent;
  }
  const agents = readOpenClawConfig()?.agents?.list;
  if (!Array.isArray(agents)) return null;
  return agents.find((agent) => agent?.id === agentId)
    || (agentId === DEFAULT_CLAWJS_OPENCLAW_AGENT_ID
      ? agents.find((agent) => agent?.id === LEGACY_CLAWJS_OPENCLAW_AGENT_ID) || null
      : null);
}

export function resolveLegacyWorkspaceDir(): string {
  return path.join(resolveOpenClawStateDir(), "workspaces", LEGACY_CLAWJS_OPENCLAW_AGENT_ID);
}

export function resolveLegacyAgentDir(): string {
  return path.join(resolveOpenClawStateDir(), "agents", LEGACY_CLAWJS_OPENCLAW_AGENT_ID, "agent");
}

export function resolveLegacySessionsDir(): string {
  return path.join(resolveOpenClawStateDir(), "agents", LEGACY_CLAWJS_OPENCLAW_AGENT_ID, "sessions");
}

export function resolveClawJSWorkspaceDir(): string {
  return resolveClawJSContext().workspaceDir;
}

export function resolveClawJSAgentDir(): string {
  return resolveClawJSContext().agentDir;
}

export function resolveClawJSSessionsDir(): string {
  return resolveClawJSContext().conversationsDir;
}

function copyFileIfMissing(sourcePath: string, targetPath: string): void {
  if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) return;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function copyDirectoryContentsIfMissing(sourceDir: string, targetDir: string): void {
  if (!fs.existsSync(sourceDir)) return;
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryContentsIfMissing(sourcePath, targetPath);
      continue;
    }
    copyFileIfMissing(sourcePath, targetPath);
  }
}

export function migrateLegacyClawJSState(): void {
  const workspaceDir = resolveClawJSWorkspaceDir();
  const agentDir = resolveClawJSAgentDir();
  const conversationsDir = resolveConversationsDir(workspaceDir);

  copyDirectoryContentsIfMissing(resolveLegacyWorkspaceDir(), workspaceDir);
  copyDirectoryContentsIfMissing(resolveLegacyAgentDir(), agentDir);
  copyDirectoryContentsIfMissing(resolveLegacySessionsDir(), conversationsDir);
}

export async function getClaw(): Promise<Awaited<ReturnType<typeof createClaw>>> {
  const ids = getClawJSRuntimeIds();
  const cacheKey = JSON.stringify({
    ids,
    agentDir: resolveClawJSAgentDir(),
    workspaceDir: resolveClawJSWorkspaceDir(),
  });

  if (!clawPromise || clawPromiseKey !== cacheKey) {
    migrateLegacyClawJSState();
    clawPromiseKey = cacheKey;
    const { getClawJSLocalSettings } = await import("./local-settings.ts");
    const activeAdapter = getClawJSLocalSettings().activeAdapter || "openclaw";
    clawPromise = createClaw({
      runtime: {
        adapter: activeAdapter as "openclaw",
        agentDir: resolveClawJSAgentDir(),
      },
      workspace: {
        appId: ids.appId,
        workspaceId: ids.workspaceId,
        agentId: ids.agentId,
        rootDir: resolveClawJSWorkspaceDir(),
      },
    });
  }

  return clawPromise;
}

export async function ensureClawWorkspaceReady(): Promise<Awaited<ReturnType<typeof createClaw>>> {
  const claw = await getClaw();
  migrateLegacyClawJSState();
  await claw.workspace.init();
  return claw;
}
