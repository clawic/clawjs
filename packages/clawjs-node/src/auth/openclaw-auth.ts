import { execSync } from "child_process";
import path from "path";

import { maskCredential, type ProviderAuthSummary } from "@clawjs/core";
import {
  getDefaultOpenClawModel,
  parseOpenClawModelsStatus,
  type OpenClawModelsStatusJson,
} from "../models/openclaw-models.ts";
import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";
import { NodeProcessHost } from "../host/process.ts";
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
  requestedProvider?: string;
  provider: string;
  status: "launched";
  launchMode: "browser";
  pid: number | undefined;
  command?: string;
  args?: string[];
  message?: string;
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

export interface OpenClawProviderIntentConfig {
  enabled?: boolean;
  preferredAuthMode?: "oauth" | "token" | "api_key" | "env" | "secret_ref" | null;
  profileId?: string | null;
}

export type OpenClawProviderIntentMap = Record<string, OpenClawProviderIntentConfig>;

export interface OpenClawDirectAuthState {
  defaultModel: string | null;
  providerAuth: Record<string, ProviderAuthSummary>;
}

export interface CleanupOpenClawAuthLoginStateOptions {
  agentId: string;
  currentPid?: number | null;
  callbackPort?: number;
  platform?: NodeJS.Platform;
  pidCollector?: (command: string) => number[];
  killer?: (pid: number) => void;
}

export interface CleanupOpenClawAuthLoginStateResult {
  killedPids: number[];
  clearedCurrentPid: boolean;
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

const OPENCLAW_PROVIDER_STATUS_KEYS: Record<string, string[]> = {
  "openai-codex": ["openai-codex", "openai"],
  "google-gemini-cli": ["google-gemini-cli", "google"],
  "kimi-coding": ["kimi-coding", "kimi"],
  qwen: ["qwen"],
  anthropic: ["anthropic"],
};

const EXPLICIT_ENABLE_REQUIRED_PROVIDERS = new Set([
  "openai-codex",
  "google-gemini-cli",
  "kimi-coding",
  "qwen",
]);

const DEFAULT_OPENCLAW_CALLBACK_PORT = 1455;

function collectPidsFromCommand(command: string): number[] {
  try {
    const stdout = execSync(command, { timeout: 3_000, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    if (!stdout) return [];
    return stdout
      .split(/\r?\n/)
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isInteger(value) && value > 0);
  } catch {
    return [];
  }
}

function killProcess(pid: number): void {
  if (!Number.isInteger(pid) || pid <= 0) return;
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // ignore already exited or inaccessible processes
  }
}

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

export function requiresExplicitProviderEnable(provider: string): boolean {
  return EXPLICIT_ENABLE_REQUIRED_PROVIDERS.has(provider.trim());
}

export function readOpenClawProviderIntentMap(input: unknown): OpenClawProviderIntentMap {
  if (!input || typeof input !== "object") return {};
  const providers = (input as { providers?: unknown }).providers;
  if (!providers || typeof providers !== "object") return {};
  return providers as OpenClawProviderIntentMap;
}

export function isOpenClawProviderEnabled(
  provider: string,
  providerIntents: OpenClawProviderIntentMap | null | undefined,
): boolean {
  const explicit = providerIntents?.[provider]?.enabled;
  if (typeof explicit === "boolean") return explicit;
  return !requiresExplicitProviderEnable(provider);
}

export function filterOpenClawProviderAuthByIntent<T extends { provider: string }>(
  providerAuth: Record<string, T>,
  providerIntents: OpenClawProviderIntentMap | null | undefined,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(providerAuth).filter(([provider]) => isOpenClawProviderEnabled(provider, providerIntents)),
  );
}

export function getOpenClawOAuthProviderSummary<T extends Partial<ProviderAuthSummary>>(
  providers: Record<string, T> | null | undefined,
  oauthProviderId: string,
): T | undefined {
  const candidateKeys = OPENCLAW_PROVIDER_STATUS_KEYS[oauthProviderId] ?? [oauthProviderId];
  const matches = candidateKeys
    .map((key) => providers?.[key])
    .filter((summary): summary is T => !!summary);

  return matches.find((summary) => !!summary.hasAuth && !!summary.hasSubscription)
    ?? matches.find((summary) => !!summary.hasSubscription)
    ?? matches[0];
}

export function hasConfirmedOpenClawOAuthSubscription<T extends Partial<ProviderAuthSummary>>(
  providers: Record<string, T> | null | undefined,
  oauthProviderId: string,
  providerIntents?: OpenClawProviderIntentMap | null,
): boolean {
  const summary = getOpenClawOAuthProviderSummary(providers, oauthProviderId);
  return isOpenClawProviderEnabled(oauthProviderId, providerIntents)
    && !!summary?.hasAuth
    && !!summary?.hasSubscription;
}

export function cleanupOpenClawAuthLoginState(
  options: CleanupOpenClawAuthLoginStateOptions,
): CleanupOpenClawAuthLoginStateResult {
  const {
    agentId,
    currentPid,
    callbackPort = DEFAULT_OPENCLAW_CALLBACK_PORT,
    platform = process.platform,
    pidCollector = collectPidsFromCommand,
    killer = killProcess,
  } = options;

  const killedPids = new Set<number>();

  if (Number.isInteger(currentPid) && (currentPid ?? 0) > 0) {
    killer(currentPid!);
    killedPids.add(currentPid!);
  }

  if (platform !== "win32") {
    for (const pid of pidCollector(`lsof -ti :${callbackPort}`)) {
      killer(pid);
      killedPids.add(pid);
    }

    for (const pid of pidCollector(`pgrep -f "openclaw models --agent ${agentId} auth login"`)) {
      killer(pid);
      killedPids.add(pid);
    }
  }

  return {
    killedPids: [...killedPids],
    clearedCurrentPid: Number.isInteger(currentPid) && (currentPid ?? 0) > 0,
  };
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
    requestedProvider: provider,
    provider: command.provider,
    status: "launched",
    launchMode: "browser",
    pid: spawned.pid,
    command: spawned.command,
    args: spawned.args,
    message: "Interactive sign-in started in the runtime.",
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

function summarizeProviderCredentials(
  authStore: OpenClawAuthStore | null | undefined,
  providerKey: string,
): { oauth: number; token: number; apiKey: number } {
  const counts = { oauth: 0, token: 0, apiKey: 0 };
  if (!authStore) return counts;

  for (const credential of Object.values(authStore.profiles)) {
    if (credential.provider !== providerKey) continue;
    if (credential.type === "oauth") counts.oauth += 1;
    if (credential.type === "token") counts.token += 1;
    if (credential.type === "api_key") counts.apiKey += 1;
  }

  return counts;
}

export function normalizeProviderAuth(
  status: OpenClawModelsStatusJson,
  providerKey: string,
  authStore?: OpenClawAuthStore | null,
): ProviderAuthSummary {
  const providerData = status.auth?.providers?.find((provider) => provider.provider === providerKey);
  const persistedCounts = authStore
    ? summarizeProviderCredentials(authStore, providerKey)
    : {
        oauth: providerData?.profiles?.oauth ?? 0,
        token: providerData?.profiles?.token ?? 0,
        apiKey: providerData?.profiles?.apiKey ?? 0,
      };
  const hasSubscription = persistedCounts.oauth > 0 || persistedCounts.token > 0;
  const hasProfileApiKey = persistedCounts.apiKey > 0;
  const hasEnvKey = !!providerData?.env?.value;
  const hasApiKey = hasProfileApiKey || hasEnvKey;
  const hasAuth = hasSubscription || hasApiKey;
  const authType: ProviderAuthSummary["authType"] = persistedCounts.oauth > 0
    ? "oauth"
    : persistedCounts.token > 0
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
  const providerKeys = new Set<string>();
  for (const provider of status.auth?.providers ?? []) {
    if (provider.provider) providerKeys.add(provider.provider);
  }
  for (const summary of authStore ? summarizeAuthProfiles(authStore) : []) {
    if (summary.provider) providerKeys.add(summary.provider);
  }
  for (const providerKey of providerKeys) {
    summaries[providerKey] = normalizeProviderAuth(status, providerKey, authStore);
  }
  return summaries;
}

export async function readDirectOpenClawAuthState(
  agentDir: string,
  agentId?: string,
  runner: OpenClawAuthRunner = new NodeProcessHost(),
  options: OpenClawCommandOptions & { cwd?: string; timeoutMs?: number } = {},
): Promise<OpenClawDirectAuthState> {
  const command = buildOpenClawCommand([
    "models",
    ...(agentId ? ["--agent", agentId] : []),
    "status",
    "--json",
  ], options);
  const result = await runner.exec(command.command, command.args, {
    cwd: options.cwd,
    env: command.env,
    timeoutMs: options.timeoutMs ?? 20_000,
  });
  const rawStatus = result.stdout.trim() || result.stderr.trim() || "{}";
  const parsed = parseOpenClawModelsStatus(rawStatus);
  const authStore = loadAuthStore(agentDir);
  const normalized = normalizeAuthSummaries(
    parsed,
    Object.keys(authStore.profiles).length > 0 ? authStore : null,
  );

  return {
    defaultModel: getDefaultOpenClawModel(parsed)?.modelId ?? null,
    providerAuth: Object.fromEntries(
      Object.values(normalized).map((summary) => [summary.provider, summary]),
    ),
  };
}

export function removeAuthProfilesForProvider(
  agentDir: string,
  provider: string,
  filesystem: AuthStoreFilesystem = new NodeFileSystemHost(),
): number {
  let removed = 0;
  const filePath = resolveAuthStorePath(agentDir);
  if (!filesystem.exists(filePath)) {
    return 0;
  }

  const store = loadAuthStore(agentDir, filesystem);
  const before = Object.keys(store.profiles).length;
  store.profiles = Object.fromEntries(
    Object.entries(store.profiles).filter(([, credential]) => credential.provider !== provider)
  );
  if (Object.keys(store.profiles).length !== before) {
    saveAuthStore(agentDir, store, filesystem);
    removed += before - Object.keys(store.profiles).length;
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
