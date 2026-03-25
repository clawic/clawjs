import path from "path";

import { maskCredential, type ProviderAuthSummary } from "@clawjs/core";
import {
  type OpenClawModelsStatusJson,
  providerHasApiKey,
  providerHasAuth,
  providerHasSubscription,
} from "../models/openclaw-models.ts";
import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";
import { buildOpenClawCommand, type OpenClawCommandOptions } from "../runtime/openclaw-command.ts";

export interface OpenClawAuthCredential {
  type: "api_key" | "token" | "oauth";
  provider: string;
  key?: string;
  token?: string;
  maskedCredential?: string;
  [k: string]: unknown;
}

export interface OpenClawAuthStore {
  version: number;
  profiles: Record<string, OpenClawAuthCredential>;
}

export interface OpenClawAuthProfileSummary {
  profileId: string;
  provider: string;
  authType: OpenClawAuthCredential["type"];
  maskedCredential: string | null;
}

export interface AuthStoreFilesystem {
  exists(filePath: string): boolean;
  readText(filePath: string): string;
  writeTextAtomic(filePath: string, content: string): { changed: boolean; filePath: string };
  ensureDir(dirPath: string): void;
  remove(targetPath: string): void;
}

export interface OpenClawAuthRunner {
  exec(command: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

export interface DetachedAuthLauncher {
  spawnDetachedPty(command: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }): { pid: number | undefined; command: string; args: string[] };
}

export interface OpenClawAuthLaunchResult {
  provider: string;
  pid: number | undefined;
  command: string;
  args: string[];
}

export interface OpenClawAuthLoginCommand {
  provider: string;
  args: string[];
}

export interface OpenClawAuthApiKeyCommand {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

export interface PersistProviderApiKeyOptions {
  profileId?: string;
  runtimeCommand?: OpenClawAuthApiKeyCommand;
  runner?: OpenClawAuthRunner;
}

export interface PersistProviderApiKeyResult {
  summary: OpenClawAuthProfileSummary;
  mode: "runtime" | "store";
}

export interface OpenClawAuthDiagnostics {
  provider?: string;
  authStorePath?: string;
  resolvedOauthProvider?: string | null;
  profiles: OpenClawAuthProfileSummary[];
  fallbackAvailable: boolean;
  hasOfficialRuntimeSave: boolean;
  issues: string[];
}

const OPENCLAW_OAUTH_PROVIDER_ALIASES: Record<string, string> = {
  chatgpt: "openai-codex",
  gemini: "google-gemini-cli",
  google: "google-gemini-cli",
  "google-gemini-cli": "google-gemini-cli",
  kimi: "kimi-coding",
  "kimi-coding": "kimi-coding",
  openai: "openai-codex",
  "openai-codex": "openai-codex",
  qwen: "qwen",
};

export function resolveAuthStorePath(agentDir: string): string {
  return path.join(agentDir, "auth-profiles.json");
}

export function loadAuthStore(agentDir: string, filesystem: AuthStoreFilesystem = new NodeFileSystemHost()): OpenClawAuthStore {
  try {
    return JSON.parse(filesystem.readText(resolveAuthStorePath(agentDir))) as OpenClawAuthStore;
  } catch {
    return { version: 1, profiles: {} };
  }
}

export function saveAuthStore(agentDir: string, store: OpenClawAuthStore, filesystem: AuthStoreFilesystem = new NodeFileSystemHost()): void {
  const filePath = resolveAuthStorePath(agentDir);
  filesystem.ensureDir(path.dirname(filePath));
  if ("withLockRetry" in filesystem && typeof filesystem.withLockRetry === "function") {
    (
      filesystem as AuthStoreFilesystem & {
        withLockRetry: <T>(lockPath: string, fn: () => T) => T;
      }
    ).withLockRetry(resolveFileLockPath(filePath), () => filesystem.writeTextAtomic(filePath, `${JSON.stringify(store, null, 2)}\n`));
    return;
  }
  filesystem.writeTextAtomic(filePath, `${JSON.stringify(store, null, 2)}\n`);
}

function summaryFromCredential(profileId: string, credential: OpenClawAuthCredential): OpenClawAuthProfileSummary {
  const raw = credential.key ?? credential.token ?? credential.maskedCredential ?? null;
  return {
    profileId,
    provider: credential.provider,
    authType: credential.type,
    maskedCredential: credential.maskedCredential ?? maskCredential(raw),
  };
}

export function resolveOpenClawOAuthProvider(provider: string): string | null {
  const normalized = provider.trim().toLowerCase();
  if (!normalized) return null;
  return OPENCLAW_OAUTH_PROVIDER_ALIASES[normalized] ?? null;
}

export function buildOpenClawAuthLoginCommand(
  provider: string,
  agentId?: string,
  options: { setDefault?: boolean } = {},
): OpenClawAuthLoginCommand {
  const resolvedProvider = resolveOpenClawOAuthProvider(provider);
  if (!resolvedProvider) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const args = [
    "models",
    ...(agentId ? ["--agent", agentId] : []),
    "auth",
    "login",
    "--provider",
    resolvedProvider,
    ...(options.setDefault === false ? [] : ["--set-default"]),
  ];

  return {
    provider: resolvedProvider,
    args,
  };
}

export function launchOpenClawAuthLogin(
  provider: string,
  launcher: DetachedAuthLauncher,
  agentId?: string,
  options: { setDefault?: boolean; cwd?: string; env?: NodeJS.ProcessEnv; binaryPath?: string } = {},
): OpenClawAuthLaunchResult {
  const command = buildOpenClawAuthLoginCommand(provider, agentId, {
    setDefault: options.setDefault,
  });
  const runtimeCommand = buildOpenClawCommand(command.args, options);
  const spawned = launcher.spawnDetachedPty(
    runtimeCommand.command,
    command.args,
    {
      cwd: options.cwd,
      env: runtimeCommand.env,
    },
  );

  return {
    provider: command.provider,
    pid: spawned.pid,
    command: spawned.command,
    args: spawned.args,
  };
}

export function saveProviderApiKey(
  agentDir: string,
  provider: string,
  key: string,
  filesystem: AuthStoreFilesystem = new NodeFileSystemHost(),
  profileId = `${provider}:manual`,
): OpenClawAuthProfileSummary {
  const store = loadAuthStore(agentDir, filesystem);
  store.profiles[profileId] = {
    type: "api_key",
    provider,
    key,
  };
  saveAuthStore(agentDir, store, filesystem);
  return summaryFromCredential(profileId, store.profiles[profileId]);
}

export async function persistProviderApiKey(
  agentDir: string,
  provider: string,
  key: string,
  filesystem: AuthStoreFilesystem = new NodeFileSystemHost(),
  options: PersistProviderApiKeyOptions = {},
): Promise<PersistProviderApiKeyResult> {
  const profileId = options.profileId ?? `${provider}:manual`;
  if (options.runtimeCommand && options.runner) {
    await options.runner.exec(options.runtimeCommand.command, options.runtimeCommand.args, {
      env: options.runtimeCommand.env,
      timeoutMs: 20_000,
    });
    const store = loadAuthStore(agentDir, filesystem);
    store.profiles[profileId] = {
      type: "api_key",
      provider,
      maskedCredential: maskCredential(key) ?? "[REDACTED]",
    };
    saveAuthStore(agentDir, store, filesystem);
    return {
      summary: summaryFromCredential(profileId, store.profiles[profileId]),
      mode: "runtime",
    };
  }

  return {
    summary: saveProviderApiKey(agentDir, provider, key, filesystem, profileId),
    mode: "store",
  };
}

export function summarizeAuthProfiles(store: OpenClawAuthStore): OpenClawAuthProfileSummary[] {
  return Object.entries(store.profiles)
    .map(([profileId, credential]) => summaryFromCredential(profileId, credential))
    .sort((a, b) => a.profileId.localeCompare(b.profileId));
}

export function normalizeProviderAuth(
  status: OpenClawModelsStatusJson,
  providerKey: string,
  authStore?: OpenClawAuthStore | null,
): ProviderAuthSummary {
  const providerData = status.auth?.providers?.find((provider) => provider.provider === providerKey);
  const hasAuth = providerHasAuth(providerData);
  const hasSubscription = providerHasSubscription(providerData);
  const hasApiKey = providerHasApiKey(providerData);
  const hasProfileApiKey = (providerData?.profiles?.apiKey ?? 0) > 0;
  const hasEnvKey = !!providerData?.env?.value;
  const effectiveKind = typeof providerData?.effective?.kind === "string"
    ? providerData.effective.kind.trim().toLowerCase()
    : "";
  const authType: ProviderAuthSummary["authType"] = (providerData?.profiles?.oauth ?? 0) > 0 || effectiveKind === "oauth"
    ? "oauth"
    : (providerData?.profiles?.token ?? 0) > 0 || effectiveKind === "token"
      ? "token"
      : hasProfileApiKey
        ? "api_key"
        : hasEnvKey
          ? "env"
          : null;

  const profileSummary = authStore
    ? summarizeAuthProfiles(authStore).find((summary) => summary.provider === providerKey)
    : null;

  return {
    provider: providerKey,
    hasAuth,
    hasSubscription,
    hasApiKey,
    hasProfileApiKey,
    hasEnvKey,
    authType,
    maskedCredential: profileSummary?.maskedCredential ?? maskCredential(providerData?.env?.value ?? null),
  };
}

export function normalizeAuthSummaries(
  status: OpenClawModelsStatusJson,
  authStore?: OpenClawAuthStore | null,
): Record<string, ProviderAuthSummary> {
  const summaries: Record<string, ProviderAuthSummary> = {};
  for (const provider of status.auth?.providers ?? []) {
    summaries[provider.provider] = normalizeProviderAuth(status, provider.provider, authStore);
  }
  return summaries;
}

export function removeAuthProfilesForProvider(
  agentDir: string,
  provider: string,
  filesystem: AuthStoreFilesystem = new NodeFileSystemHost(),
  legacyAgentDirs: string[] = [],
): number {
  let removed = 0;
  for (const currentAgentDir of [agentDir, ...legacyAgentDirs]) {
    const filePath = resolveAuthStorePath(currentAgentDir);
    if (!filesystem.exists(filePath)) continue;

    const store = loadAuthStore(currentAgentDir, filesystem);
    const before = Object.keys(store.profiles).length;
    store.profiles = Object.fromEntries(
      Object.entries(store.profiles).filter(([, credential]) => credential.provider !== provider)
    );
    if (Object.keys(store.profiles).length !== before) {
      saveAuthStore(currentAgentDir, store, filesystem);
      removed += before - Object.keys(store.profiles).length;
    }
  }

  return removed;
}

export async function setDefaultModel(
  model: string,
  runner: OpenClawAuthRunner,
  agentId?: string,
  options: OpenClawCommandOptions = {},
): Promise<string> {
  const { buildSetDefaultModelCommand } = await import("../models/openclaw-models.ts");
  const command = buildSetDefaultModelCommand(model, agentId);
  try {
    const runtimeCommand = buildOpenClawCommand(command.args, options);
    await runner.exec(runtimeCommand.command, runtimeCommand.args, {
      env: runtimeCommand.env,
      timeoutMs: 20_000,
    });
    return command.modelId;
  } catch (error) {
    throw new Error(`Failed to set default model ${command.modelId}: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

export function buildOpenClawAuthDiagnostics(
  agentDir?: string,
  provider?: string,
  filesystem: AuthStoreFilesystem = new NodeFileSystemHost(),
): OpenClawAuthDiagnostics {
  const store = agentDir ? loadAuthStore(agentDir, filesystem) : { version: 1, profiles: {} };
  const profiles = summarizeAuthProfiles(store)
    .filter((entry) => !provider || entry.provider === provider);
  const resolvedOauthProvider = provider ? resolveOpenClawOAuthProvider(provider) : null;

  return {
    ...(provider ? { provider } : {}),
    ...(agentDir ? { authStorePath: resolveAuthStorePath(agentDir) } : {}),
    ...(provider ? { resolvedOauthProvider } : {}),
    profiles,
    fallbackAvailable: true,
    hasOfficialRuntimeSave: false,
    issues: resolvedOauthProvider === null && provider
      ? [`OAuth login is unavailable for provider ${provider}.`]
      : [],
  };
}
