import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

import {
  deriveOpenClawSetupStatus,
  hasOpenClawProviderAuth,
  filterOpenClawProviderAuthByIntent,
  readDirectOpenClawAuthState,
  readOpenClawProviderIntentMap,
} from "@clawjs/claw";
import type { ProviderAuthSummary } from "@clawjs/core";

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
import { findCommand, findCommandFresh } from "./platform.ts";

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

const AUTHENTICATED_MODEL_PRIORITY: string[] = [
  "openai-codex/gpt-5.4",
  "anthropic/claude-opus-4-6",
  "openai/gpt-5.4",
  "google-gemini-cli/gemini-2.5-pro",
  "google/gemini-2.5-pro",
  "deepseek/deepseek-chat",
  "mistral/codestral-latest",
  "xai/grok-3",
  "groq/llama-3.3-70b-versatile",
  "openrouter/anthropic/claude-opus-4-6",
  "kimi-coding/k2p5",
  "qwen/qwen3-coder",
];

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

function modelRefFromId(modelId: string | null): { modelId: string; provider: string } | null {
  const trimmed = modelId?.trim();
  if (!trimmed) return null;
  const provider = trimmed.includes("/") ? trimmed.split("/")[0] || trimmed : trimmed;
  return { modelId: trimmed, provider };
}

export async function readDirectClawJSOpenClawState(): Promise<{
  defaultModel: string | null;
  providerAuth: Record<string, ProviderAuthSummary>;
}> {
  const binary = await findCommandFresh("openclaw");
  if (!binary) {
    return { defaultModel: null, providerAuth: {} };
  }

  return readDirectOpenClawAuthState(resolveClawJSAgentDir(), getClawJSOpenClawAgentId(), undefined, {
    binaryPath: binary,
    homeDir: resolveOpenClawStateDir(),
    configPath: openClawConfigPath(),
    cwd: resolveClawJSWorkspaceDir(),
    env: process.env,
    timeoutMs: 20_000,
  });
}

export function isClawJSOpenClawModelAuthenticated(
  modelId: string | null,
  providerAuth: Record<string, ProviderAuthSummary>,
): boolean {
  return hasOpenClawProviderAuth(modelRefFromId(modelId)?.provider ?? null, providerAuth);
}

export function pickPreferredAuthenticatedOpenClawModel(
  providerAuth: Record<string, ProviderAuthSummary>,
): string | null {
  for (const modelId of AUTHENTICATED_MODEL_PRIORITY) {
    if (isClawJSOpenClawModelAuthenticated(modelId, providerAuth)) {
      return modelId;
    }
  }
  return null;
}

export async function reconcileClawJSOpenClawDefaultModelWithAvailableAuth(): Promise<string | null> {
  const claw = await getClaw();
  const direct = await readDirectClawJSOpenClawState().catch(() => null);
  const providerIntent = readOpenClawProviderIntentMap(claw.intent.get("providers"));
  const rawProviderAuth: Record<string, ProviderAuthSummary> = direct?.providerAuth
    ?? await claw.auth.status().catch(() => ({} as Record<string, ProviderAuthSummary>));
  const providerAuth = filterOpenClawProviderAuthByIntent(
    rawProviderAuth,
    providerIntent,
  );
  const defaultModel = direct?.defaultModel ?? (await claw.models.getDefault().catch(() => null))?.modelId ?? null;

  if (isClawJSOpenClawModelAuthenticated(defaultModel, providerAuth)) {
    return defaultModel;
  }

  const preferredModel = pickPreferredAuthenticatedOpenClawModel(providerAuth);
  if (!preferredModel || preferredModel === defaultModel) {
    return defaultModel;
  }

  await claw.models.setDefault(preferredModel);
  return preferredModel;
}

export async function getClawJSOpenClawStatus(): Promise<ClawJSOpenClawStatus> {
  const binary = await findCommandFresh("openclaw");
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

  let version: string | null = null;
  let latestVersion: string | null = null;
  let defaultModel: string | null = null;
  let agentConfigured = false;
  let modelConfigured = false;
  let authConfigured = false;
  let ready = false;
  let needsSetup = false;
  let needsAuth = false;
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

  try {
    const claw = await getClaw();
    const direct = await readDirectClawJSOpenClawState().catch(() => null);
    const providerIntent = readOpenClawProviderIntentMap(claw.intent.get("providers"));
    const rawProviderAuth: Record<string, ProviderAuthSummary> = direct && Object.keys(direct.providerAuth).length > 0
      ? direct.providerAuth
      : await claw.auth.status().catch(() => ({} as Record<string, ProviderAuthSummary>));
    const status = deriveOpenClawSetupStatus({
      context: getClawJSOpenClawContext(),
      defaultModel: direct?.defaultModel
        ? modelRefFromId(direct.defaultModel)
        : await claw.models.getDefault().catch(() => null),
      providerAuth: filterOpenClawProviderAuthByIntent(rawProviderAuth, providerIntent),
    });
    agentConfigured = status.agentConfigured;
    modelConfigured = status.modelConfigured;
    authConfigured = status.authConfigured;
    ready = status.ready;
    needsSetup = status.needsSetup;
    needsAuth = status.needsAuth;
    defaultModel = status.defaultModel;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
  }

  return {
    installed: true,
    cliAvailable: true,
    agentConfigured,
    modelConfigured,
    authConfigured,
    ready,
    needsSetup,
    needsAuth,
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
