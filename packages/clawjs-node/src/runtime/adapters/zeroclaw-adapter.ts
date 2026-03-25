import fs from "fs";
import path from "path";

import type {
  AuthDiagnostics,
  AuthLoginResult,
  CommandRunner,
  RuntimeAdapter,
  RuntimeAdapterOptions,
  RuntimeCompatReport,
  RuntimeConversationAdapter,
  RuntimeProbeStatus,
  RuntimeSetupInput,
  SaveApiKeyResult,
} from "../contracts.ts";
import type {
  AuthState,
  DefaultModelRef,
  ChannelDescriptor,
  MemoryDescriptor,
  ModelCatalog,
  ModelDescriptor,
  ProviderCatalog,
  ProviderAuthSummary,
  ProviderDescriptor,
  RuntimeFileDescriptor,
  RuntimeLocations,
  SchedulerDescriptor,
  SkillDescriptor,
} from "@clawjs/core";
import { maskCredential } from "@clawjs/core";

import { buildProgressStep, buildRuntimeCapabilityMap, buildRuntimeCompatReport, defaultManagedConversationFeatures, runRuntimeProgressPlan, runtimeOperationCapability } from "./shared.ts";
import {
  normalizeProviderAuthSummary,
  parseTomlStringValue,
  readJsonFile,
  readTextFile,
  resolveHomeDir,
} from "./config-utils.ts";

interface ZeroClawAuthStore {
  version?: number;
  profiles?: Record<string, {
    type?: "api_key" | "token" | "oauth";
    provider?: string;
    key?: string;
    token?: string;
    maskedCredential?: string;
  }>;
}

const ZEROCLAW_WORKSPACE_FILES: RuntimeFileDescriptor[] = [
  { key: "SOUL", path: "SOUL.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "USER", path: "USER.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "AGENTS", path: "AGENTS.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "IDENTITY", path: "IDENTITY.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "MEMORY", path: "MEMORY.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
];

const ZEROCLAW_PROVIDER_CATALOG: ProviderDescriptor[] = [
  { id: "openrouter", label: "openrouter", envVars: ["OPENROUTER_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "anthropic", label: "anthropic", envVars: ["ANTHROPIC_OAUTH_TOKEN", "ANTHROPIC_API_KEY"], auth: { supportsApiKey: true, supportsToken: true, supportsEnv: true } },
  { id: "openai", label: "openai", envVars: ["OPENAI_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "ollama", label: "ollama", local: true, envVars: ["OLLAMA_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "gemini", label: "gemini", envVars: ["GEMINI_API_KEY", "GOOGLE_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "moonshot", label: "moonshot", envVars: ["MOONSHOT_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "qwen", label: "qwen", envVars: ["QWEN_OAUTH_TOKEN", "DASHSCOPE_API_KEY"], auth: { supportsApiKey: true, supportsToken: true, supportsEnv: true } },
  { id: "groq", label: "groq", envVars: ["GROQ_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "mistral", label: "mistral", envVars: ["MISTRAL_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "xai", label: "xai", envVars: ["XAI_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "deepseek", label: "deepseek", envVars: ["DEEPSEEK_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "together", label: "together", envVars: ["TOGETHER_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "fireworks", label: "fireworks", envVars: ["FIREWORKS_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "cohere", label: "cohere", envVars: ["COHERE_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "lmstudio", label: "lmstudio", local: true, auth: { supportsEnv: false } },
  { id: "llamacpp", label: "llamacpp", local: true, envVars: ["LLAMACPP_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "sglang", label: "sglang", local: true, envVars: ["SGLANG_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "vllm", label: "vllm", local: true, envVars: ["VLLM_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
  { id: "nvidia", label: "nvidia", envVars: ["NVIDIA_API_KEY"], auth: { supportsApiKey: true, supportsEnv: true } },
];

function resolveLocations(options: RuntimeAdapterOptions): RuntimeLocations {
  const env = options.env ?? process.env;
  const homeDir = resolveHomeDir(options.homeDir);
  const rootDir = path.join(homeDir, ".zeroclaw");
  const activeWorkspacePath = path.join(rootDir, "active_workspace.toml");
  const activeWorkspace = readTextFile(activeWorkspacePath);
  const workspaceOverride = options.workspacePath?.trim() || env.ZEROCLAW_WORKSPACE?.trim() || parseTomlStringValue(activeWorkspace ?? "", "path") || parseTomlStringValue(activeWorkspace ?? "", "workspace");
  const workspacePath = workspaceOverride || path.join(rootDir, "workspace");
  const configPath = options.configPath?.trim() || (workspaceOverride ? path.join(workspacePath, "config.toml") : path.join(rootDir, "config.toml"));
  return {
    homeDir: rootDir,
    workspacePath,
    configPath,
    authStorePath: options.authStorePath?.trim() || path.join(rootDir, "auth-profiles.json"),
  };
}

function readAuthStore(locations: RuntimeLocations): ZeroClawAuthStore {
  return readJsonFile<ZeroClawAuthStore>(locations.authStorePath ?? "") ?? { profiles: {} };
}

function readConfig(locations: RuntimeLocations): string {
  return readTextFile(locations.configPath ?? "") ?? "";
}

function getDefaultProvider(locations: RuntimeLocations): string | null {
  return parseTomlStringValue(readConfig(locations), "default_provider");
}

function getDefaultModelRef(locations: RuntimeLocations): DefaultModelRef | null {
  const config = readConfig(locations);
  const modelId = parseTomlStringValue(config, "default_model");
  if (!modelId) return null;
  return {
    provider: getDefaultProvider(locations) ?? undefined,
    modelId,
    label: modelId,
  };
}

function providerCatalogMap(): Map<string, ProviderDescriptor> {
  return new Map(ZEROCLAW_PROVIDER_CATALOG.map((provider) => [provider.id, provider]));
}

function readEnvCredential(provider: ProviderDescriptor, env: NodeJS.ProcessEnv): string | null {
  for (const variable of provider.envVars ?? []) {
    const value = env[variable]?.trim();
    if (value) return value;
  }
  return null;
}

function writeTomlKey(configPath: string, key: string, value: string): void {
  const current = readTextFile(configPath) ?? "";
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const line = `${key} = "${value.replace(/"/g, '\\"')}"`;
  const next = new RegExp(`^\\s*${escaped}\\s*=\\s*"[^"]*"\\s*$`, "m").test(current)
    ? current.replace(new RegExp(`^\\s*${escaped}\\s*=\\s*"[^"]*"\\s*$`, "m"), line)
    : `${current.trimEnd()}\n${line}\n`.trimStart();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, next.endsWith("\n") ? next : `${next}\n`);
}

function listProviderAuth(locations: RuntimeLocations, env: NodeJS.ProcessEnv): Record<string, ProviderAuthSummary> {
  const catalog = providerCatalogMap();
  const authStore = readAuthStore(locations);
  const summaries: Record<string, ProviderAuthSummary> = {};

  for (const provider of ZEROCLAW_PROVIDER_CATALOG) {
    const profile = Object.entries(authStore.profiles ?? {}).find(([, credential]) => credential.provider === provider.id)?.[1];
    const envCredential = readEnvCredential(provider, env);
    const hasAuth = !!profile || !!envCredential;
    if (!hasAuth && getDefaultProvider(locations) !== provider.id) continue;

    const authType = profile?.type === "oauth" || profile?.type === "token" || profile?.type === "api_key"
      ? profile.type
      : envCredential
        ? "env"
        : null;

    summaries[provider.id] = normalizeProviderAuthSummary({
      provider: provider.id,
      hasAuth,
      hasSubscription: authType === "oauth" || authType === "token",
      hasApiKey: authType === "api_key" || authType === "env",
      hasProfileApiKey: authType === "api_key",
      hasEnvKey: !!envCredential,
      authType,
      maskedCredential: profile?.maskedCredential ?? maskCredential(profile?.key ?? profile?.token ?? envCredential),
    });
  }

  const configuredProvider = getDefaultProvider(locations);
  if (configuredProvider && !summaries[configuredProvider]) {
    const descriptor = catalog.get(configuredProvider);
    const envCredential = descriptor ? readEnvCredential(descriptor, env) : null;
    summaries[configuredProvider] = normalizeProviderAuthSummary({
      provider: configuredProvider,
      hasAuth: !!envCredential,
      hasApiKey: !!envCredential,
      hasEnvKey: !!envCredential,
      authType: envCredential ? "env" : null,
      maskedCredential: maskCredential(envCredential),
    });
  }

  return summaries;
}

export const zeroclawAdapter: RuntimeAdapter = {
  id: "zeroclaw",
  runtimeName: "ZeroClaw",
  stability: "experimental",
  supportLevel: "experimental",
  workspaceFiles: ZEROCLAW_WORKSPACE_FILES,
  describeFeatures() {
    return defaultManagedConversationFeatures({
      channelsSupported: true,
      skillsSupported: true,
      pluginsSupported: false,
      memorySupported: true,
      schedulerSupported: true,
    });
  },
  getWorkspaceContract() {
    return { files: ZEROCLAW_WORKSPACE_FILES };
  },
  resolveLocations,
  async getStatus(runner, options = { adapter: "zeroclaw" }): Promise<RuntimeProbeStatus> {
    const capabilities: Record<string, boolean> = {
      version: false,
      status: false,
      providers: false,
      doctor: false,
      gateway: false,
      daemon: false,
    };

    let cliAvailable = false;
    try {
      await runner?.exec("which", ["zeroclaw"], { timeoutMs: 5_000 });
      cliAvailable = true;
    } catch {
      cliAvailable = false;
    }

    if (!cliAvailable) {
      return {
        adapter: "zeroclaw",
        runtimeName: "ZeroClaw",
        version: null,
        cliAvailable: false,
        gatewayAvailable: false,
        capabilities,
        capabilityMap: buildRuntimeCapabilityMap({
          runtime: { supported: true, status: "error", strategy: "cli" },
          workspace: { supported: true, status: "ready", strategy: "native" },
          auth: { supported: true, status: "degraded", strategy: "config" },
          models: { supported: true, status: "degraded", strategy: "config" },
          conversation_cli: { supported: true, status: "error", strategy: "cli" },
          conversation_gateway: { supported: true, status: "unsupported", strategy: "unsupported" },
          streaming: { supported: true, status: "degraded", strategy: "cli" },
          scheduler: { supported: true, status: "degraded", strategy: "native" },
          memory: { supported: true, status: "ready", strategy: "config" },
          skills: { supported: true, status: "degraded", strategy: "derived" },
          channels: { supported: false, status: "unsupported", strategy: "unsupported" },
          sandbox: { supported: false, status: "unsupported", strategy: "unsupported" },
          plugins: { supported: false, status: "unsupported", strategy: "unsupported" },
          doctor: { supported: true, status: "ready", strategy: "native" },
          compat: { supported: true, status: "ready", strategy: "native" },
        }),
        diagnostics: {
          lastError: "ZeroClaw CLI not found",
        },
      };
    }

    let version: string | null = null;
    try {
      const result = await runner!.exec("zeroclaw", ["--version"], { timeoutMs: 8_000 });
      version = result.stdout.trim() || null;
      capabilities.version = !!version;
    } catch {}

    for (const [key, args] of Object.entries({
      status: ["status"],
      providers: ["providers"],
      doctor: ["doctor"],
      gateway: ["gateway", "--help"],
      daemon: ["daemon", "--help"],
    })) {
      try {
        await runner!.exec("zeroclaw", args, { timeoutMs: 8_000 });
        capabilities[key] = true;
      } catch {
        capabilities[key] = false;
      }
    }

    return {
      adapter: "zeroclaw",
      runtimeName: "ZeroClaw",
      version,
      cliAvailable: true,
      gatewayAvailable: capabilities.gateway,
      capabilities,
      capabilityMap: buildRuntimeCapabilityMap({
        runtime: { supported: true, status: "ready", strategy: "cli" },
        workspace: { supported: true, status: "ready", strategy: "native" },
        auth: { supported: true, status: "ready", strategy: "config" },
        models: { supported: true, status: "ready", strategy: "config" },
        conversation_cli: { supported: true, status: "ready", strategy: "cli" },
        conversation_gateway: { supported: capabilities.gateway, status: capabilities.gateway ? "ready" : "unsupported", strategy: capabilities.gateway ? "gateway" : "unsupported" },
        streaming: { supported: true, status: "ready", strategy: capabilities.gateway ? "gateway" : "cli" },
        scheduler: { supported: true, status: capabilities.daemon ? "ready" : "degraded", strategy: "native" },
        memory: { supported: true, status: "ready", strategy: "config" },
        skills: { supported: true, status: "degraded", strategy: "derived", limitations: ["Skills inventory is inferred from workspace structure."] },
        channels: { supported: false, status: "unsupported", strategy: "unsupported" },
        sandbox: { supported: false, status: "unsupported", strategy: "unsupported" },
        plugins: { supported: false, status: "unsupported", strategy: "unsupported" },
        doctor: { supported: true, status: capabilities.doctor ? "ready" : "degraded", strategy: "cli" },
        compat: { supported: true, status: "ready", strategy: "native" },
      }),
      diagnostics: {
        locations: resolveLocations(options),
      },
    };
  },
  buildCompatReport(status): RuntimeCompatReport {
    const issues: string[] = [];
    if (!status.cliAvailable) issues.push("ZeroClaw CLI is not installed.");
    if (status.cliAvailable && !status.capabilities.providers) issues.push("`zeroclaw providers` is unavailable.");
    if (status.cliAvailable && !status.capabilities.status) issues.push("`zeroclaw status` is unavailable.");
    return buildRuntimeCompatReport({
      runtimeAdapter: "zeroclaw",
      runtimeVersion: status.version,
      capabilityMap: status.capabilityMap,
      degraded: issues.length > 0,
      issues,
      diagnostics: status.diagnostics,
    });
  },
  buildDoctorReport(status) {
    const compat = this.buildCompatReport(status);
    const suggestedRepairs = !status.cliAvailable
      ? ["Install ZeroClaw and ensure the `zeroclaw` binary is on PATH."]
      : compat.issues.map((issue) => `Verify ZeroClaw command support: ${issue}`);
    return {
      ok: compat.issues.length === 0,
      runtime: status,
      compat,
      issues: compat.issues,
      suggestedRepairs,
    };
  },
  buildInstallCommand() {
    return { command: "brew", args: ["install", "zeroclaw"] };
  },
  buildUninstallCommand() {
    return { command: "brew", args: ["uninstall", "zeroclaw"] };
  },
  buildRepairCommand() {
    return { command: "zeroclaw", args: ["doctor"] };
  },
  buildWorkspaceSetupCommand(input: RuntimeSetupInput) {
    return { command: "zeroclaw", args: ["onboard", "--force"] };
  },
  buildProgressPlan(operation, input) {
    switch (operation) {
      case "install":
        return {
          operation,
          capability: runtimeOperationCapability(operation),
          steps: [
            buildProgressStep("runtime.install.prepare", "Resolve the Homebrew command for ZeroClaw.", 10),
            buildProgressStep("runtime.install.execute", "Install the ZeroClaw binary.", 70, this.buildInstallCommand()),
            buildProgressStep("runtime.install.finalize", "ZeroClaw is ready to be probed again.", 100),
          ],
        };
      case "uninstall":
        return {
          operation,
          capability: runtimeOperationCapability(operation),
          steps: [
            buildProgressStep("runtime.uninstall.prepare", "Resolve the Homebrew uninstall command for ZeroClaw.", 10),
            buildProgressStep("runtime.uninstall.execute", "Remove the ZeroClaw binary.", 70, this.buildUninstallCommand()),
            buildProgressStep("runtime.uninstall.finalize", "ZeroClaw has been removed from the current runtime context.", 100),
          ],
        };
      case "repair":
        return {
          operation,
          capability: runtimeOperationCapability(operation),
          steps: [
            buildProgressStep("runtime.repair.prepare", "Prepare ZeroClaw diagnostics.", 10),
            buildProgressStep("runtime.repair.execute", "Run ZeroClaw doctor checks.", 70, this.buildRepairCommand()),
            buildProgressStep("runtime.repair.finalize", "ZeroClaw diagnostics completed.", 100),
          ],
        };
      case "setup":
        return {
          operation,
          capability: runtimeOperationCapability(operation),
          steps: [
            buildProgressStep("workspace.setup.prepare", `Prepare ZeroClaw workspace setup for ${input?.agentId ?? "workspace"}.`, 10),
            buildProgressStep("workspace.setup.execute", "Run ZeroClaw onboarding for the target workspace.", 70, this.buildWorkspaceSetupCommand(input!)),
            buildProgressStep("workspace.setup.finalize", "ZeroClaw workspace onboarding completed.", 100),
          ],
        };
    }
  },
  install(runner, installer, onProgress) {
    return runRuntimeProgressPlan(this.buildProgressPlan("install"), runner, onProgress, 120_000);
  },
  uninstall(runner, installer, onProgress) {
    return runRuntimeProgressPlan(this.buildProgressPlan("uninstall"), runner, onProgress, 120_000);
  },
  repair(runner, onProgress) {
    return runRuntimeProgressPlan(this.buildProgressPlan("repair"), runner, onProgress, 30_000);
  },
  setupWorkspace(input, runner, onProgress) {
    return runRuntimeProgressPlan(this.buildProgressPlan("setup", input), runner, onProgress, 120_000);
  },
  async getProviderCatalog(runner, options): Promise<ProviderCatalog> {
    return { providers: await this.listProviders(runner, options) };
  },
  async listProviders(_runner, options) {
    const locations = resolveLocations(options);
    const configured = getDefaultProvider(locations);
    return ZEROCLAW_PROVIDER_CATALOG.map((provider) => ({
      ...provider,
      label: provider.id === configured ? `${provider.label} (default)` : provider.label,
    }));
  },
  async getModelCatalog(runner, options): Promise<ModelCatalog> {
    return {
      models: await this.listModels(runner, options),
      defaultModel: await this.getDefaultModel(runner, options),
    };
  },
  async listModels(_runner, options): Promise<ModelDescriptor[]> {
    const locations = resolveLocations(options);
    const defaultModel = getDefaultModelRef(locations);
    if (!defaultModel) return [];
    return [{
      id: defaultModel.modelId,
      provider: defaultModel.provider ?? "default",
      label: defaultModel.label ?? defaultModel.modelId,
      available: true,
      isDefault: true,
      ref: defaultModel,
      source: "config",
    }];
  },
  async getDefaultModel(_runner, options) {
    return getDefaultModelRef(resolveLocations(options));
  },
  async setDefaultModel(model, _runner, options) {
    const locations = resolveLocations(options);
    if (!locations.configPath) {
      throw new Error("ZeroClaw config path is required to set the default model");
    }
    writeTomlKey(locations.configPath, "default_model", model);
    return model;
  },
  async getProviderAuth(_runner, options) {
    const locations = resolveLocations(options);
    return listProviderAuth(locations, options.env ?? process.env);
  },
  async getAuthState(runner, options): Promise<AuthState> {
    return {
      providers: await this.getProviderAuth(runner, options),
      diagnostics: { locations: resolveLocations(options) },
    };
  },
  async login(provider, launcher, options): Promise<AuthLoginResult> {
    const spawned = launcher.spawnDetachedPty("zeroclaw", ["onboard", "--force", "--provider", provider], {
      cwd: options.cwd,
      env: options.env,
    });
    return {
      provider,
      pid: spawned.pid,
      command: spawned.command,
      args: spawned.args,
    };
  },
  diagnostics(provider, options): AuthDiagnostics {
    const locations = resolveLocations(options);
    const store = readAuthStore(locations);
    const profiles = Object.entries(store.profiles ?? {})
      .filter(([, credential]) => !provider || credential.provider === provider)
      .map(([profileId, credential]) => ({
        profileId,
        provider: credential.provider ?? provider ?? "unknown",
        authType: credential.type ?? "token",
        maskedCredential: credential.maskedCredential ?? maskCredential(credential.key ?? credential.token),
      }));
    return {
      provider,
      authStorePath: locations.authStorePath,
      profiles,
      issues: [],
    };
  },
  setApiKey(provider, key, options) {
    const locations = resolveLocations(options);
    if (!locations.configPath) {
      throw new Error("ZeroClaw config path is required to persist API keys");
    }
    writeTomlKey(locations.configPath, "default_provider", provider);
    writeTomlKey(locations.configPath, "api_key", key);
    return {
      profileId: options.profileId ?? `${provider}:config`,
      provider,
      authType: "api_key",
      maskedCredential: maskCredential(key),
    };
  },
  async saveApiKey(provider, key, _runner, options): Promise<SaveApiKeyResult> {
    return {
      summary: this.setApiKey(provider, key, options),
      mode: "store",
    };
  },
  removeProvider(provider, options) {
    const locations = resolveLocations(options);
    const authStore = readAuthStore(locations);
    const before = Object.keys(authStore.profiles ?? {}).length;
    authStore.profiles = Object.fromEntries(
      Object.entries(authStore.profiles ?? {}).filter(([, credential]) => credential.provider !== provider),
    );
    if (locations.authStorePath) {
      fs.mkdirSync(path.dirname(locations.authStorePath), { recursive: true });
      fs.writeFileSync(locations.authStorePath, `${JSON.stringify(authStore, null, 2)}\n`);
    }
    return before - Object.keys(authStore.profiles ?? {}).length;
  },
  async listSchedulers(_runner, options): Promise<SchedulerDescriptor[]> {
    const status = await this.getStatus(undefined, options);
    return [{
      id: "zeroclaw-daemon",
      label: "ZeroClaw Daemon",
      enabled: status.capabilities.daemon,
      status: status.capabilities.daemon ? "idle" : "unknown",
      kind: "daemon",
    }];
  },
  async runScheduler(_id, _runner, _options): Promise<void> {},
  async setSchedulerEnabled(_id, _enabled, _runner, _options): Promise<void> {},
  async listMemory(_runner, options): Promise<MemoryDescriptor[]> {
    const locations = resolveLocations(options);
    return [{
      id: "zeroclaw-memory",
      label: "ZeroClaw Memory",
      kind: "file",
      path: locations.workspacePath ? path.join(locations.workspacePath, "MEMORY.md") : undefined,
    }];
  },
  async searchMemory(query, runner, options): Promise<MemoryDescriptor[]> {
    return (await this.listMemory(runner, options)).filter((entry) => entry.label.toLowerCase().includes(query.toLowerCase()) || (entry.path ?? "").toLowerCase().includes(query.toLowerCase()));
  },
  async listSkills(_runner, options): Promise<SkillDescriptor[]> {
    const locations = resolveLocations(options);
    return [{
      id: "workspace-skills",
      label: "Workspace Skills",
      enabled: true,
      scope: "workspace",
      path: locations.workspacePath ? path.join(locations.workspacePath, "skills") : undefined,
    }];
  },
  async syncSkills(runner, options): Promise<SkillDescriptor[]> {
    return this.listSkills(runner, options);
  },
  async listChannels(_runner, _options): Promise<ChannelDescriptor[]> {
    return [];
  },
  createConversationAdapter(_options): RuntimeConversationAdapter {
    return {
      transport: {
        kind: "cli",
        streaming: true,
      },
      gateway: null,
      buildCliInvocation(input) {
        return {
          command: "zeroclaw",
          args: ["agent", "-m", input.prompt],
          timeoutMs: 130_000,
          parser: "stdout-text",
        };
      },
      supportsGateway: false,
    };
  },
};
