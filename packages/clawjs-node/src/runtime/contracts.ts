import type {
  AuthState,
  CapabilityName,
  ChannelDescriptor,
  ConversationTransport,
  DefaultModelRef,
  MemoryDescriptor,
  ModelCatalog,
  ModelDescriptor,
  ProgressEvent,
  ProviderCatalog,
  ProviderAuthSummary,
  ProviderDescriptor,
  RuntimeAdapterId,
  RuntimeAdapterStability,
  RuntimeAdapterSupportLevel,
  RuntimeFeatureDescriptor,
  RuntimeCapabilityMap,
  RuntimeFileDescriptor,
  RuntimeInfo,
  RuntimeLocations,
  RuntimeWorkspaceContract,
  SchedulerDescriptor,
  SkillDescriptor,
} from "@clawjs/core";

import type { ExecResult } from "../host/process.ts";

export interface RuntimeProbeStatus extends RuntimeInfo {
  installed?: boolean;
  cliAvailable: boolean;
  gatewayAvailable: boolean;
  diagnostics: Record<string, unknown>;
}

export interface RuntimeCompatReport {
  runtimeAdapter: RuntimeAdapterId;
  runtimeVersion: string | null;
  capabilities: Record<string, boolean>;
  capabilityMap: RuntimeCapabilityMap;
  degraded: boolean;
  issues: string[];
  diagnostics?: Record<string, unknown>;
}

export interface RuntimeDoctorReport {
  ok: boolean;
  runtime: RuntimeProbeStatus;
  compat: RuntimeCompatReport;
  issues: string[];
  suggestedRepairs: string[];
}

export interface CommandRunner {
  exec(command: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }): Promise<ExecResult>;
}

export interface DetachedAuthLauncher {
  spawnDetachedPty(command: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }): { pid: number | undefined; command: string; args: string[] };
}

export interface RuntimeCommandSpec {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

export interface RuntimeSetupInput {
  agentId: string;
  workspaceDir: string;
}

export type RuntimeOperation = "install" | "uninstall" | "setup" | "repair";
export type RuntimeProgressStatus = "start" | "complete" | "error";

export interface RuntimeProgressStep {
  phase: string;
  message: string;
  percent: number;
  command?: RuntimeCommandSpec;
}

export interface RuntimeProgressPlan {
  operation: RuntimeOperation;
  capability: CapabilityName;
  steps: RuntimeProgressStep[];
}

export interface RuntimeProgressEvent extends ProgressEvent {
  operation: RuntimeOperation;
  status: RuntimeProgressStatus;
  command?: RuntimeCommandSpec;
}

export type RuntimeProgressSink = (event: RuntimeProgressEvent) => void;

export interface RuntimeAdapterPaths {
  homeDir?: string;
  configPath?: string;
  workspacePath?: string;
  authStorePath?: string;
  gatewayConfigPath?: string;
}

export interface RuntimeAdapterOptions {
  adapter: RuntimeAdapterId;
  binaryPath?: string;
  agentId?: string;
  agentDir?: string;
  homeDir?: string;
  configPath?: string;
  workspacePath?: string;
  authStorePath?: string;
  gateway?: {
    url?: string;
    token?: string;
    port?: number;
    configPath?: string;
  };
  env?: NodeJS.ProcessEnv;
}

export interface AuthDiagnostics {
  provider?: string;
  authStorePath?: string;
  profiles?: Array<{
    profileId: string;
    provider: string;
    authType: string;
    maskedCredential?: string | null;
  }>;
  issues: string[];
  [key: string]: unknown;
}

export interface AuthLoginResult {
  provider: string;
  pid?: number;
  command: string;
  args: string[];
}

export interface SaveApiKeyResult {
  summary: {
    profileId: string;
    provider: string;
    authType: string;
    maskedCredential?: string | null;
  };
  mode: "runtime" | "store";
}

export interface ConversationCliInvocation {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  parser: "json-payloads" | "stdout-text";
}

export interface ConversationGatewayDescriptor {
  kind: "openai-chat-completions";
  url: string;
  token?: string;
  port?: number;
  source?: string;
  configPath?: string;
}

export interface RuntimeConversationAdapter {
  gateway?: ConversationGatewayDescriptor | null;
  transport: ConversationTransport;
  buildCliInvocation(input: {
    sessionId: string;
    agentId?: string;
    prompt: string;
    model?: string;
  }): ConversationCliInvocation;
  supportsGateway?: boolean;
}

export interface RuntimeAdapter {
  id: RuntimeAdapterId;
  runtimeName: string;
  stability: RuntimeAdapterStability;
  supportLevel: RuntimeAdapterSupportLevel;
  recommended?: boolean;
  workspaceFiles: RuntimeFileDescriptor[];
  describeFeatures(options: RuntimeAdapterOptions): RuntimeFeatureDescriptor[];
  resolveLocations(options: RuntimeAdapterOptions): RuntimeLocations;
  getWorkspaceContract(options: RuntimeAdapterOptions): RuntimeWorkspaceContract;
  getStatus(runner?: CommandRunner, options?: RuntimeAdapterOptions): Promise<RuntimeProbeStatus>;
  buildCompatReport(status: RuntimeProbeStatus): RuntimeCompatReport;
  buildDoctorReport(status: RuntimeProbeStatus): RuntimeDoctorReport;
  buildInstallCommand(installer?: "npm" | "pnpm"): RuntimeCommandSpec;
  buildUninstallCommand(installer?: "npm" | "pnpm"): RuntimeCommandSpec;
  buildRepairCommand(): RuntimeCommandSpec;
  buildWorkspaceSetupCommand(input: RuntimeSetupInput): RuntimeCommandSpec;
  buildProgressPlan(operation: RuntimeOperation, input?: RuntimeSetupInput, installer?: "npm" | "pnpm"): RuntimeProgressPlan;
  install(runner: CommandRunner, installer?: "npm" | "pnpm", onProgress?: RuntimeProgressSink): Promise<void>;
  uninstall(runner: CommandRunner, installer?: "npm" | "pnpm", onProgress?: RuntimeProgressSink): Promise<void>;
  repair(runner: CommandRunner, onProgress?: RuntimeProgressSink): Promise<void>;
  setupWorkspace(input: RuntimeSetupInput, runner: CommandRunner, onProgress?: RuntimeProgressSink): Promise<void>;
  getProviderCatalog(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<ProviderCatalog>;
  listProviders(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<ProviderDescriptor[]>;
  getModelCatalog(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<ModelCatalog>;
  listModels(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<ModelDescriptor[]>;
  getDefaultModel(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<DefaultModelRef | null>;
  setDefaultModel(model: string, runner: CommandRunner, options: RuntimeAdapterOptions): Promise<string>;
  getAuthState(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<AuthState>;
  getProviderAuth(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<Record<string, ProviderAuthSummary>>;
  login(provider: string, launcher: DetachedAuthLauncher, options: RuntimeAdapterOptions & { setDefault?: boolean; cwd?: string }): Promise<AuthLoginResult>;
  diagnostics(provider: string | undefined, options: RuntimeAdapterOptions): AuthDiagnostics;
  setApiKey(provider: string, key: string, options: RuntimeAdapterOptions & { profileId?: string }): {
    profileId: string;
    provider: string;
    authType: string;
    maskedCredential?: string | null;
  };
  saveApiKey(provider: string, key: string, runner: CommandRunner, options: RuntimeAdapterOptions & {
    profileId?: string;
    runtimeCommand?: RuntimeCommandSpec;
  }): Promise<SaveApiKeyResult>;
  removeProvider(provider: string, options: RuntimeAdapterOptions & { legacyAgentDirs?: string[] }): number;
  listSchedulers(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<SchedulerDescriptor[]>;
  runScheduler(id: string, runner: CommandRunner, options: RuntimeAdapterOptions): Promise<void>;
  setSchedulerEnabled(id: string, enabled: boolean, runner: CommandRunner, options: RuntimeAdapterOptions): Promise<void>;
  listMemory(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<MemoryDescriptor[]>;
  searchMemory(query: string, runner: CommandRunner, options: RuntimeAdapterOptions): Promise<MemoryDescriptor[]>;
  listSkills(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<SkillDescriptor[]>;
  syncSkills(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<SkillDescriptor[]>;
  listChannels(runner: CommandRunner, options: RuntimeAdapterOptions): Promise<ChannelDescriptor[]>;
  createConversationAdapter(options: RuntimeAdapterOptions): RuntimeConversationAdapter;
}
