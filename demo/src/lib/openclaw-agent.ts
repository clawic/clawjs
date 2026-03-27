import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

import {
  ensureClawWorkspaceReady,
  getClaw,
  getClawJSRuntimeIds,
  openClawConfigPath as clawOpenClawConfigPath,
  readOpenClawConfig,
  resolveClawJSAgentDir,
  resolveClawJSSessionsDir,
  resolveClawJSWorkspaceDir,
  resolveHomePath as clawResolveHomePath,
  resolveOpenClawStateDir as clawResolveOpenClawStateDir,
} from "./claw.ts";

export { resolveClawJSWorkspaceDir, resolveClawJSAgentDir, resolveClawJSSessionsDir };
import {
  DEFAULT_CLAWJS_OPENCLAW_AGENT_ID,
  defaultClawJsTranscriptionDbPath,
} from "./openclaw-defaults.ts";
import { findCommand } from "./platform.ts";

interface OpenClawAgentConfig {
  id: string;
  name?: string;
  workspace?: string;
  agentDir?: string;
}

export interface ClawJSOpenClawContext {
  agentId: string;
  agentDir: string;
  sessionsDir: string;
  stateDir: string;
  workspaceDir: string;
  transcriptionDbPath: string;
  configuredAgent: OpenClawAgentConfig | null;
}

export interface ClawJSOpenClawStatus {
  installed: boolean;
  cliAvailable: boolean;
  agentConfigured: boolean;
  modelConfigured: boolean;
  authConfigured: boolean;
  ready: boolean;
  needsSetup: boolean;
  needsAuth: boolean;
  lastError: string | null;
  version: string | null;
  latestVersion: string | null;
  defaultModel: string | null;
}

let ensureAgentPromise: Promise<ClawJSOpenClawContext> | null = null;

export function resolveHomePath(value: string): string {
  return clawResolveHomePath(value);
}

export function resolveOpenClawStateDir(): string {
  return clawResolveOpenClawStateDir();
}

export function openClawConfigPath(): string {
  return clawOpenClawConfigPath();
}

export function getClawJSOpenClawAgentId(): string {
  return getClawJSRuntimeIds().agentId || DEFAULT_CLAWJS_OPENCLAW_AGENT_ID;
}

function getConfiguredAgent(agentId = getClawJSOpenClawAgentId()): OpenClawAgentConfig | null {
  const agents = readOpenClawConfig()?.agents?.list;
  if (!Array.isArray(agents)) return null;
  return agents.find((agent) => agent?.id === agentId) || null;
}

export function resolveClawJSTranscriptionDbPath(agentId = getClawJSOpenClawAgentId()): string {
  const explicit = process.env.OPENCLAW_TRANSCRIPTION_DB_PATH?.trim();
  if (explicit) return resolveHomePath(explicit);
  return path.join(resolveClawJSWorkspaceDir(), "transcriptions.sqlite");
}

export function getClawJSOpenClawContext(agentId = getClawJSOpenClawAgentId()): ClawJSOpenClawContext {
  const claw = getClawJSRuntimeIds();
  return {
    agentId,
    agentDir: resolveClawJSAgentDir(),
    sessionsDir: resolveClawJSSessionsDir(),
    stateDir: resolveOpenClawStateDir(),
    workspaceDir: resolveClawJSWorkspaceDir(),
    transcriptionDbPath: resolveClawJSTranscriptionDbPath(agentId),
    configuredAgent: getConfiguredAgent(claw.agentId),
  };
}

function modelProvider(modelId: string | null): string | null {
  if (!modelId?.trim()) return null;
  const trimmed = modelId.trim();
  return trimmed.includes("/") ? trimmed.split("/")[0] || null : trimmed;
}

export async function ensureClawJSOpenClawAgent(): Promise<ClawJSOpenClawContext> {
  const current = getClawJSOpenClawContext();
  const hasWorkspaceManifest = fs.existsSync(path.join(current.workspaceDir, ".clawjs", "manifest.json"));
  if (current.configuredAgent && hasWorkspaceManifest) return current;

  if (ensureAgentPromise) return ensureAgentPromise;

  ensureAgentPromise = (async () => {
    const claw = await ensureClawWorkspaceReady();
    await claw.runtime.setupWorkspace();
    return getClawJSOpenClawContext();
  })();

  try {
    return await ensureAgentPromise;
  } finally {
    ensureAgentPromise = null;
  }
}

export async function getClawJSOpenClawStatus(): Promise<ClawJSOpenClawStatus> {
  const binary = await findCommand("openclaw");
  if (!binary) {
    return {
      installed: false,
      cliAvailable: false,
      agentConfigured: false,
      modelConfigured: false,
      authConfigured: false,
      ready: false,
      needsSetup: false,
      needsAuth: false,
      lastError: null,
      version: null,
      latestVersion: null,
      defaultModel: null,
    };
  }

  const context = getClawJSOpenClawContext();
  const workspaceManifestPath = path.join(context.workspaceDir, ".clawjs", "manifest.json");
  const agentConfigured = !!context.configuredAgent || fs.existsSync(workspaceManifestPath);

  let version: string | null = null;
  let latestVersion: string | null = null;
  let defaultModel: string | null = null;
  let authConfigured = false;
  let lastError: string | null = null;

  try {
    const output = execFileSync(binary, ["--version"], {
      encoding: "utf8",
      timeout: 10_000,
    });
    version = output.trim().replace(/^openclaw\s*/i, "") || null;
  } catch {
    version = null;
  }

  try {
    const npmBinary = await findCommand("npm");
    if (npmBinary) {
      latestVersion = execFileSync(npmBinary, ["view", "openclaw", "version"], {
        encoding: "utf8",
        timeout: 10_000,
      }).trim() || null;
    }
  } catch {
    latestVersion = null;
  }

  if (!agentConfigured) {
    return {
      installed: true,
      cliAvailable: true,
      agentConfigured: false,
      modelConfigured: false,
      authConfigured: false,
      ready: false,
      needsSetup: true,
      needsAuth: false,
      lastError,
      version,
      latestVersion,
      defaultModel,
    };
  }

  try {
    const claw = await getClaw();
    const defaultModelRef = await claw.models.getDefault().catch(() => null) as { id?: string; modelId?: string } | null;
    defaultModel = defaultModelRef?.modelId ?? defaultModelRef?.id ?? null;
    const provider = modelProvider(defaultModel);
    const authSummaries = await claw.auth.status().catch(() => ({}));
    authConfigured = provider
      ? Object.values(authSummaries).some((summary) => {
          if (!summary.hasAuth) return false;
          // Match exact provider or prefix (e.g., "openai-codex" matches "openai" auth)
          return summary.provider === provider
            || provider.startsWith(summary.provider + "-")
            || provider.startsWith(summary.provider + "/");
        })
      : false;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
  }

  const modelConfigured = !!defaultModel;
  const ready = agentConfigured && modelConfigured && authConfigured;

  return {
    installed: true,
    cliAvailable: true,
    agentConfigured,
    modelConfigured,
    authConfigured,
    ready,
    needsSetup: !agentConfigured || !modelConfigured,
    needsAuth: modelConfigured && !authConfigured,
    lastError,
    version,
    latestVersion,
    defaultModel,
  };
}

export function normalizeClawJSTranscriptionDbPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) return rawPath;

  const normalized = resolveHomePath(trimmed);
  if (normalized !== resolveClawJSTranscriptionDbPath()) {
    return rawPath;
  }

  if (trimmed.startsWith("~")) {
    return defaultClawJsTranscriptionDbPath(getClawJSOpenClawAgentId());
  }

  return resolveClawJSTranscriptionDbPath();
}
