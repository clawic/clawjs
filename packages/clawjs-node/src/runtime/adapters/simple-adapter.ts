import fs from "fs";
import path from "path";

import type {
  AuthDiagnostics,
  AuthLoginResult,
  CommandRunner,
  ConversationCliInvocation,
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
  ChannelDescriptor,
  DefaultModelRef,
  MemoryDescriptor,
  ModelCatalog,
  ModelDescriptor,
  ProviderCatalog,
  ProviderAuthSummary,
  ProviderDescriptor,
  RuntimeAdapterStability,
  RuntimeAdapterSupportLevel,
  RuntimeCapabilityKey,
  RuntimeCapabilitySupport,
  RuntimeFileDescriptor,
  RuntimeLocations,
  SchedulerDescriptor,
  SkillDescriptor,
} from "@clawjs/core";
import { maskCredential } from "@clawjs/core";

import { buildProgressStep, buildRuntimeCapabilityMap, buildRuntimeCompatReport, defaultManagedConversationFeatures, runRuntimeProgressPlan, runtimeOperationCapability } from "./shared.ts";
import { ensureParentDir, normalizeProviderAuthSummary, readJsonFile, resolveHomeDir } from "./config-utils.ts";

interface SimpleAuthStore {
  providers?: Record<string, {
    apiKey?: string;
    maskedCredential?: string | null;
  }>;
}

interface SimpleRuntimeAdapterSpec {
  id: RuntimeAdapter["id"];
  runtimeName: string;
  stability?: RuntimeAdapterStability;
  supportLevel?: RuntimeAdapterSupportLevel;
  recommended?: boolean;
  binary: string;
  workspaceFiles: RuntimeFileDescriptor[];
  homeDirName: string;
  configFileName?: string;
  authFileName?: string;
  workspaceDirName?: string;
  versionArgs?: string[];
  installCommand?: { command: string; args: string[] };
  uninstallCommand?: { command: string; args: string[] };
  repairCommand?: { command: string; args: string[] };
  setupCommand?: (input: RuntimeSetupInput) => { command: string; args: string[] };
  probeCommands?: Record<string, string[]>;
  providerCatalog?: ProviderDescriptor[];
  defaultModelKeys?: string[];
  modelListCommand?: string[];
  setDefaultModelArgs?: (model: string) => string[];
  loginArgs?: (provider: string) => string[];
  conversationCli: (input: { sessionId: string; agentId?: string; prompt: string; model?: string }) => ConversationCliInvocation;
  gatewaySupport?: boolean;
  capabilityOverrides?: Partial<Record<RuntimeCapabilityKey, Partial<RuntimeCapabilitySupport>>>;
  defaultSchedulers?: SchedulerDescriptor[] | ((locations: RuntimeLocations) => SchedulerDescriptor[]);
  defaultMemory?: MemoryDescriptor[] | ((locations: RuntimeLocations) => MemoryDescriptor[]);
  defaultSkills?: SkillDescriptor[] | ((locations: RuntimeLocations) => SkillDescriptor[]);
  defaultChannels?: ChannelDescriptor[] | ((locations: RuntimeLocations) => ChannelDescriptor[]);
}

function resolveLocations(spec: SimpleRuntimeAdapterSpec, options: RuntimeAdapterOptions): RuntimeLocations {
  const homeDir = resolveHomeDir(options.homeDir);
  const rootDir = path.join(homeDir, spec.homeDirName);
  return {
    homeDir: rootDir,
    configPath: options.configPath?.trim() || (spec.configFileName ? path.join(rootDir, spec.configFileName) : undefined),
    workspacePath: options.workspacePath?.trim() || path.join(rootDir, spec.workspaceDirName ?? "workspace"),
    authStorePath: options.authStorePath?.trim() || (spec.authFileName ? path.join(rootDir, spec.authFileName) : undefined),
  };
}

function readConfig(locations: RuntimeLocations): Record<string, unknown> {
  return readJsonFile<Record<string, unknown>>(locations.configPath ?? "") ?? {};
}

function writeConfig(locations: RuntimeLocations, config: Record<string, unknown>): void {
  if (!locations.configPath) return;
  ensureParentDir(locations.configPath);
  fs.writeFileSync(locations.configPath, `${JSON.stringify(config, null, 2)}\n`);
}

function readAuthStore(locations: RuntimeLocations): SimpleAuthStore {
  return readJsonFile<SimpleAuthStore>(locations.authStorePath ?? "") ?? { providers: {} };
}

function writeAuthStore(locations: RuntimeLocations, store: SimpleAuthStore): void {
  if (!locations.authStorePath) return;
  ensureParentDir(locations.authStorePath);
  fs.writeFileSync(locations.authStorePath, `${JSON.stringify(store, null, 2)}\n`);
}

function deriveDefaultModel(spec: SimpleRuntimeAdapterSpec, locations: RuntimeLocations): DefaultModelRef | null {
  const config = readConfig(locations);
  for (const key of spec.defaultModelKeys ?? ["defaultModel", "model"]) {
    const value = config[key];
    if (typeof value === "string" && value.trim()) {
      const modelId = value.trim();
      return {
        provider: modelId.includes("/") ? modelId.split("/")[0] : undefined,
        modelId,
        label: modelId,
      };
    }
  }
  return null;
}

function deriveProviders(spec: SimpleRuntimeAdapterSpec, locations: RuntimeLocations, models: ModelDescriptor[]): ProviderDescriptor[] {
  if (spec.providerCatalog && spec.providerCatalog.length > 0) {
    return spec.providerCatalog;
  }
  const authStore = readAuthStore(locations);
  const ids = new Set<string>();
  for (const model of models) ids.add(model.provider);
  for (const provider of Object.keys(authStore.providers ?? {})) ids.add(provider);
  return Array.from(ids)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
    .map((id) => ({
      id,
      label: id,
      envVars: [`${id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`],
      auth: { supportsApiKey: true, supportsEnv: true },
    }));
}

function deriveProviderAuth(providers: ProviderDescriptor[], locations: RuntimeLocations, env: NodeJS.ProcessEnv): Record<string, ProviderAuthSummary> {
  const authStore = readAuthStore(locations);
  return Object.fromEntries(providers.map((provider) => {
    const envCredential = provider.envVars?.map((name) => env[name]?.trim()).find(Boolean) || null;
    const stored = authStore.providers?.[provider.id];
    return [provider.id, normalizeProviderAuthSummary({
      provider: provider.id,
      hasAuth: !!stored || !!envCredential,
      hasApiKey: !!stored || !!envCredential,
      hasProfileApiKey: !!stored,
      hasEnvKey: !!envCredential,
      authType: stored ? "api_key" : envCredential ? "env" : null,
      maskedCredential: stored?.maskedCredential ?? maskCredential(stored?.apiKey ?? envCredential),
    })];
  }));
}

function resolveDescriptors<TValue>(value: TValue[] | ((locations: RuntimeLocations) => TValue[]) | undefined, locations: RuntimeLocations): TValue[] {
  if (!value) return [];
  return typeof value === "function" ? value(locations) : value;
}

export function createSimpleRuntimeAdapter(spec: SimpleRuntimeAdapterSpec): RuntimeAdapter {
  return {
    id: spec.id,
    runtimeName: spec.runtimeName,
    stability: spec.stability ?? "experimental",
    supportLevel: spec.supportLevel ?? "experimental",
    ...(spec.recommended ? { recommended: spec.recommended } : {}),
    workspaceFiles: spec.workspaceFiles,
    describeFeatures(options) {
      const locations = resolveLocations(spec, options);
      return defaultManagedConversationFeatures({
        channelsSupported: resolveDescriptors(spec.defaultChannels, locations).length > 0 || !!spec.gatewaySupport,
        skillsSupported: true,
        pluginsSupported: false,
        memorySupported: true,
        schedulerSupported: resolveDescriptors(spec.defaultSchedulers, locations).length > 0,
      });
    },
    getWorkspaceContract() {
      return { files: spec.workspaceFiles };
    },
    resolveLocations(options) {
      return resolveLocations(spec, options);
    },
    async getStatus(runner, options = { adapter: spec.id }): Promise<RuntimeProbeStatus> {
      const capabilities: Record<string, boolean> = {
        version: false,
        modelList: false,
        authLogin: false,
        conversationCli: true,
        ...(spec.gatewaySupport ? { gateway: false } : {}),
        ...Object.fromEntries(Object.keys(spec.probeCommands ?? {}).map((key) => [key, false])),
      };
      let cliAvailable = false;
      try {
        await runner?.exec("which", [spec.binary], { timeoutMs: 5_000 });
        cliAvailable = true;
      } catch {
        cliAvailable = false;
      }
      if (!cliAvailable) {
        return {
          adapter: spec.id,
          runtimeName: spec.runtimeName,
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
            conversation_gateway: { supported: !!spec.gatewaySupport, status: spec.gatewaySupport ? "degraded" : "unsupported", strategy: spec.gatewaySupport ? "gateway" : "unsupported" },
            streaming: { supported: true, status: "degraded", strategy: spec.gatewaySupport ? "gateway" : "cli" },
            scheduler: { supported: resolveDescriptors(spec.defaultSchedulers, resolveLocations(spec, options)).length > 0, status: resolveDescriptors(spec.defaultSchedulers, resolveLocations(spec, options)).length > 0 ? "degraded" : "unsupported", strategy: "config" },
            memory: { supported: true, status: "ready", strategy: "config" },
            skills: { supported: true, status: "degraded", strategy: "derived" },
            channels: { supported: resolveDescriptors(spec.defaultChannels, resolveLocations(spec, options)).length > 0, status: resolveDescriptors(spec.defaultChannels, resolveLocations(spec, options)).length > 0 ? "degraded" : "unsupported", strategy: "config" },
            sandbox: { supported: false, status: "unsupported", strategy: "unsupported" },
            plugins: { supported: false, status: "unsupported", strategy: "unsupported" },
            doctor: { supported: true, status: "ready", strategy: "derived" },
            compat: { supported: true, status: "ready", strategy: "native" },
            ...(spec.capabilityOverrides ?? {}),
          }),
          diagnostics: {
            lastError: `${spec.binary} CLI not found`,
            locations: resolveLocations(spec, options),
          },
        };
      }
      let version: string | null = null;
      try {
        const result = await runner!.exec(spec.binary, spec.versionArgs ?? ["--version"], { timeoutMs: 8_000 });
        version = result.stdout.trim() || null;
        capabilities.version = !!version;
      } catch {}
      if (spec.modelListCommand) {
        try {
          await runner!.exec(spec.binary, spec.modelListCommand, { timeoutMs: 10_000 });
          capabilities.modelList = true;
        } catch {}
      }
      if (spec.loginArgs) {
        try {
          await runner!.exec(spec.binary, spec.loginArgs("test-provider"), { timeoutMs: 5_000 });
          capabilities.authLogin = true;
        } catch {}
      }
      for (const [key, args] of Object.entries(spec.probeCommands ?? {})) {
        try {
          await runner!.exec(spec.binary, args, { timeoutMs: 8_000 });
          capabilities[key] = true;
        } catch {
          capabilities[key] = false;
        }
      }
      const gatewayAvailable = !!(spec.gatewaySupport && options.gateway?.url);
      const locations = resolveLocations(spec, options);
      return {
        adapter: spec.id,
        runtimeName: spec.runtimeName,
        version,
        cliAvailable: true,
        gatewayAvailable,
        capabilities,
        capabilityMap: buildRuntimeCapabilityMap({
          runtime: { supported: true, status: "ready", strategy: "cli" },
          workspace: { supported: true, status: "ready", strategy: "native" },
          auth: { supported: true, status: "ready", strategy: "config" },
          models: { supported: true, status: capabilities.modelList ? "ready" : "degraded", strategy: spec.modelListCommand ? "cli" : "config" },
          conversation_cli: { supported: true, status: "ready", strategy: "cli" },
          conversation_gateway: { supported: !!spec.gatewaySupport, status: gatewayAvailable ? "ready" : spec.gatewaySupport ? "degraded" : "unsupported", strategy: spec.gatewaySupport ? "gateway" : "unsupported" },
          streaming: { supported: true, status: "ready", strategy: gatewayAvailable ? "gateway" : "cli" },
          scheduler: { supported: resolveDescriptors(spec.defaultSchedulers, locations).length > 0, status: resolveDescriptors(spec.defaultSchedulers, locations).length > 0 ? "ready" : "unsupported", strategy: "config" },
          memory: { supported: true, status: "ready", strategy: "config" },
          skills: { supported: true, status: "ready", strategy: "derived" },
          channels: { supported: resolveDescriptors(spec.defaultChannels, locations).length > 0, status: resolveDescriptors(spec.defaultChannels, locations).length > 0 ? "ready" : "unsupported", strategy: "config" },
          sandbox: { supported: false, status: "unsupported", strategy: "unsupported" },
          plugins: { supported: false, status: "unsupported", strategy: "unsupported" },
          doctor: { supported: true, status: "ready", strategy: "derived" },
          compat: { supported: true, status: "ready", strategy: "native" },
          ...(spec.capabilityOverrides ?? {}),
        }),
        diagnostics: {
          locations,
        },
      };
    },
    buildCompatReport(status): RuntimeCompatReport {
      const issues = [
        ...(status.cliAvailable ? [] : [`${spec.runtimeName} CLI is not installed.`]),
      ];
      return buildRuntimeCompatReport({
        runtimeAdapter: spec.id,
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
        suggestedRepairs: compat.issues.length > 0 ? [`Install ${spec.runtimeName} and ensure \`${spec.binary}\` is on PATH.`] : [],
      };
    },
    buildInstallCommand() {
      return spec.installCommand ?? { command: "brew", args: ["install", spec.binary] };
    },
    buildUninstallCommand() {
      return spec.uninstallCommand ?? { command: "brew", args: ["uninstall", spec.binary] };
    },
    buildRepairCommand() {
      return spec.repairCommand ?? { command: spec.binary, args: ["doctor"] };
    },
    buildWorkspaceSetupCommand(input) {
      return spec.setupCommand?.(input) ?? { command: spec.binary, args: ["workspace", "init"] };
    },
    buildProgressPlan(operation, input) {
      switch (operation) {
        case "install":
          return {
            operation,
            capability: runtimeOperationCapability(operation),
            steps: [
              buildProgressStep("runtime.install.prepare", `Resolve install command for ${spec.runtimeName}.`, 10),
              buildProgressStep("runtime.install.execute", `Install the ${spec.runtimeName} binary.`, 70, this.buildInstallCommand()),
              buildProgressStep("runtime.install.finalize", `${spec.runtimeName} is ready to be probed again.`, 100),
            ],
          };
        case "uninstall":
          return {
            operation,
            capability: runtimeOperationCapability(operation),
            steps: [
              buildProgressStep("runtime.uninstall.prepare", `Resolve uninstall command for ${spec.runtimeName}.`, 10),
              buildProgressStep("runtime.uninstall.execute", `Remove the ${spec.runtimeName} binary.`, 70, this.buildUninstallCommand()),
              buildProgressStep("runtime.uninstall.finalize", `${spec.runtimeName} has been removed from the current runtime context.`, 100),
            ],
          };
        case "repair":
          return {
            operation,
            capability: runtimeOperationCapability(operation),
            steps: [
              buildProgressStep("runtime.repair.prepare", `Prepare ${spec.runtimeName} diagnostics.`, 10),
              buildProgressStep("runtime.repair.execute", `Run ${spec.runtimeName} repair or diagnostics.`, 70, this.buildRepairCommand()),
              buildProgressStep("runtime.repair.finalize", `${spec.runtimeName} diagnostics completed.`, 100),
            ],
          };
        case "setup":
          return {
            operation,
            capability: runtimeOperationCapability(operation),
            steps: [
              buildProgressStep("workspace.setup.prepare", `Prepare ${spec.runtimeName} workspace setup for ${input?.agentId ?? "workspace"}.`, 10),
              buildProgressStep("workspace.setup.execute", `Initialize the ${spec.runtimeName} workspace.`, 70, this.buildWorkspaceSetupCommand(input!)),
              buildProgressStep("workspace.setup.finalize", `${spec.runtimeName} workspace initialization completed.`, 100),
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
      return deriveProviders(spec, resolveLocations(spec, options), await this.listModels(runner, options));
    },
    async getModelCatalog(runner, options): Promise<ModelCatalog> {
      return {
        models: await this.listModels(runner, options),
        defaultModel: await this.getDefaultModel(runner, options),
      };
    },
    async listModels(runner, options): Promise<ModelDescriptor[]> {
      const locations = resolveLocations(spec, options);
      const fallback = deriveDefaultModel(spec, locations);
      if (spec.modelListCommand) {
        try {
          const result = await runner.exec(spec.binary, spec.modelListCommand, { timeoutMs: 20_000 });
          const parsed = JSON.parse(result.stdout) as Array<string | { id?: string; model?: string; provider?: string; name?: string }>;
          const mapped = parsed.map((entry): ModelDescriptor | null => {
            if (typeof entry === "string") {
              return {
                id: entry,
                provider: entry.includes("/") ? entry.split("/")[0] : "default",
                label: entry,
                available: true,
                isDefault: fallback?.modelId === entry,
                ref: {
                  provider: entry.includes("/") ? entry.split("/")[0] : undefined,
                  modelId: entry,
                  label: entry,
                },
                source: "runtime" as const,
              };
            }
            const modelId = entry.id ?? entry.model ?? entry.name;
            if (!modelId) return null;
            const provider = entry.provider ?? (modelId.includes("/") ? modelId.split("/")[0] : "default");
            return {
              id: modelId,
              provider,
              label: modelId,
              available: true,
              isDefault: fallback?.modelId === modelId,
              ref: { provider, modelId, label: modelId },
              source: "runtime" as const,
            };
          });
          const models = mapped.filter((entry): entry is ModelDescriptor => entry !== null);
          if (models.length > 0) return models;
        } catch {}
      }
      return fallback ? [{
        id: fallback.modelId,
        provider: fallback.provider ?? "default",
        label: fallback.label ?? fallback.modelId,
        available: true,
        isDefault: true,
        ref: fallback,
        source: "config",
      }] : [];
    },
    async getDefaultModel(_runner, options) {
      return deriveDefaultModel(spec, resolveLocations(spec, options));
    },
    async setDefaultModel(model, runner, options) {
      if (spec.setDefaultModelArgs) {
        try {
          await runner.exec(spec.binary, spec.setDefaultModelArgs(model), { timeoutMs: 20_000 });
        } catch {
          // config fallback below
        }
      }
      const locations = resolveLocations(spec, options);
      const config = readConfig(locations);
      const next = { ...config };
      for (const key of spec.defaultModelKeys ?? ["defaultModel", "model"]) {
        next[key] = model;
      }
      writeConfig(locations, next);
      return model;
    },
    async getAuthState(runner, options): Promise<AuthState> {
      return {
        providers: await this.getProviderAuth(runner, options),
        diagnostics: { locations: resolveLocations(spec, options) },
      };
    },
    async getProviderAuth(runner, options) {
      const locations = resolveLocations(spec, options);
      const providers = await this.listProviders(runner, options);
      return deriveProviderAuth(providers, locations, options.env ?? process.env);
    },
    async login(provider, launcher, options): Promise<AuthLoginResult> {
      const args = spec.loginArgs?.(provider) ?? ["auth", "login", "--provider", provider];
      const spawned = launcher.spawnDetachedPty(spec.binary, args, {
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
      const locations = resolveLocations(spec, options);
      const store = readAuthStore(locations);
      return {
        provider,
        authStorePath: locations.authStorePath,
        profiles: Object.entries(store.providers ?? {})
          .filter(([providerId]) => !provider || providerId === provider)
          .map(([providerId, credential]) => ({
            profileId: `${providerId}:store`,
            provider: providerId,
            authType: "api_key",
            maskedCredential: credential.maskedCredential ?? maskCredential(credential.apiKey),
          })),
        issues: [],
      };
    },
    setApiKey(provider, key, options) {
      const locations = resolveLocations(spec, options);
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
        profileId: options.profileId ?? `${provider}:store`,
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
      const locations = resolveLocations(spec, options);
      const store = readAuthStore(locations);
      const before = Object.keys(store.providers ?? {}).length;
      store.providers = Object.fromEntries(
        Object.entries(store.providers ?? {}).filter(([providerId]) => providerId !== provider),
      );
      writeAuthStore(locations, store);
      return before - Object.keys(store.providers ?? {}).length;
    },
    async listSchedulers(_runner, options): Promise<SchedulerDescriptor[]> {
      return resolveDescriptors(spec.defaultSchedulers, resolveLocations(spec, options));
    },
    async runScheduler(_id, _runner, _options): Promise<void> {},
    async setSchedulerEnabled(_id, _enabled, _runner, _options): Promise<void> {},
    async listMemory(_runner, options): Promise<MemoryDescriptor[]> {
      const locations = resolveLocations(spec, options);
      const defaults = resolveDescriptors(spec.defaultMemory, locations);
      return defaults.length > 0 ? defaults : [{
        id: `${spec.id}-memory`,
        label: `${spec.runtimeName} Memory`,
        kind: "store",
        path: locations.workspacePath,
      }];
    },
    async searchMemory(query, runner, options): Promise<MemoryDescriptor[]> {
      return (await this.listMemory(runner, options)).filter((entry) => `${entry.id} ${entry.label} ${entry.summary ?? ""} ${entry.path ?? ""}`.toLowerCase().includes(query.toLowerCase()));
    },
    async listSkills(_runner, options): Promise<SkillDescriptor[]> {
      const locations = resolveLocations(spec, options);
      const defaults = resolveDescriptors(spec.defaultSkills, locations);
      return defaults.length > 0 ? defaults : [{
        id: `${spec.id}-skills`,
        label: `${spec.runtimeName} Skills`,
        enabled: true,
        scope: "workspace",
        path: locations.workspacePath ? path.join(locations.workspacePath, "skills") : undefined,
      }];
    },
    async syncSkills(runner, options): Promise<SkillDescriptor[]> {
      return this.listSkills(runner, options);
    },
    async listChannels(_runner, options): Promise<ChannelDescriptor[]> {
      return resolveDescriptors(spec.defaultChannels, resolveLocations(spec, options));
    },
    createConversationAdapter(options): RuntimeConversationAdapter {
      return {
        transport: {
          kind: spec.gatewaySupport && options.gateway?.url ? "hybrid" : "cli",
          streaming: true,
          ...(spec.gatewaySupport && options.gateway?.url ? { gatewayKind: "openai-chat-completions" as const } : {}),
        },
        gateway: spec.gatewaySupport && options.gateway?.url ? {
          kind: "openai-chat-completions",
          url: options.gateway.url,
          ...(options.gateway.token ? { token: options.gateway.token } : {}),
        } : null,
        buildCliInvocation(input) {
          return spec.conversationCli(input);
        },
        supportsGateway: !!spec.gatewaySupport,
      };
    },
  };
}
