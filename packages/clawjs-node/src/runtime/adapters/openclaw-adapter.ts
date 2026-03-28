import fs from "fs";
import path from "path";

import type {
  AuthDiagnostics,
  AuthLoginResult,
  CommandRunner,
  RuntimeAdapter,
  RuntimeAdapterOptions,
  RuntimeConversationAdapter,
  RuntimeProbeStatus,
  RuntimeSetupInput,
  RuntimeCompatReport,
  SaveApiKeyResult,
} from "../contracts.ts";
import { NodeProcessHost } from "../../host/process.ts";
import type {
  AuthState,
  ChannelDescriptor,
  MemoryDescriptor,
  ModelCatalog,
  ModelDescriptor,
  ProviderCatalog,
  ProviderDescriptor,
  ProviderAuthSummary,
  RuntimeFileDescriptor,
  SchedulerDescriptor,
  SkillDescriptor,
} from "@clawjs/core";

import {
  buildCompatReport,
  buildDoctorReport,
  buildOpenClawInstallCommand,
  buildOpenClawRepairCommand,
  buildOpenClawRuntimeProgressPlan,
  buildOpenClawUninstallCommand,
  buildOpenClawWorkspaceSetupCommand,
  getOpenClawRuntimeStatus,
  installOpenClawRuntime,
  repairOpenClawRuntime,
  setupOpenClawWorkspace,
  uninstallOpenClawRuntime,
} from "../openclaw.ts";
import { buildOpenClawCommand, withOpenClawCommandEnv } from "../openclaw-command.ts";
import {
  buildOpenClawAuthDiagnostics,
  launchOpenClawAuthLogin,
  loadAuthStore,
  normalizeAuthSummaries,
  persistProviderApiKey,
  removeAuthProfilesForProvider,
  saveProviderApiKey,
  setDefaultModel,
} from "../../auth/openclaw-auth.ts";
import {
  getDefaultOpenClawModel,
  listOpenClawModels,
  readOpenClawModelsStatus,
} from "../../models/openclaw-models.ts";
import { maskCredential } from "@clawjs/core";
import { listOpenClawChannels, readOpenClawGatewayConfig } from "../gateway.ts";
import { resolveMemoryHitLabel, runOpenClawMemorySearch } from "../openclaw-memory.ts";
import { buildRuntimeCapabilityMap, buildRuntimeCompatReport, openClawMirrorFeatures } from "./shared.ts";

const OPENCLAW_WORKSPACE_FILES: RuntimeFileDescriptor[] = [
  { key: "SOUL", path: "SOUL.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "USER", path: "USER.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "AGENTS", path: "AGENTS.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "TOOLS", path: "TOOLS.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "IDENTITY", path: "IDENTITY.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "HEARTBEAT", path: "HEARTBEAT.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
];

function withRuntimeEnv(
  runner: CommandRunner,
  options: Pick<RuntimeAdapterOptions, "env" | "binaryPath" | "homeDir" | "configPath"> = {},
): CommandRunner {
  const env = withOpenClawCommandEnv(options.env, {
    binaryPath: options.binaryPath,
    homeDir: options.homeDir,
    configPath: options.configPath,
  });
  if (!env) return runner;
  return {
    exec(command, args, options = {}) {
      return runner.exec(command, args, {
        ...options,
        env: {
          ...env,
          ...(options.env ?? {}),
        },
      });
    },
  };
}

async function readProviderState(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<Record<string, ProviderAuthSummary>> {
  const status = await readOpenClawModelsStatus(withRuntimeEnv(runner, options), options.agentId, options);
  const authStore = options.agentDir ? loadAuthStore(options.agentDir) : null;
  return normalizeAuthSummaries(status, authStore);
}

async function listProviders(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<ProviderDescriptor[]> {
  const status = await readOpenClawModelsStatus(withRuntimeEnv(runner, options), options.agentId, options);
  return (status.auth?.providers ?? []).map((provider) => ({
    id: provider.provider,
    label: provider.provider,
    auth: {
      supportsOAuth: (provider.profiles?.oauth ?? 0) > 0 || status.auth?.providersWithOAuth?.includes(provider.provider) || false,
      supportsToken: (provider.profiles?.token ?? 0) > 0,
      supportsApiKey: (provider.profiles?.apiKey ?? 0) > 0 || !!provider.env?.value,
      supportsEnv: !!provider.env?.value,
    },
  }));
}

async function listModels(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<ModelDescriptor[]> {
  const status = await readOpenClawModelsStatus(withRuntimeEnv(runner, options), options.agentId, options);
  return listOpenClawModels(status).map((model) => ({
    ...model,
    ref: {
      provider: model.provider,
      modelId: model.modelId ?? model.id,
      label: model.label,
    },
    source: "runtime",
  }));
}

function titleizeSkillId(value: string): string {
  return value
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function listWorkspaceSkills(workspacePath?: string): SkillDescriptor[] {
  const skillsDir = workspacePath ? path.join(workspacePath, "skills") : undefined;
  if (!skillsDir) return [];
  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isFile())
      .map((entry) => {
        const id = entry.isFile()
          ? entry.name.replace(/\.[^.]+$/, "")
          : entry.name;
        return {
          id,
          label: titleizeSkillId(id),
          enabled: true,
          scope: "workspace" as const,
          path: path.join(skillsDir, entry.name),
        };
      })
      .sort((left, right) => left.id.localeCompare(right.id));
    return entries;
  } catch {
    return [];
  }
}

export const openclawAdapter: RuntimeAdapter = {
  id: "openclaw",
  runtimeName: "OpenClaw",
  stability: "stable",
  supportLevel: "production",
  recommended: true,
  workspaceFiles: OPENCLAW_WORKSPACE_FILES,
  describeFeatures(options) {
    const capabilityMap = buildRuntimeCapabilityMap({
      runtime: { supported: true, status: "ready", strategy: "cli" },
      workspace: { supported: true, status: "ready", strategy: "native" },
      auth: { supported: true, status: "ready", strategy: "cli" },
      models: { supported: true, status: "ready", strategy: "cli" },
      conversation_cli: { supported: true, status: "ready", strategy: "cli" },
      conversation_gateway: { supported: true, status: options.gateway?.url ? "ready" : "degraded", strategy: "gateway" },
      streaming: { supported: true, status: "ready", strategy: options.gateway?.url ? "gateway" : "cli" },
      memory: { supported: true, status: "degraded", strategy: "derived", limitations: ["OpenClaw memory is workspace-file based in ClawJS."] },
      skills: { supported: true, status: "degraded", strategy: "derived", limitations: ["Skills inventory is inferred from workspace/runtime files."] },
      channels: { supported: true, status: options.gateway?.url ? "ready" : "degraded", strategy: "gateway", limitations: ["Channel inventory is derived from OpenClaw gateway status and config."] },
      scheduler: { supported: true, status: "degraded", strategy: "derived", limitations: ["Heartbeat-based scheduling only."] },
      sandbox: { supported: false, status: "unsupported", strategy: "unsupported" },
      plugins: { supported: true, status: "ready", strategy: "native" },
      doctor: { supported: true, status: "ready", strategy: "native" },
      compat: { supported: true, status: "ready", strategy: "native" },
    });
    return openClawMirrorFeatures(capabilityMap);
  },
  getWorkspaceContract() {
    return { files: OPENCLAW_WORKSPACE_FILES };
  },
  resolveLocations(options) {
    return {
      authStorePath: options.agentDir ? `${options.agentDir}/auth-profiles.json` : undefined,
      gatewayConfigPath: options.gateway?.configPath ?? options.configPath,
    };
  },
  async getStatus(runner = new NodeProcessHost(), options = { adapter: "openclaw" }): Promise<RuntimeProbeStatus> {
    const status = await getOpenClawRuntimeStatus(withRuntimeEnv(runner, options), options);
    const capabilityMap = buildRuntimeCapabilityMap({
      runtime: { supported: true, status: status.cliAvailable ? "ready" : "error", strategy: "cli" },
      workspace: { supported: true, status: "ready", strategy: "native" },
      auth: { supported: true, status: status.capabilities.modelsStatus ? "ready" : "degraded", strategy: "cli" },
      models: { supported: true, status: status.capabilities.modelsStatus ? "ready" : "degraded", strategy: "cli" },
      conversation_cli: { supported: true, status: status.cliAvailable ? "ready" : "error", strategy: "cli" },
      conversation_gateway: { supported: true, status: status.capabilities.gatewayCall ? "ready" : "degraded", strategy: "gateway" },
      streaming: { supported: true, status: "ready", strategy: status.capabilities.gatewayCall ? "gateway" : "cli" },
      memory: { supported: true, status: "degraded", strategy: "derived", limitations: ["OpenClaw memory is workspace-file based in ClawJS."] },
      skills: { supported: true, status: "degraded", strategy: "derived", limitations: ["Skills inventory is inferred from workspace/runtime files."] },
      channels: {
        supported: true,
        status: status.capabilities.gatewayCall ? "ready" : "degraded",
        strategy: "gateway",
        limitations: ["Channel inventory is derived from OpenClaw gateway status and config."],
      },
      scheduler: { supported: true, status: "degraded", strategy: "derived", limitations: ["Heartbeat-based scheduling only."] },
      sandbox: { supported: false, status: "unsupported", strategy: "unsupported" },
      plugins: {
        supported: status.capabilities.pluginsList,
        status: status.capabilities.pluginsList ? "ready" : "degraded",
        strategy: status.capabilities.pluginsList ? "native" : "unsupported",
      },
      doctor: { supported: true, status: "ready", strategy: "native" },
      compat: { supported: true, status: "ready", strategy: "native" },
    });
    return {
      installed: status.cliAvailable,
      ...status,
      capabilityMap,
    };
  },
  buildCompatReport(status): RuntimeCompatReport {
    const compat = buildCompatReport(status);
    return buildRuntimeCompatReport({
      ...compat,
      capabilityMap: status.capabilityMap,
    });
  },
  buildDoctorReport(status) {
    return buildDoctorReport(status);
  },
  buildInstallCommand(installer = "npm") {
    return buildOpenClawInstallCommand(installer);
  },
  buildUninstallCommand(installer = "npm") {
    return buildOpenClawUninstallCommand(installer);
  },
  buildRepairCommand() {
    return buildOpenClawRepairCommand();
  },
  buildWorkspaceSetupCommand(input: RuntimeSetupInput) {
    return buildOpenClawWorkspaceSetupCommand(input);
  },
  buildProgressPlan(operation, input, installer = "npm") {
    return buildOpenClawRuntimeProgressPlan(operation, input, installer);
  },
  install(runner, installer = "npm", onProgress) {
    return installOpenClawRuntime(runner, installer, onProgress);
  },
  uninstall(runner, installer = "npm", onProgress) {
    return uninstallOpenClawRuntime(runner, installer, onProgress);
  },
  repair(runner, onProgress) {
    return repairOpenClawRuntime(runner, onProgress);
  },
  setupWorkspace(input, runner, onProgress) {
    return setupOpenClawWorkspace(input, runner, onProgress);
  },
  async getProviderCatalog(runner, options): Promise<ProviderCatalog> {
    return { providers: await listProviders(runner, options) };
  },
  listProviders,
  async getModelCatalog(runner, options): Promise<ModelCatalog> {
    return {
      models: await listModels(runner, options),
      defaultModel: await this.getDefaultModel(runner, options),
    };
  },
  listModels,
  async getDefaultModel(runner, options) {
    const model = getDefaultOpenClawModel(await readOpenClawModelsStatus(withRuntimeEnv(runner, options), options.agentId, options));
    return model ? {
      provider: model.provider,
      modelId: model.modelId ?? model.id,
      label: model.label,
    } : null;
  },
  setDefaultModel(model, runner, options) {
    return setDefaultModel(model, runner, options.agentId, options);
  },
  getProviderAuth(runner, options) {
    return readProviderState(runner, options);
  },
  async getAuthState(runner, options): Promise<AuthState> {
    return {
      providers: await readProviderState(runner, options),
    };
  },
  async login(provider, launcher, options): Promise<AuthLoginResult> {
    const launched = launchOpenClawAuthLogin(provider, launcher, options.agentId, {
      setDefault: options.setDefault,
      cwd: options.cwd,
      binaryPath: options.binaryPath,
      env: options.env,
    });
    return launched;
  },
  diagnostics(provider, options): AuthDiagnostics {
    return {
      ...buildOpenClawAuthDiagnostics(options.agentDir, provider),
    };
  },
  setApiKey(provider, key, options) {
    if (!options.agentDir) {
      throw new Error("runtime.agentDir is required to store provider API keys");
    }
    return saveProviderApiKey(options.agentDir, provider, key, undefined, options.profileId);
  },
  async saveApiKey(provider, key, runner, options): Promise<SaveApiKeyResult> {
    if (!options.agentDir) {
      throw new Error("runtime.agentDir is required to store provider API keys");
    }
    return persistProviderApiKey(options.agentDir, provider, key, undefined, {
      profileId: options.profileId,
      runtimeCommand: options.runtimeCommand,
      ...(options.runtimeCommand ? { runner } : {}),
    });
  },
  removeProvider(provider, options) {
    if (!options.agentDir) return 0;
    return removeAuthProfilesForProvider(options.agentDir, provider);
  },
  async listSchedulers(_runner, options): Promise<SchedulerDescriptor[]> {
    return [{
      id: `${options.agentId ?? "default"}:heartbeat`,
      label: "Heartbeat",
      enabled: true,
      status: "idle",
      kind: "routine",
    }];
  },
  async runScheduler(_id, _runner, _options): Promise<void> {},
  async setSchedulerEnabled(_id, _enabled, _runner, _options): Promise<void> {},
  async listMemory(_runner, options): Promise<MemoryDescriptor[]> {
    return [{
      id: "workspace-memory",
      label: "Workspace Memory",
      kind: "file",
      path: options.workspacePath ?? options.agentDir,
      summary: "Derived from workspace runtime files.",
    }];
  },
  async searchMemory(query, runner, options): Promise<MemoryDescriptor[]> {
    const hits = await runOpenClawMemorySearch(query, runner, {
      agentId: options.agentId,
      binaryPath: options.binaryPath,
      env: options.env,
    });
    return hits.map((hit, index) => ({
      id: `${hit.path ?? "memory"}:${hit.startLine ?? 0}:${hit.endLine ?? index}`,
      label: resolveMemoryHitLabel(hit),
      kind: hit.path?.includes("/sessions/") ? "session" : "index",
      ...(hit.path ? { path: hit.path } : {}),
      summary: hit.text,
    }));
  },
  async listSkills(_runner, options): Promise<SkillDescriptor[]> {
    const skills = listWorkspaceSkills(options.workspacePath);
    return skills;
  },
  async syncSkills(runner, options): Promise<SkillDescriptor[]> {
    return this.listSkills(runner, options);
  },
  async listChannels(runner, options): Promise<ChannelDescriptor[]> {
    return listOpenClawChannels(runner, {
      binaryPath: options.binaryPath,
      url: options.gateway?.url,
      token: options.gateway?.token,
      port: options.gateway?.port,
      configPath: options.gateway?.configPath ?? options.configPath,
      env: options.env,
    });
  },
  createConversationAdapter(options): RuntimeConversationAdapter {
    const gatewayConfig = readOpenClawGatewayConfig(options.gateway ?? {});
    return {
      transport: {
        kind: gatewayConfig ? "hybrid" : "cli",
        streaming: true,
        ...(gatewayConfig ? { gatewayKind: "openai-chat-completions" as const } : {}),
      },
      gateway: gatewayConfig ? {
        kind: "openai-chat-completions",
        url: gatewayConfig.url,
        ...(gatewayConfig.token ? { token: gatewayConfig.token } : {}),
      } : null,
      buildCliInvocation(input) {
        if (!input.agentId) {
          throw new Error("agentId is required for OpenClaw CLI conversations");
        }
        return {
          ...buildOpenClawCommand([
            "agent",
            "--agent",
            input.agentId,
            "--session-id",
            input.sessionId,
            "--message",
            input.prompt,
            "--thinking",
            "minimal",
            "--json",
            "--timeout",
            "120",
          ], options),
          timeoutMs: 130_000,
          parser: "json-payloads",
        };
      },
      supportsGateway: true,
    };
  },
};
