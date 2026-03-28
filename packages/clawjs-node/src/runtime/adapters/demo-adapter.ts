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
  RuntimeProgressPlan,
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
  RuntimeFileDescriptor,
  SchedulerDescriptor,
  SkillDescriptor,
} from "@clawjs/core";
import { maskCredential } from "@clawjs/core";

import {
  buildProgressStep,
  buildRuntimeCapabilityMap,
  buildRuntimeCompatReport,
  capabilityBooleansFromMap,
  defaultManagedConversationFeatures,
  runRuntimeProgressPlan,
  runtimeOperationCapability,
} from "./shared.ts";
import {
  ensureParentDir,
  normalizeProviderAuthSummary,
  readJsonFile,
  resolveHomeDir,
} from "./config-utils.ts";
import {
  getDemoScenario,
  resolveDemoScenarioId,
  type DemoScenarioId,
} from "../../demo/scenarios.ts";

interface DemoConfigStore {
  defaultModel?: string;
  schedulerEnabled?: Record<string, boolean>;
}

interface DemoAuthStore {
  providers?: Record<string, { apiKey?: string; maskedCredential?: string | null }>;
}

const DEMO_WORKSPACE_FILES: RuntimeFileDescriptor[] = [
  { key: "SOUL", path: "SOUL.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "USER", path: "USER.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "AGENTS", path: "AGENTS.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "TOOLS", path: "TOOLS.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "IDENTITY", path: "IDENTITY.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "HEARTBEAT", path: "HEARTBEAT.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
];

function resolveDemoLocations(options: RuntimeAdapterOptions) {
  const scenarioId = resolveDemoScenarioId(options.env);
  const homeDir = options.homeDir?.trim()
    || path.join(resolveHomeDir(undefined), ".clawjs-demo", scenarioId);
  return {
    homeDir,
    configPath: options.configPath?.trim() || path.join(homeDir, "config.json"),
    workspacePath: options.workspacePath?.trim() || path.join(homeDir, "workspace"),
    authStorePath: options.authStorePath?.trim() || path.join(homeDir, "auth.json"),
    gatewayConfigPath: options.gateway?.configPath,
  };
}

function readConfig(options: RuntimeAdapterOptions): DemoConfigStore {
  return readJsonFile<DemoConfigStore>(resolveDemoLocations(options).configPath ?? "") ?? {};
}

function writeConfig(options: RuntimeAdapterOptions, config: DemoConfigStore): void {
  const filePath = resolveDemoLocations(options).configPath;
  if (!filePath) return;
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`);
}

function readAuthStore(options: RuntimeAdapterOptions): DemoAuthStore {
  return readJsonFile<DemoAuthStore>(resolveDemoLocations(options).authStorePath ?? "") ?? { providers: {} };
}

function writeAuthStore(options: RuntimeAdapterOptions, store: DemoAuthStore): void {
  const filePath = resolveDemoLocations(options).authStorePath;
  if (!filePath) return;
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`);
}

function getScenario(options: RuntimeAdapterOptions) {
  const scenarioId = resolveDemoScenarioId(options.env);
  return getDemoScenario(scenarioId);
}

function getDefaultModelRef(options: RuntimeAdapterOptions): DefaultModelRef | null {
  const scenario = getScenario(options);
  const configured = readConfig(options).defaultModel?.trim();
  if (!configured) return scenario.defaultModel;
  const matched = scenario.models.find((model) => model.id === configured);
  return {
    provider: matched?.provider ?? (configured.includes("/") ? configured.split("/")[0] : scenario.defaultModel?.provider),
    modelId: configured,
    label: matched?.label ?? configured,
  };
}

function mergeProviderAuth(options: RuntimeAdapterOptions): Record<string, ProviderAuthSummary> {
  const scenario = getScenario(options);
  const store = readAuthStore(options);
  return Object.fromEntries(
    scenario.providers.map((provider) => {
      const envKey = provider.envVars?.map((name) => options.env?.[name]?.trim()).find(Boolean) || null;
      const stored = store.providers?.[provider.id];
      const seeded = scenario.auth[provider.id];
      const fromStore = stored?.apiKey?.trim();
      const hasCredential = !!fromStore || !!envKey || !!seeded?.hasAuth;
      return [provider.id, normalizeProviderAuthSummary({
        provider: provider.id,
        hasAuth: hasCredential,
        hasSubscription: seeded?.hasSubscription ?? hasCredential,
        hasApiKey: !!fromStore || !!envKey || !!seeded?.hasApiKey,
        hasProfileApiKey: !!fromStore || !!seeded?.hasProfileApiKey,
        hasEnvKey: !!envKey || !!seeded?.hasEnvKey,
        authType: fromStore ? "api_key" : envKey ? "env" : seeded?.authType ?? null,
        maskedCredential: stored?.maskedCredential ?? seeded?.maskedCredential ?? maskCredential(fromStore ?? envKey),
      })];
    }),
  );
}

function buildNoopCommand(label: string) {
  return {
    command: process.execPath,
    args: ["-e", `process.stdout.write(${JSON.stringify(`demo:${label}`)})`],
  };
}

function buildProgressPlan(
  operation: "install" | "uninstall" | "repair" | "setup",
  input?: RuntimeSetupInput,
): RuntimeProgressPlan {
  const subject = operation === "setup" ? input?.agentId ?? "workspace" : "demo runtime";
  const verb = operation === "setup" ? "Prepare workspace" : `Run ${operation}`;
  return {
    operation,
    capability: runtimeOperationCapability(operation),
    steps: [
      buildProgressStep(`${operation}.prepare`, `${verb} (${subject}).`, 15),
      buildProgressStep(`${operation}.execute`, `Execute ${operation} command for ${subject}.`, 70, buildNoopCommand(operation)),
      buildProgressStep(`${operation}.finalize`, `Finalize ${operation} flow for ${subject}.`, 100),
    ],
  };
}

function getCapabilityMap() {
  return buildRuntimeCapabilityMap({
    runtime: { supported: true, status: "ready", strategy: "native" },
    workspace: { supported: true, status: "ready", strategy: "native" },
    auth: { supported: true, status: "ready", strategy: "config" },
    models: { supported: true, status: "ready", strategy: "config" },
    conversation_cli: { supported: true, status: "ready", strategy: "cli" },
    conversation_gateway: { supported: true, status: "ready", strategy: "gateway" },
    streaming: { supported: true, status: "ready", strategy: "gateway" },
    scheduler: { supported: true, status: "ready", strategy: "config" },
    memory: { supported: true, status: "ready", strategy: "config" },
    skills: { supported: true, status: "ready", strategy: "config" },
    channels: { supported: true, status: "ready", strategy: "config" },
    sandbox: { supported: false, status: "unsupported", strategy: "unsupported" },
    plugins: { supported: false, status: "unsupported", strategy: "unsupported" },
    doctor: { supported: true, status: "ready", strategy: "derived" },
    compat: { supported: true, status: "ready", strategy: "native" },
  });
}

export const demoAdapter: RuntimeAdapter = {
  id: "demo",
  runtimeName: "DemoClaw",
  stability: "demo",
  supportLevel: "demo",
  workspaceFiles: DEMO_WORKSPACE_FILES,
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
    return { files: DEMO_WORKSPACE_FILES };
  },
  resolveLocations(options) {
    return resolveDemoLocations(options);
  },
  async getStatus(_runner, options = { adapter: "demo" }): Promise<RuntimeProbeStatus> {
    const scenarioId: DemoScenarioId = resolveDemoScenarioId(options.env);
    const capabilityMap = getCapabilityMap();
    return {
      adapter: "demo",
      runtimeName: "DemoClaw",
      version: `demo-${scenarioId}`,
      installed: true,
      cliAvailable: true,
      gatewayAvailable: true,
      capabilities: capabilityBooleansFromMap(capabilityMap),
      capabilityMap,
      diagnostics: {
        scenarioId,
        locations: resolveDemoLocations(options),
      },
    };
  },
  buildCompatReport(status): RuntimeCompatReport {
    return buildRuntimeCompatReport({
      runtimeAdapter: status.adapter,
      runtimeVersion: status.version,
      capabilityMap: status.capabilityMap,
      degraded: false,
      issues: [],
      diagnostics: status.diagnostics,
    });
  },
  buildDoctorReport(status) {
    return {
      ok: true,
      runtime: status,
      compat: this.buildCompatReport(status),
      issues: [],
      suggestedRepairs: [],
    };
  },
  buildInstallCommand() {
    return buildNoopCommand("install");
  },
  buildUninstallCommand() {
    return buildNoopCommand("uninstall");
  },
  buildRepairCommand() {
    return buildNoopCommand("repair");
  },
  buildWorkspaceSetupCommand(_input: RuntimeSetupInput) {
    return buildNoopCommand("setup");
  },
  buildProgressPlan(operation, input) {
    return buildProgressPlan(operation, input);
  },
  install(runner, _installer, onProgress) {
    return runRuntimeProgressPlan(buildProgressPlan("install"), runner, onProgress, 5_000);
  },
  uninstall(runner, _installer, onProgress) {
    return runRuntimeProgressPlan(buildProgressPlan("uninstall"), runner, onProgress, 5_000);
  },
  repair(runner, onProgress) {
    return runRuntimeProgressPlan(buildProgressPlan("repair"), runner, onProgress, 5_000);
  },
  setupWorkspace(input, runner, onProgress) {
    return runRuntimeProgressPlan(buildProgressPlan("setup", input), runner, onProgress, 5_000);
  },
  async getProviderCatalog(_runner, options): Promise<ProviderCatalog> {
    return { providers: getScenario(options).providers };
  },
  async listProviders(_runner, options): Promise<ProviderDescriptor[]> {
    return getScenario(options).providers;
  },
  async getModelCatalog(_runner, options): Promise<ModelCatalog> {
    return {
      models: await this.listModels(_runner, options),
      defaultModel: await this.getDefaultModel(_runner, options),
    };
  },
  async listModels(_runner, options): Promise<ModelDescriptor[]> {
    const scenario = getScenario(options);
    const defaultModel = getDefaultModelRef(options)?.modelId;
    return scenario.models.map((model) => ({
      ...model,
      modelId: model.modelId ?? model.id,
      isDefault: model.id === defaultModel,
      ref: model.ref ?? {
        provider: model.provider,
        modelId: model.modelId ?? model.id,
        label: model.label,
      },
    }));
  },
  async getDefaultModel(_runner, options) {
    return getDefaultModelRef(options);
  },
  async setDefaultModel(model, _runner, options) {
    const config = readConfig(options);
    writeConfig(options, {
      ...config,
      defaultModel: model,
    });
    return model;
  },
  async getAuthState(_runner, options): Promise<AuthState> {
    return {
      providers: mergeProviderAuth(options),
      diagnostics: {
        scenarioId: resolveDemoScenarioId(options.env),
      },
    };
  },
  async getProviderAuth(_runner, options) {
    return mergeProviderAuth(options);
  },
  async login(provider, launcher, options): Promise<AuthLoginResult> {
    const spawned = launcher.spawnDetachedPty(process.execPath, ["-e", `setTimeout(() => process.exit(0), 10);`], {
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
    const store = readAuthStore(options);
    return {
      provider,
      authStorePath: resolveDemoLocations(options).authStorePath,
      profiles: Object.entries(store.providers ?? {})
        .filter(([providerId]) => !provider || providerId === provider)
        .map(([providerId, credential]) => ({
          profileId: `${providerId}:demo-store`,
          provider: providerId,
          authType: "api_key",
          maskedCredential: credential.maskedCredential ?? maskCredential(credential.apiKey),
        })),
      issues: [],
      scenarioId: resolveDemoScenarioId(options.env),
    };
  },
  setApiKey(provider, key, options) {
    const store = readAuthStore(options);
    store.providers = {
      ...(store.providers ?? {}),
      [provider]: {
        apiKey: key,
        maskedCredential: maskCredential(key),
      },
    };
    writeAuthStore(options, store);
    return {
      profileId: `${provider}:demo-store`,
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
    const store = readAuthStore(options);
    const before = Object.keys(store.providers ?? {}).length;
    store.providers = Object.fromEntries(
      Object.entries(store.providers ?? {}).filter(([providerId]) => providerId !== provider),
    );
    writeAuthStore(options, store);
    return before - Object.keys(store.providers ?? {}).length;
  },
  async listSchedulers(_runner, options): Promise<SchedulerDescriptor[]> {
    const scenario = getScenario(options);
    const config = readConfig(options);
    return scenario.schedulers.map((scheduler) => ({
      ...scheduler,
      enabled: config.schedulerEnabled?.[scheduler.id] ?? scheduler.enabled,
    }));
  },
  async runScheduler(_id, _runner, _options): Promise<void> {},
  async setSchedulerEnabled(id, enabled, _runner, options): Promise<void> {
    const config = readConfig(options);
    writeConfig(options, {
      ...config,
      schedulerEnabled: {
        ...(config.schedulerEnabled ?? {}),
        [id]: enabled,
      },
    });
  },
  async listMemory(_runner, options): Promise<MemoryDescriptor[]> {
    return getScenario(options).memory;
  },
  async searchMemory(query, _runner, options): Promise<MemoryDescriptor[]> {
    return getScenario(options).memory.filter((entry) =>
      `${entry.id} ${entry.label} ${entry.summary ?? ""} ${entry.path ?? ""}`.toLowerCase().includes(query.toLowerCase())
    );
  },
  async listSkills(_runner, options): Promise<SkillDescriptor[]> {
    return getScenario(options).skills;
  },
  async syncSkills(_runner, options): Promise<SkillDescriptor[]> {
    return getScenario(options).skills;
  },
  async listChannels(_runner, options): Promise<ChannelDescriptor[]> {
    return getScenario(options).channels;
  },
  createConversationAdapter(options): RuntimeConversationAdapter {
    const scenario = getScenario(options);
    const reply = scenario.chat?.assistantResponse
      ?? `${scenario.title}: ${scenario.summary}`;
    return {
      transport: {
        kind: options.gateway?.url ? "hybrid" : "cli",
        streaming: true,
        ...(options.gateway?.url ? { gatewayKind: "openai-chat-completions" as const } : {}),
      },
      gateway: options.gateway?.url
        ? {
            kind: "openai-chat-completions",
            url: options.gateway.url,
            ...(options.gateway.token ? { token: options.gateway.token } : {}),
          }
        : null,
      buildCliInvocation(input) {
        const promptLine = input.prompt.split("\n").find(Boolean)?.slice(0, 120) ?? "demo";
        return {
          command: process.execPath,
          args: [
            "-e",
            `process.stdout.write(${JSON.stringify(`${reply}\n\nPrompt digest: ${promptLine}`)});`,
          ],
          timeoutMs: 5_000,
          parser: "stdout-text",
        };
      },
      supportsGateway: true,
    };
  },
};
