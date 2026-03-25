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
  readJsonFile,
  resolveHomeDir,
} from "./config-utils.ts";

interface PicoClawConfigFile {
  model?: string;
  defaultModel?: string;
  workspacePath?: string;
  workspace?: {
    path?: string;
  };
  agents?: {
    defaults?: {
      model?: string;
    };
  };
}

interface PicoClawAuthStore {
  providers?: Record<string, {
    apiKey?: string;
    maskedCredential?: string | null;
  }>;
}

const PICOCLAW_WORKSPACE_FILES: RuntimeFileDescriptor[] = [
  { key: "SOUL", path: "SOUL.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "USER", path: "USER.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "AGENTS", path: "AGENTS.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "IDENTITY", path: "IDENTITY.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "MEMORY", path: "memory/MEMORY.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
];

function resolveLocations(options: RuntimeAdapterOptions): RuntimeLocations {
  const homeDir = resolveHomeDir(options.homeDir);
  const rootDir = path.join(homeDir, ".picoclaw");
  const configPath = options.configPath?.trim() || path.join(rootDir, "config.json");
  const config = readJsonFile<PicoClawConfigFile>(configPath) ?? {};
  return {
    homeDir: rootDir,
    configPath,
    workspacePath: options.workspacePath?.trim() || config.workspacePath || config.workspace?.path || path.join(rootDir, "workspace"),
    authStorePath: options.authStorePath?.trim() || path.join(rootDir, "auth.json"),
  };
}

function readConfig(locations: RuntimeLocations): PicoClawConfigFile {
  return readJsonFile<PicoClawConfigFile>(locations.configPath ?? "") ?? {};
}

function writeConfig(locations: RuntimeLocations, next: PicoClawConfigFile): void {
  if (!locations.configPath) {
    throw new Error("PicoClaw config path is required");
  }
  fs.mkdirSync(path.dirname(locations.configPath), { recursive: true });
  fs.writeFileSync(locations.configPath, `${JSON.stringify(next, null, 2)}\n`);
}

function readAuthStore(locations: RuntimeLocations): PicoClawAuthStore {
  return readJsonFile<PicoClawAuthStore>(locations.authStorePath ?? "") ?? { providers: {} };
}

function writeAuthStore(locations: RuntimeLocations, store: PicoClawAuthStore): void {
  if (!locations.authStorePath) {
    throw new Error("PicoClaw auth store path is required");
  }
  fs.mkdirSync(path.dirname(locations.authStorePath), { recursive: true });
  fs.writeFileSync(locations.authStorePath, `${JSON.stringify(store, null, 2)}\n`);
}

function deriveProvider(modelId: string): string {
  const trimmed = modelId.trim();
  if (!trimmed) return "default";
  if (trimmed.includes("/")) return trimmed.split("/")[0] || "default";
  if (trimmed.includes(":")) return trimmed.split(":")[0] || "default";
  return "default";
}

function normalizeModelList(stdout: string, fallback: DefaultModelRef | null): ModelDescriptor[] {
  const raw = stdout.trim();
  if (!raw) {
    return fallback ? [{
      id: fallback.modelId,
      modelId: fallback.modelId,
      provider: fallback.provider ?? "default",
      label: fallback.label ?? fallback.modelId,
      available: true,
      isDefault: true,
      ref: fallback,
      source: "config",
    }] : [];
  }

  try {
    const parsed = JSON.parse(raw) as Array<string | { id?: string; model?: string; name?: string; provider?: string }>;
    return parsed
      .map((entry) => {
        if (typeof entry === "string") {
          return {
            modelId: entry.trim(),
            provider: deriveProvider(entry),
          };
        }
        const modelId = entry.id?.trim() || entry.model?.trim() || entry.name?.trim() || "";
        if (!modelId) return null;
        return {
          modelId,
          provider: entry.provider?.trim() || deriveProvider(modelId),
        };
      })
      .filter((entry): entry is { modelId: string; provider: string } => !!entry?.modelId)
      .map((entry) => ({
        id: entry.modelId,
        modelId: entry.modelId,
        provider: entry.provider,
        label: entry.modelId,
        available: true,
        isDefault: fallback?.modelId === entry.modelId,
        ref: {
          provider: entry.provider,
          modelId: entry.modelId,
          label: entry.modelId,
        },
        source: "runtime" as const,
      }));
  } catch {
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((modelId) => ({
        id: modelId,
        modelId,
        provider: deriveProvider(modelId),
        label: modelId,
        available: true,
        isDefault: fallback?.modelId === modelId,
        ref: {
          provider: deriveProvider(modelId),
          modelId,
          label: modelId,
        },
        source: "runtime" as const,
      }));
  }
}

function getDefaultModelRef(locations: RuntimeLocations): DefaultModelRef | null {
  const config = readConfig(locations);
  const modelId = config.defaultModel?.trim() || config.model?.trim() || config.agents?.defaults?.model?.trim() || "";
  if (!modelId) return null;
  return {
    provider: deriveProvider(modelId),
    modelId,
    label: modelId,
  };
}

function collectProviders(models: ModelDescriptor[], auth: PicoClawAuthStore): ProviderDescriptor[] {
  const ids = new Set<string>();
  for (const model of models) ids.add(model.provider);
  for (const provider of Object.keys(auth.providers ?? {})) ids.add(provider);
  return Array.from(ids)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
    .map((provider) => ({
      id: provider,
      label: provider,
      auth: {
        supportsApiKey: true,
        supportsEnv: true,
      },
      envVars: provider === "default" ? undefined : [`${provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`],
    }));
}

function listProviderAuth(models: ModelDescriptor[], locations: RuntimeLocations, env: NodeJS.ProcessEnv): Record<string, ProviderAuthSummary> {
  const authStore = readAuthStore(locations);
  const providers = collectProviders(models, authStore);
  const summaries: Record<string, ProviderAuthSummary> = {};
  for (const provider of providers) {
    const envCredential = provider.envVars?.map((name) => env[name]?.trim()).find(Boolean) || null;
    const storeCredential = authStore.providers?.[provider.id];
    const maskedCredential = storeCredential?.maskedCredential ?? maskCredential(storeCredential?.apiKey ?? envCredential);
    summaries[provider.id] = normalizeProviderAuthSummary({
      provider: provider.id,
      hasAuth: !!storeCredential || !!envCredential,
      hasApiKey: !!storeCredential || !!envCredential,
      hasProfileApiKey: !!storeCredential,
      hasEnvKey: !!envCredential,
      authType: storeCredential ? "api_key" : envCredential ? "env" : null,
      maskedCredential,
    });
  }
  return summaries;
}

export const picoclawAdapter: RuntimeAdapter = {
  id: "picoclaw",
  runtimeName: "PicoClaw",
  stability: "experimental",
  supportLevel: "experimental",
  workspaceFiles: PICOCLAW_WORKSPACE_FILES,
  describeFeatures() {
    return defaultManagedConversationFeatures({
      channelsSupported: false,
      skillsSupported: true,
      pluginsSupported: false,
      memorySupported: true,
      schedulerSupported: true,
    });
  },
  getWorkspaceContract() {
    return { files: PICOCLAW_WORKSPACE_FILES };
  },
  resolveLocations,
  async getStatus(runner, options = { adapter: "picoclaw" }): Promise<RuntimeProbeStatus> {
    const capabilities: Record<string, boolean> = {
      version: false,
      modelList: false,
      modelSet: false,
      authLogin: false,
    };

    let cliAvailable = false;
    try {
      await runner?.exec("which", ["picoclaw"], { timeoutMs: 5_000 });
      cliAvailable = true;
    } catch {
      cliAvailable = false;
    }

    if (!cliAvailable) {
      return {
        adapter: "picoclaw",
        runtimeName: "PicoClaw",
        version: null,
        installed: false,
        cliAvailable: false,
        gatewayAvailable: false,
        capabilities,
        capabilityMap: buildRuntimeCapabilityMap({
          runtime: { supported: true, status: "error", strategy: "cli" },
          workspace: { supported: true, status: "ready", strategy: "native" },
          auth: { supported: true, status: "degraded", strategy: "config" },
          models: { supported: true, status: "degraded", strategy: "config" },
          conversation_cli: { supported: true, status: "error", strategy: "cli" },
          conversation_gateway: { supported: false, status: "unsupported", strategy: "unsupported" },
          streaming: { supported: true, status: "degraded", strategy: "cli" },
          scheduler: { supported: false, status: "unsupported", strategy: "unsupported" },
          memory: { supported: true, status: "ready", strategy: "config" },
          skills: { supported: true, status: "degraded", strategy: "derived" },
          channels: { supported: false, status: "unsupported", strategy: "unsupported" },
          sandbox: { supported: false, status: "unsupported", strategy: "unsupported" },
          plugins: { supported: false, status: "unsupported", strategy: "unsupported" },
          doctor: { supported: true, status: "ready", strategy: "derived" },
          compat: { supported: true, status: "ready", strategy: "native" },
        }),
        diagnostics: {
          lastError: "PicoClaw CLI not found",
        },
      };
    }

    let version: string | null = null;
    try {
      const result = await runner!.exec("picoclaw", ["--version"], { timeoutMs: 8_000 });
      version = result.stdout.trim() || null;
      capabilities.version = !!version;
    } catch {}

    for (const [key, args] of Object.entries({
      modelList: ["model_list", "--json"],
      modelSet: ["model", "--help"],
      authLogin: ["auth", "login", "--help"],
    })) {
      try {
        await runner!.exec("picoclaw", args, { timeoutMs: 8_000 });
        capabilities[key] = true;
      } catch {
        capabilities[key] = false;
      }
    }

    return {
      adapter: "picoclaw",
      runtimeName: "PicoClaw",
      version,
      installed: true,
      cliAvailable: true,
      gatewayAvailable: false,
      capabilities,
      capabilityMap: buildRuntimeCapabilityMap({
        runtime: { supported: true, status: "ready", strategy: "cli" },
        workspace: { supported: true, status: "ready", strategy: "native" },
        auth: { supported: true, status: capabilities.authLogin ? "ready" : "degraded", strategy: "config" },
        models: { supported: true, status: capabilities.modelList ? "ready" : "degraded", strategy: "cli" },
        conversation_cli: { supported: true, status: "ready", strategy: "cli" },
        conversation_gateway: { supported: false, status: "unsupported", strategy: "unsupported" },
        streaming: { supported: true, status: "ready", strategy: "cli" },
        scheduler: { supported: false, status: "unsupported", strategy: "unsupported" },
        memory: { supported: true, status: "ready", strategy: "config" },
        skills: { supported: true, status: "degraded", strategy: "derived" },
        channels: { supported: false, status: "unsupported", strategy: "unsupported" },
        sandbox: { supported: false, status: "unsupported", strategy: "unsupported" },
        plugins: { supported: false, status: "unsupported", strategy: "unsupported" },
        doctor: { supported: true, status: "ready", strategy: "derived" },
        compat: { supported: true, status: "ready", strategy: "native" },
      }),
      diagnostics: {
        locations: resolveLocations(options),
      },
    };
  },
  buildCompatReport(status): RuntimeCompatReport {
    const issues: string[] = [];
    if (!status.cliAvailable) issues.push("PicoClaw CLI is not installed.");
    if (status.cliAvailable && !status.capabilities.modelList) issues.push("`picoclaw model_list --json` is unavailable.");
    return buildRuntimeCompatReport({
      runtimeAdapter: "picoclaw",
      runtimeVersion: status.version,
      capabilityMap: status.capabilityMap,
      degraded: issues.length > 0,
      issues,
      diagnostics: status.diagnostics,
    });
  },
  buildDoctorReport(status) {
    const compat = this.buildCompatReport(status);
    return {
      ok: compat.issues.length === 0,
      runtime: status,
      compat,
      issues: compat.issues,
      suggestedRepairs: compat.issues.length === 0
        ? []
        : ["Install PicoClaw and verify the `picoclaw` command surface on PATH."],
    };
  },
  buildInstallCommand() {
    return { command: "brew", args: ["install", "picoclaw"] };
  },
  buildUninstallCommand() {
    return { command: "brew", args: ["uninstall", "picoclaw"] };
  },
  buildRepairCommand() {
    return { command: "picoclaw", args: ["auth", "status"] };
  },
  buildWorkspaceSetupCommand(_input: RuntimeSetupInput) {
    return { command: "picoclaw", args: ["workspace", "init"] };
  },
  buildProgressPlan(operation, input) {
    switch (operation) {
      case "install":
        return {
          operation,
          capability: runtimeOperationCapability(operation),
          steps: [
            buildProgressStep("runtime.install.prepare", "Resolve the Homebrew command for PicoClaw.", 10),
            buildProgressStep("runtime.install.execute", "Install the PicoClaw binary.", 70, this.buildInstallCommand()),
            buildProgressStep("runtime.install.finalize", "PicoClaw is ready to be probed again.", 100),
          ],
        };
      case "uninstall":
        return {
          operation,
          capability: runtimeOperationCapability(operation),
          steps: [
            buildProgressStep("runtime.uninstall.prepare", "Resolve the Homebrew uninstall command for PicoClaw.", 10),
            buildProgressStep("runtime.uninstall.execute", "Remove the PicoClaw binary.", 70, this.buildUninstallCommand()),
            buildProgressStep("runtime.uninstall.finalize", "PicoClaw has been removed from the current runtime context.", 100),
          ],
        };
      case "repair":
        return {
          operation,
          capability: runtimeOperationCapability(operation),
          steps: [
            buildProgressStep("runtime.repair.prepare", "Prepare PicoClaw auth diagnostics.", 10),
            buildProgressStep("runtime.repair.execute", "Run PicoClaw auth diagnostics.", 70, this.buildRepairCommand()),
            buildProgressStep("runtime.repair.finalize", "PicoClaw diagnostics completed.", 100),
          ],
        };
      case "setup":
        return {
          operation,
          capability: runtimeOperationCapability(operation),
          steps: [
            buildProgressStep("workspace.setup.prepare", `Prepare PicoClaw workspace setup for ${input?.agentId ?? "workspace"}.`, 10),
            buildProgressStep("workspace.setup.execute", "Initialize the PicoClaw workspace layout.", 70, this.buildWorkspaceSetupCommand(input!)),
            buildProgressStep("workspace.setup.finalize", "PicoClaw workspace initialization completed.", 100),
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
  async listProviders(runner, options): Promise<ProviderDescriptor[]> {
    const locations = resolveLocations(options);
    const defaultModel = getDefaultModelRef(locations);
    const models = await this.listModels(runner, options).catch(() => defaultModel ? [{
      id: defaultModel.modelId,
      modelId: defaultModel.modelId,
      provider: defaultModel.provider ?? "default",
      label: defaultModel.label ?? defaultModel.modelId,
      available: true,
      isDefault: true,
      ref: defaultModel,
      source: "config" as const,
    }] : []);
    return collectProviders(models, readAuthStore(locations));
  },
  async getModelCatalog(runner, options): Promise<ModelCatalog> {
    return {
      models: await this.listModels(runner, options),
      defaultModel: await this.getDefaultModel(runner, options),
    };
  },
  async listModels(runner, options): Promise<ModelDescriptor[]> {
    const locations = resolveLocations(options);
    const fallback = getDefaultModelRef(locations);
    try {
      const result = await runner.exec("picoclaw", ["model_list", "--json"], { timeoutMs: 20_000 });
      const models = normalizeModelList(result.stdout, fallback);
      if (models.length > 0) return models;
    } catch {}
    return fallback ? [{
      id: fallback.modelId,
      modelId: fallback.modelId,
      provider: fallback.provider ?? "default",
      label: fallback.label ?? fallback.modelId,
      available: true,
      isDefault: true,
      ref: fallback,
      source: "config",
    }] : [];
  },
  async getDefaultModel(_runner, options) {
    return getDefaultModelRef(resolveLocations(options));
  },
  async setDefaultModel(model, runner, options) {
    await runner.exec("picoclaw", ["model", model], { timeoutMs: 20_000 });
    const locations = resolveLocations(options);
    const config = readConfig(locations);
    writeConfig(locations, {
      ...config,
      model,
      defaultModel: model,
      agents: {
        ...config.agents,
        defaults: {
          ...config.agents?.defaults,
          model,
        },
      },
    });
    return model;
  },
  async getProviderAuth(runner, options) {
    const locations = resolveLocations(options);
    const models = await this.listModels(runner, options).catch(() => []);
    return listProviderAuth(models, locations, options.env ?? process.env);
  },
  async getAuthState(runner, options): Promise<AuthState> {
    return {
      providers: await this.getProviderAuth(runner, options),
      diagnostics: { locations: resolveLocations(options) },
    };
  },
  async login(provider, launcher, options): Promise<AuthLoginResult> {
    const spawned = launcher.spawnDetachedPty("picoclaw", ["auth", "login", "--provider", provider], {
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
    const profiles = Object.entries(store.providers ?? {})
      .filter(([providerId]) => !provider || providerId === provider)
      .map(([providerId, credential]) => ({
        profileId: `${providerId}:auth-json`,
        provider: providerId,
        authType: "api_key" as const,
        maskedCredential: credential.maskedCredential ?? maskCredential(credential.apiKey),
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
    const store = readAuthStore(locations);
    store.providers = {
      ...(store.providers ?? {}),
      [provider]: {
        apiKey: key,
        maskedCredential: maskCredential(key),
      },
    };
    writeAuthStore(locations, store);
    return {
      profileId: options.profileId ?? `${provider}:auth-json`,
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
    const store = readAuthStore(locations);
    const before = Object.keys(store.providers ?? {}).length;
    store.providers = Object.fromEntries(
      Object.entries(store.providers ?? {}).filter(([providerId]) => providerId !== provider),
    );
    writeAuthStore(locations, store);
    return before - Object.keys(store.providers ?? {}).length;
  },
  async listSchedulers(_runner, _options): Promise<SchedulerDescriptor[]> {
    return [];
  },
  async runScheduler(_id, _runner, _options): Promise<void> {},
  async setSchedulerEnabled(_id, _enabled, _runner, _options): Promise<void> {},
  async listMemory(_runner, options): Promise<MemoryDescriptor[]> {
    const locations = resolveLocations(options);
    return [{
      id: "picoclaw-memory",
      label: "PicoClaw Memory",
      kind: "file",
      path: locations.workspacePath ? path.join(locations.workspacePath, "memory", "MEMORY.md") : undefined,
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
          command: "picoclaw",
          args: ["agent", "-m", input.prompt],
          timeoutMs: 130_000,
          parser: "stdout-text",
        };
      },
      supportsGateway: false,
    };
  },
};
