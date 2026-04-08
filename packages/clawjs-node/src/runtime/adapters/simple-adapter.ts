import fs from "fs";
import path from "path";

import type {
  AuthDiagnostics,
  AuthLoginResult,
  CommandRunner,
  ConversationCliInvocation,
  ConversationGatewayDescriptor,
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
  RuntimeCapabilityMap,
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
  gatewayKind?: ConversationGatewayDescriptor["kind"];
  conversationDetails?: (options: RuntimeAdapterOptions, locations: RuntimeLocations) => {
    primaryTransport?: "cli" | "gateway";
    fallbackTransport?: "cli" | "gateway" | "none";
    sessionPersistence?: "ephemeral" | "workspace" | "runtime" | "agent";
    streamingMode?: "none" | "cli" | "gateway" | "hybrid";
    sessionPath?: string;
  };
  capabilityDeclarations?: Partial<Record<RuntimeCapabilityKey, Partial<RuntimeCapabilitySupport>>>;
  capabilityOverrides?: Partial<Record<RuntimeCapabilityKey, Partial<RuntimeCapabilitySupport>>>;
  resourceLoaders?: Partial<{
    listProviders: (runner: CommandRunner, options: RuntimeAdapterOptions, locations: RuntimeLocations) => Promise<ProviderDescriptor[]>;
    listModels: (runner: CommandRunner, options: RuntimeAdapterOptions, locations: RuntimeLocations, fallback: DefaultModelRef | null) => Promise<ModelDescriptor[]>;
    listSchedulers: (runner: CommandRunner, options: RuntimeAdapterOptions, locations: RuntimeLocations) => Promise<SchedulerDescriptor[]>;
    listMemory: (runner: CommandRunner, options: RuntimeAdapterOptions, locations: RuntimeLocations) => Promise<MemoryDescriptor[]>;
    listSkills: (runner: CommandRunner, options: RuntimeAdapterOptions, locations: RuntimeLocations) => Promise<SkillDescriptor[]>;
    listChannels: (runner: CommandRunner, options: RuntimeAdapterOptions, locations: RuntimeLocations) => Promise<ChannelDescriptor[]>;
  }>;
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

function buildDeclaredCapabilityMap(spec: SimpleRuntimeAdapterSpec, options: RuntimeAdapterOptions): RuntimeCapabilityMap {
  const locations = resolveLocations(spec, options);
  return buildRuntimeCapabilityMap({
    runtime: {
      supported: true,
      status: "detected",
      strategy: "cli",
      diagnostics: { source: "runtime", probeMethod: "cli", inventoryFreshness: "live" },
    },
    workspace: {
      supported: true,
      status: "ready",
      strategy: "native",
      diagnostics: { source: "workspace", probeMethod: "filesystem", inventoryFreshness: "live" },
    },
    auth: {
      supported: true,
      status: "detected",
      strategy: "config",
      diagnostics: { source: "config", probeMethod: "config", inventoryFreshness: "live" },
    },
    models: {
      supported: true,
      status: spec.modelListCommand ? "detected" : "degraded",
      strategy: spec.modelListCommand ? "cli" : "config",
      diagnostics: { source: spec.modelListCommand ? "runtime" : "config", probeMethod: spec.modelListCommand ? "cli" : "config", inventoryFreshness: spec.modelListCommand ? "live" : "cached" },
    },
    conversation_cli: {
      supported: true,
      status: "detected",
      strategy: "cli",
      diagnostics: { source: "runtime", probeMethod: "cli", transport: "cli", inventoryFreshness: "live" },
    },
    conversation_gateway: {
      supported: !!spec.gatewaySupport,
      status: spec.gatewaySupport ? "detected" : "unsupported",
      strategy: spec.gatewaySupport ? "gateway" : "unsupported",
      diagnostics: spec.gatewaySupport ? { source: "gateway", probeMethod: "gateway", transport: "gateway", inventoryFreshness: "live" } : undefined,
    },
    streaming: {
      supported: true,
      status: "detected",
      strategy: spec.gatewaySupport ? "gateway" : "cli",
      diagnostics: { source: spec.gatewaySupport ? "gateway" : "runtime", probeMethod: spec.gatewaySupport ? "gateway" : "cli", transport: spec.gatewaySupport ? "gateway" : "cli", inventoryFreshness: "live" },
    },
    scheduler: {
      supported: resolveDescriptors(spec.defaultSchedulers, locations).length > 0 || !!spec.resourceLoaders?.listSchedulers,
      status: resolveDescriptors(spec.defaultSchedulers, locations).length > 0 || !!spec.resourceLoaders?.listSchedulers ? "detected" : "unsupported",
      strategy: spec.resourceLoaders?.listSchedulers ? "native" : "config",
      diagnostics: resolveDescriptors(spec.defaultSchedulers, locations).length > 0 || !!spec.resourceLoaders?.listSchedulers
        ? { source: spec.resourceLoaders?.listSchedulers ? "runtime" : "config", probeMethod: spec.resourceLoaders?.listSchedulers ? "filesystem" : "config", inventoryFreshness: spec.resourceLoaders?.listSchedulers ? "live" : "static" }
        : undefined,
    },
    memory: {
      supported: true,
      status: "detected",
      strategy: spec.resourceLoaders?.listMemory ? "bridge" : "config",
      diagnostics: { source: spec.resourceLoaders?.listMemory ? "workspace" : "config", probeMethod: spec.resourceLoaders?.listMemory ? "filesystem" : "config", inventoryFreshness: spec.resourceLoaders?.listMemory ? "live" : "static" },
    },
    skills: {
      supported: true,
      status: "detected",
      strategy: spec.resourceLoaders?.listSkills ? "native" : "derived",
      diagnostics: { source: spec.resourceLoaders?.listSkills ? "workspace" : "derived", probeMethod: spec.resourceLoaders?.listSkills ? "filesystem" : "derived", inventoryFreshness: spec.resourceLoaders?.listSkills ? "live" : "derived" },
    },
    channels: {
      supported: resolveDescriptors(spec.defaultChannels, locations).length > 0 || !!spec.gatewaySupport || !!spec.resourceLoaders?.listChannels,
      status: resolveDescriptors(spec.defaultChannels, locations).length > 0 || !!spec.gatewaySupport || !!spec.resourceLoaders?.listChannels ? "detected" : "unsupported",
      strategy: spec.resourceLoaders?.listChannels ? "native" : spec.gatewaySupport ? "gateway" : "config",
      diagnostics: resolveDescriptors(spec.defaultChannels, locations).length > 0 || !!spec.gatewaySupport || !!spec.resourceLoaders?.listChannels
        ? { source: spec.resourceLoaders?.listChannels ? "runtime" : spec.gatewaySupport ? "gateway" : "config", probeMethod: spec.resourceLoaders?.listChannels ? "cli" : spec.gatewaySupport ? "gateway" : "config", inventoryFreshness: spec.resourceLoaders?.listChannels ? "live" : "static" }
        : undefined,
    },
    sandbox: {
      supported: false,
      status: "unsupported",
      strategy: "unsupported",
    },
    plugins: {
      supported: false,
      status: "unsupported",
      strategy: "unsupported",
    },
    doctor: {
      supported: true,
      status: "ready",
      strategy: "derived",
      diagnostics: { source: "derived", probeMethod: "none", inventoryFreshness: "static" },
    },
    compat: {
      supported: true,
      status: "ready",
      strategy: "native",
      diagnostics: { source: "derived", probeMethod: "none", inventoryFreshness: "static" },
    },
    ...(spec.capabilityDeclarations ?? {}),
    ...(spec.capabilityOverrides ?? {}),
  });
}

async function probeSimpleRuntime(
  spec: SimpleRuntimeAdapterSpec,
  runner: CommandRunner | undefined,
  options: RuntimeAdapterOptions,
): Promise<RuntimeProbeStatus> {
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

  const declared = buildDeclaredCapabilityMap(spec, options);
  const locations = resolveLocations(spec, options);

  if (!cliAvailable) {
    return {
      adapter: spec.id,
      runtimeName: spec.runtimeName,
      version: null,
      installed: false,
      cliAvailable: false,
      gatewayAvailable: false,
      capabilities,
      capabilityMap: buildRuntimeCapabilityMap({
        ...declared,
        runtime: { ...declared.runtime, supported: true, status: "error", strategy: "cli", diagnostics: { ...(declared.runtime.diagnostics ?? {}), source: "runtime", probeMethod: "cli" } },
        auth: { ...declared.auth, supported: true, status: "degraded", strategy: "config" },
        models: { ...declared.models, supported: true, status: "degraded", strategy: declared.models.strategy },
        conversation_cli: { ...declared.conversation_cli, supported: true, status: "error", strategy: "cli" },
        conversation_gateway: { ...declared.conversation_gateway, supported: !!spec.gatewaySupport, status: spec.gatewaySupport ? "degraded" : "unsupported", strategy: spec.gatewaySupport ? "gateway" : "unsupported" },
        streaming: { ...declared.streaming, supported: true, status: "degraded", strategy: spec.gatewaySupport ? "gateway" : "cli" },
        scheduler: { ...declared.scheduler, supported: declared.scheduler.supported, status: declared.scheduler.supported ? "degraded" : "unsupported" },
        memory: { ...declared.memory, supported: true, status: "ready", strategy: declared.memory.strategy },
        skills: { ...declared.skills, supported: true, status: "degraded", strategy: declared.skills.strategy },
        channels: { ...declared.channels, supported: declared.channels.supported, status: declared.channels.supported ? "degraded" : "unsupported", strategy: declared.channels.strategy },
      }),
      diagnostics: {
        lastError: `${spec.binary} CLI not found`,
        locations,
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
  return {
    adapter: spec.id,
    runtimeName: spec.runtimeName,
    version,
    installed: true,
    cliAvailable: true,
    gatewayAvailable,
    capabilities,
    capabilityMap: buildRuntimeCapabilityMap({
      ...declared,
      runtime: { ...declared.runtime, supported: true, status: "ready", strategy: "cli" },
      auth: { ...declared.auth, supported: true, status: "ready", strategy: declared.auth.strategy },
      models: { ...declared.models, supported: true, status: capabilities.modelList ? "ready" : "degraded", strategy: declared.models.strategy },
      conversation_cli: { ...declared.conversation_cli, supported: true, status: "ready", strategy: "cli" },
      conversation_gateway: { ...declared.conversation_gateway, supported: !!spec.gatewaySupport, status: gatewayAvailable ? "ready" : spec.gatewaySupport ? "degraded" : "unsupported", strategy: spec.gatewaySupport ? "gateway" : "unsupported" },
      streaming: { ...declared.streaming, supported: true, status: "ready", strategy: gatewayAvailable ? "gateway" : "cli" },
      scheduler: { ...declared.scheduler, supported: declared.scheduler.supported, status: declared.scheduler.supported ? (capabilities.scheduler ? "ready" : "degraded") : "unsupported", strategy: declared.scheduler.strategy },
      memory: { ...declared.memory, supported: true, status: "ready", strategy: declared.memory.strategy },
      skills: { ...declared.skills, supported: true, status: capabilities.skills ? "ready" : "degraded", strategy: declared.skills.strategy },
      channels: { ...declared.channels, supported: declared.channels.supported, status: declared.channels.supported ? (capabilities.channels ? "ready" : gatewayAvailable ? "ready" : "degraded") : "unsupported", strategy: declared.channels.strategy },
      sandbox: { ...declared.sandbox, supported: declared.sandbox.supported, status: declared.sandbox.supported ? declared.sandbox.status : "unsupported", strategy: declared.sandbox.strategy },
    }),
    diagnostics: {
      locations,
    },
  };
}

export function createSimpleRuntimeAdapter(spec: SimpleRuntimeAdapterSpec): RuntimeAdapter {
  return {
    id: spec.id,
    runtimeName: spec.runtimeName,
    stability: spec.stability ?? "experimental",
    supportLevel: spec.supportLevel ?? "experimental",
    ...(spec.recommended ? { recommended: spec.recommended } : {}),
    workspaceFiles: spec.workspaceFiles,
    workspace: {
      resolveLocations(options) {
        return resolveLocations(spec, options);
      },
      getWorkspaceContract() {
        return { files: spec.workspaceFiles };
      },
    },
    capabilities: {
      describe(options) {
        return buildDeclaredCapabilityMap(spec, options);
      },
      async probe(runner, options) {
        const status = await probeSimpleRuntime(spec, runner, options);
        return {
          capabilityMap: status.capabilityMap,
          diagnostics: status.diagnostics,
        };
      },
    },
    operations: {
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
                buildProgressStep("runtime.install.execute", `Install the ${spec.runtimeName} binary.`, 70, spec.installCommand ?? { command: "brew", args: ["install", spec.binary] }),
                buildProgressStep("runtime.install.finalize", `${spec.runtimeName} is ready to be probed again.`, 100),
              ],
            };
          case "uninstall":
            return {
              operation,
              capability: runtimeOperationCapability(operation),
              steps: [
                buildProgressStep("runtime.uninstall.prepare", `Resolve uninstall command for ${spec.runtimeName}.`, 10),
                buildProgressStep("runtime.uninstall.execute", `Remove the ${spec.runtimeName} binary.`, 70, spec.uninstallCommand ?? { command: "brew", args: ["uninstall", spec.binary] }),
                buildProgressStep("runtime.uninstall.finalize", `${spec.runtimeName} has been removed from the current runtime context.`, 100),
              ],
            };
          case "repair":
            return {
              operation,
              capability: runtimeOperationCapability(operation),
              steps: [
                buildProgressStep("runtime.repair.prepare", `Prepare ${spec.runtimeName} diagnostics.`, 10),
                buildProgressStep("runtime.repair.execute", `Run ${spec.runtimeName} repair or diagnostics.`, 70, spec.repairCommand ?? { command: spec.binary, args: ["doctor"] }),
                buildProgressStep("runtime.repair.finalize", `${spec.runtimeName} diagnostics completed.`, 100),
              ],
            };
          case "setup":
            return {
              operation,
              capability: runtimeOperationCapability(operation),
              steps: [
                buildProgressStep("workspace.setup.prepare", `Prepare ${spec.runtimeName} workspace setup for ${input?.agentId ?? "workspace"}.`, 10),
                buildProgressStep("workspace.setup.execute", `Initialize the ${spec.runtimeName} workspace.`, 70, spec.setupCommand?.(input!) ?? { command: spec.binary, args: ["workspace", "init"] }),
                buildProgressStep("workspace.setup.finalize", `${spec.runtimeName} workspace initialization completed.`, 100),
              ],
            };
        }
      },
      install(runner, installer, onProgress) {
        const command = spec.installCommand ?? { command: "brew", args: ["install", spec.binary] };
        return runRuntimeProgressPlan({
          operation: "install",
          capability: runtimeOperationCapability("install"),
          steps: [
            buildProgressStep("runtime.install.prepare", `Resolve install command for ${spec.runtimeName}.`, 10),
            buildProgressStep("runtime.install.execute", `Install the ${spec.runtimeName} binary.`, 70, command),
            buildProgressStep("runtime.install.finalize", `${spec.runtimeName} is ready to be probed again.`, 100),
          ],
        }, runner, onProgress, 120_000);
      },
      uninstall(runner, installer, onProgress) {
        const command = spec.uninstallCommand ?? { command: "brew", args: ["uninstall", spec.binary] };
        return runRuntimeProgressPlan({
          operation: "uninstall",
          capability: runtimeOperationCapability("uninstall"),
          steps: [
            buildProgressStep("runtime.uninstall.prepare", `Resolve uninstall command for ${spec.runtimeName}.`, 10),
            buildProgressStep("runtime.uninstall.execute", `Remove the ${spec.runtimeName} binary.`, 70, command),
            buildProgressStep("runtime.uninstall.finalize", `${spec.runtimeName} has been removed from the current runtime context.`, 100),
          ],
        }, runner, onProgress, 120_000);
      },
      repair(runner, onProgress) {
        const command = spec.repairCommand ?? { command: spec.binary, args: ["doctor"] };
        return runRuntimeProgressPlan({
          operation: "repair",
          capability: runtimeOperationCapability("repair"),
          steps: [
            buildProgressStep("runtime.repair.prepare", `Prepare ${spec.runtimeName} diagnostics.`, 10),
            buildProgressStep("runtime.repair.execute", `Run ${spec.runtimeName} repair or diagnostics.`, 70, command),
            buildProgressStep("runtime.repair.finalize", `${spec.runtimeName} diagnostics completed.`, 100),
          ],
        }, runner, onProgress, 30_000);
      },
      setupWorkspace(input, runner, onProgress) {
        const command = spec.setupCommand?.(input) ?? { command: spec.binary, args: ["workspace", "init"] };
        return runRuntimeProgressPlan({
          operation: "setup",
          capability: runtimeOperationCapability("setup"),
          steps: [
            buildProgressStep("workspace.setup.prepare", `Prepare ${spec.runtimeName} workspace setup for ${input?.agentId ?? "workspace"}.`, 10),
            buildProgressStep("workspace.setup.execute", `Initialize the ${spec.runtimeName} workspace.`, 70, command),
            buildProgressStep("workspace.setup.finalize", `${spec.runtimeName} workspace initialization completed.`, 100),
          ],
        }, runner, onProgress, 120_000);
      },
    },
    resources: {
      async getProviderCatalog(runner, options): Promise<ProviderCatalog> {
        return { providers: await this.listProviders(runner, options) };
      },
      async listProviders(runner, options): Promise<ProviderDescriptor[]> {
        const locations = resolveLocations(spec, options);
        if (spec.resourceLoaders?.listProviders) {
          return spec.resourceLoaders.listProviders(runner, options, locations);
        }
        return deriveProviders(spec, locations, await this.listModels(runner, options));
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
        if (spec.resourceLoaders?.listModels) {
          return spec.resourceLoaders.listModels(runner, options, locations, fallback);
        }
        if (spec.modelListCommand) {
          try {
            const result = await runner.exec(spec.binary, spec.modelListCommand, { timeoutMs: 20_000 });
            const parsed = JSON.parse(result.stdout) as Array<string | { id?: string; model?: string; provider?: string; name?: string }>;
            const mapped = parsed.map((entry): ModelDescriptor | null => {
              if (typeof entry === "string") {
                return {
                  id: entry,
                  modelId: entry,
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
                modelId,
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
        return deriveDefaultModel(spec, resolveLocations(spec, options));
      },
      async setDefaultModel(model, runner, options) {
        if (spec.setDefaultModelArgs) {
          try {
            await runner.exec(spec.binary, spec.setDefaultModelArgs(model), { timeoutMs: 20_000 });
          } catch {}
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
      async listSchedulers(runner, options): Promise<SchedulerDescriptor[]> {
        const locations = resolveLocations(spec, options);
        if (spec.resourceLoaders?.listSchedulers) {
          return spec.resourceLoaders.listSchedulers(runner, options, locations);
        }
        return resolveDescriptors(spec.defaultSchedulers, locations);
      },
      async getSchedulerCatalog(runner, options) {
        return { schedulers: await this.listSchedulers(runner, options) };
      },
      async runScheduler(_id, _runner, _options): Promise<void> {},
      async setSchedulerEnabled(_id, _enabled, _runner, _options): Promise<void> {},
      async listMemory(runner, options): Promise<MemoryDescriptor[]> {
        const locations = resolveLocations(spec, options);
        if (spec.resourceLoaders?.listMemory) {
          return spec.resourceLoaders.listMemory(runner, options, locations);
        }
        const defaults = resolveDescriptors(spec.defaultMemory, locations);
        return defaults.length > 0 ? defaults : [{
          id: `${spec.id}-memory`,
          label: `${spec.runtimeName} Memory`,
          kind: "store",
          path: locations.workspacePath,
        }];
      },
      async getMemoryCatalog(runner, options) {
        return { memory: await this.listMemory(runner, options) };
      },
      async searchMemory(query, runner, options): Promise<MemoryDescriptor[]> {
        return (await this.listMemory(runner, options)).filter((entry) => `${entry.id} ${entry.label} ${entry.summary ?? ""} ${entry.path ?? ""}`.toLowerCase().includes(query.toLowerCase()));
      },
      async listSkills(runner, options): Promise<SkillDescriptor[]> {
        const locations = resolveLocations(spec, options);
        if (spec.resourceLoaders?.listSkills) {
          return spec.resourceLoaders.listSkills(runner, options, locations);
        }
        const defaults = resolveDescriptors(spec.defaultSkills, locations);
        return defaults.length > 0 ? defaults : [{
          id: `${spec.id}-skills`,
          label: `${spec.runtimeName} Skills`,
          enabled: true,
          scope: "workspace",
          path: locations.workspacePath ? path.join(locations.workspacePath, "skills") : undefined,
        }];
      },
      async getSkillCatalog(runner, options) {
        return { skills: await this.listSkills(runner, options) };
      },
      async syncSkills(runner, options): Promise<SkillDescriptor[]> {
        return this.listSkills(runner, options);
      },
      async listChannels(runner, options): Promise<ChannelDescriptor[]> {
        const locations = resolveLocations(spec, options);
        if (spec.resourceLoaders?.listChannels) {
          return spec.resourceLoaders.listChannels(runner, options, locations);
        }
        return resolveDescriptors(spec.defaultChannels, locations);
      },
      async getChannelCatalog(runner, options) {
        return { channels: await this.listChannels(runner, options) };
      },
      async getPluginCatalog() {
        return { plugins: [] };
      },
    },
    conversation: {
      describe(options) {
        const locations = resolveLocations(spec, options);
        const details = spec.conversationDetails?.(options, locations) ?? {};
        const gatewayKind = spec.gatewayKind ?? "openai-chat-completions";
        return {
          transport: {
            kind: spec.gatewaySupport && options.gateway?.url ? "hybrid" : "cli",
            streaming: true,
            ...(spec.gatewaySupport && options.gateway?.url ? { gatewayKind } : {}),
            ...(details.primaryTransport ? { primaryTransport: details.primaryTransport } : {}),
            ...(details.fallbackTransport ? { fallbackTransport: details.fallbackTransport } : {}),
            ...(details.sessionPersistence ? { sessionPersistence: details.sessionPersistence } : {}),
            ...(details.streamingMode ? { streamingMode: details.streamingMode } : {}),
          },
          gateway: spec.gatewaySupport && options.gateway?.url ? {
            kind: gatewayKind,
            url: options.gateway.url,
            ...(options.gateway.token ? { token: options.gateway.token } : {}),
          } : null,
          fallbackGateway: spec.gatewaySupport && options.gateway?.url && gatewayKind !== "openai-chat-completions" ? {
            kind: "openai-chat-completions",
            url: options.gateway.url,
            ...(options.gateway.token ? { token: options.gateway.token } : {}),
          } : null,
          supportsGateway: !!spec.gatewaySupport,
          ...(details.primaryTransport ? { primaryTransport: details.primaryTransport } : {}),
          ...(details.fallbackTransport ? { fallbackTransport: details.fallbackTransport } : {}),
          ...(details.sessionPersistence ? { sessionPersistence: details.sessionPersistence } : {}),
          ...(details.streamingMode ? { streamingMode: details.streamingMode } : {}),
          ...(details.sessionPath ? { sessionPath: details.sessionPath } : {}),
        };
      },
      create(options) {
        const locations = resolveLocations(spec, options);
        const details = spec.conversationDetails?.(options, locations) ?? {};
        const gatewayKind = spec.gatewayKind ?? "openai-chat-completions";
        return {
          transport: {
            kind: spec.gatewaySupport && options.gateway?.url ? "hybrid" : "cli",
            streaming: true,
            ...(spec.gatewaySupport && options.gateway?.url ? { gatewayKind } : {}),
            ...(details.primaryTransport ? { primaryTransport: details.primaryTransport } : {}),
            ...(details.fallbackTransport ? { fallbackTransport: details.fallbackTransport } : {}),
            ...(details.sessionPersistence ? { sessionPersistence: details.sessionPersistence } : {}),
            ...(details.streamingMode ? { streamingMode: details.streamingMode } : {}),
          },
          gateway: spec.gatewaySupport && options.gateway?.url ? {
            kind: gatewayKind,
            url: options.gateway.url,
            ...(options.gateway.token ? { token: options.gateway.token } : {}),
          } : null,
          fallbackGateway: spec.gatewaySupport && options.gateway?.url && gatewayKind !== "openai-chat-completions" ? {
            kind: "openai-chat-completions",
            url: options.gateway.url,
            ...(options.gateway.token ? { token: options.gateway.token } : {}),
          } : null,
          buildCliInvocation(input) {
            return spec.conversationCli(input);
          },
          supportsGateway: !!spec.gatewaySupport,
          ...(details.primaryTransport ? { primaryTransport: details.primaryTransport } : {}),
          ...(details.fallbackTransport ? { fallbackTransport: details.fallbackTransport } : {}),
          ...(details.sessionPersistence ? { sessionPersistence: details.sessionPersistence } : {}),
          ...(details.streamingMode ? { streamingMode: details.streamingMode } : {}),
          ...(details.sessionPath ? { sessionPath: details.sessionPath } : {}),
        };
      },
    },
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
      return probeSimpleRuntime(spec, runner, options);
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
      return this.resources?.getProviderCatalog
        ? this.resources.getProviderCatalog(runner, options)
        : { providers: await this.listProviders(runner, options) };
    },
    async listProviders(runner, options): Promise<ProviderDescriptor[]> {
      if (this.resources?.listProviders) {
        return this.resources.listProviders(runner, options);
      }
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
      if (spec.resourceLoaders?.listModels) {
        return spec.resourceLoaders.listModels(runner, options, locations, fallback);
      }
      if (spec.modelListCommand) {
        try {
          const result = await runner.exec(spec.binary, spec.modelListCommand, { timeoutMs: 20_000 });
          const parsed = JSON.parse(result.stdout) as Array<string | { id?: string; model?: string; provider?: string; name?: string }>;
          const mapped = parsed.map((entry): ModelDescriptor | null => {
            if (typeof entry === "string") {
              return {
                id: entry,
                modelId: entry,
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
              modelId,
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
        requestedProvider: provider,
        provider,
        status: "launched",
        launchMode: "browser",
        pid: spawned.pid,
        command: spawned.command,
        args: spawned.args,
        message: "Interactive sign-in started in the runtime.",
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
      if (spec.resourceLoaders?.listSchedulers) {
        return spec.resourceLoaders.listSchedulers(_runner, options, resolveLocations(spec, options));
      }
      return resolveDescriptors(spec.defaultSchedulers, resolveLocations(spec, options));
    },
    async runScheduler(_id, _runner, _options): Promise<void> {},
    async setSchedulerEnabled(_id, _enabled, _runner, _options): Promise<void> {},
    async listMemory(_runner, options): Promise<MemoryDescriptor[]> {
      const locations = resolveLocations(spec, options);
      if (spec.resourceLoaders?.listMemory) {
        return spec.resourceLoaders.listMemory(_runner, options, locations);
      }
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
      if (spec.resourceLoaders?.listSkills) {
        return spec.resourceLoaders.listSkills(_runner, options, locations);
      }
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
      if (spec.resourceLoaders?.listChannels) {
        return spec.resourceLoaders.listChannels(_runner, options, resolveLocations(spec, options));
      }
      return resolveDescriptors(spec.defaultChannels, resolveLocations(spec, options));
    },
    createConversationAdapter(options): RuntimeConversationAdapter {
      const locations = resolveLocations(spec, options);
      const details = spec.conversationDetails?.(options, locations) ?? {};
      const gatewayKind = spec.gatewayKind ?? "openai-chat-completions";
      return {
        transport: {
          kind: spec.gatewaySupport && options.gateway?.url ? "hybrid" : "cli",
          streaming: true,
          ...(spec.gatewaySupport && options.gateway?.url ? { gatewayKind } : {}),
          ...(details.primaryTransport ? { primaryTransport: details.primaryTransport } : {}),
          ...(details.fallbackTransport ? { fallbackTransport: details.fallbackTransport } : {}),
          ...(details.sessionPersistence ? { sessionPersistence: details.sessionPersistence } : {}),
          ...(details.streamingMode ? { streamingMode: details.streamingMode } : {}),
        },
        gateway: spec.gatewaySupport && options.gateway?.url ? {
          kind: gatewayKind,
          url: options.gateway.url,
          ...(options.gateway.token ? { token: options.gateway.token } : {}),
        } : null,
        fallbackGateway: spec.gatewaySupport && options.gateway?.url && gatewayKind !== "openai-chat-completions" ? {
          kind: "openai-chat-completions",
          url: options.gateway.url,
          ...(options.gateway.token ? { token: options.gateway.token } : {}),
        } : null,
        buildCliInvocation(input) {
          return spec.conversationCli(input);
        },
        supportsGateway: !!spec.gatewaySupport,
        ...(details.primaryTransport ? { primaryTransport: details.primaryTransport } : {}),
        ...(details.fallbackTransport ? { fallbackTransport: details.fallbackTransport } : {}),
        ...(details.sessionPersistence ? { sessionPersistence: details.sessionPersistence } : {}),
        ...(details.streamingMode ? { streamingMode: details.streamingMode } : {}),
        ...(details.sessionPath ? { sessionPath: details.sessionPath } : {}),
      };
    },
  };
}
