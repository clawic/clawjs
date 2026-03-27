import os from "os";
import path from "path";

import {
  createClaw,
  readOpenClawRuntimeConfig,
  resolveOpenClawContext,
} from "@clawjs/node";

import { DEFAULT_CLAWJS_OPENCLAW_AGENT_ID } from "./openclaw-defaults.ts";

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

function readConfiguredEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
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
  const configuredAgentId = readConfiguredEnv("OPENCLAW_AGENT_ID");
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
    workspaceDir: readConfiguredEnv("OPENCLAW_WORKSPACE_DIR") || undefined,
    agentDir: readConfiguredEnv("OPENCLAW_AGENT_DIR") || undefined,
    conversationsDir: readConfiguredEnv("OPENCLAW_CONVERSATIONS_DIR") || undefined,
  });
}

function getConfiguredAgent(agentId: string): OpenClawAgentConfig | null {
  const context = resolveClawJSContext();
  if (context.configuredAgent?.id === agentId) {
    return context.configuredAgent;
  }
  const agents = readOpenClawConfig()?.agents?.list;
  if (!Array.isArray(agents)) return null;
  return agents.find((agent) => agent?.id === agentId) || null;
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

export async function getClaw(): Promise<Awaited<ReturnType<typeof createClaw>>> {
  const ids = getClawJSRuntimeIds();
  const cacheKey = JSON.stringify({
    ids,
    agentDir: resolveClawJSAgentDir(),
    workspaceDir: resolveClawJSWorkspaceDir(),
  });

  if (!clawPromise || clawPromiseKey !== cacheKey) {
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
  await claw.workspace.init();
  return claw;
}
