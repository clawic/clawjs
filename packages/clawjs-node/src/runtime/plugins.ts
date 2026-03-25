import type { CommandRunner, RuntimeAdapterOptions } from "./contracts.ts";
import { readOpenClawRuntimeConfig, writeOpenClawRuntimeConfig } from "./openclaw-context.ts";
import { restartOpenClawGateway } from "./gateway.ts";

export type OpenClawPluginBridgeMode = "managed" | "detect-only" | "off";
export type OpenClawPluginInstallSource = "npm";
export type OpenClawManagedPluginTarget = "clawjs" | "context" | "all";

export interface OpenClawPluginRecord {
  id: string;
  name?: string;
  description?: string;
  version?: string;
  source?: string;
  origin?: string;
  enabled?: boolean;
  status?: string;
  toolNames?: string[];
  hookNames?: string[];
  channelIds?: string[];
  providerIds?: string[];
  gatewayMethods?: string[];
  cliCommands?: string[];
  services?: string[];
  commands?: string[];
  httpRoutes?: number;
  hookCount?: number;
  configSchema?: boolean;
  configUiHints?: Record<string, unknown>;
  configJsonSchema?: Record<string, unknown>;
  error?: string;
}

export interface OpenClawPluginListResult {
  workspaceDir?: string;
  plugins: OpenClawPluginRecord[];
  diagnostics: Array<{ level?: string; message?: string } | string>;
}

export interface OpenClawHooksListResult {
  workspaceDir?: string;
  managedHooksDir?: string;
  hooks: Array<{
    name: string;
    description?: string;
    managedByPlugin?: boolean;
    source?: string;
    events?: string[];
  }>;
}

export interface OpenClawPluginDoctorResult {
  ok: boolean;
  output: string;
  issues: string[];
}

export interface OpenClawPluginBridgePolicy {
  mode: OpenClawPluginBridgeMode;
  packageSpec: string;
  contextEnginePackageSpec: string;
  installSource: OpenClawPluginInstallSource;
  enableContextEngine: boolean;
}

export interface OpenClawManagedPluginState {
  id: string;
  packageSpec: string;
  installed: boolean;
  enabled: boolean;
  loaded: boolean;
  version: string | null;
  status: string | null;
  source: string | null;
  origin: string | null;
  error: string | null;
}

export interface OpenClawPluginBridgeStatus {
  supported: boolean;
  mode: OpenClawPluginBridgeMode;
  installSource: OpenClawPluginInstallSource;
  configPath?: string;
  diagnostics: string[];
  plugins: OpenClawPluginRecord[];
  basePlugin: OpenClawManagedPluginState;
  contextPlugin: OpenClawManagedPluginState & {
    selected: boolean;
    selectedEngineId: string | null;
  };
}

export interface OpenClawPluginEnsureResult {
  changed: boolean;
  restartedGateway: boolean;
  actions: string[];
  status: OpenClawPluginBridgeStatus;
}

const CLAWJS_PLUGIN_ID = "clawjs";
const CLAWJS_CONTEXT_PLUGIN_ID = "clawjs-context";
const DEFAULT_CLAWJS_PACKAGE_SPEC = "@clawjs/openclaw-plugin";
const DEFAULT_CLAWJS_CONTEXT_PACKAGE_SPEC = "@clawjs/openclaw-context-engine";
const DEFAULT_PLUGIN_OPTIONS: RuntimeAdapterOptions = { adapter: "openclaw" };

function parseJson<T>(input: string): T {
  return JSON.parse(input) as T;
}

function normalizePluginRecord(input: OpenClawPluginRecord | undefined, fallbackId: string, packageSpec: string): OpenClawManagedPluginState {
  return {
    id: fallbackId,
    packageSpec,
    installed: !!input,
    enabled: !!input?.enabled,
    loaded: input?.status === "loaded",
    version: input?.version ?? null,
    status: input?.status ?? null,
    source: input?.source ?? null,
    origin: input?.origin ?? null,
    error: input?.error ?? null,
  };
}

function parseDoctorIssues(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}

function pluginCommandOptions(options: RuntimeAdapterOptions = DEFAULT_PLUGIN_OPTIONS) {
  return {
    env: options.env,
    timeoutMs: 20_000,
  };
}

async function execOpenClawPluginCommand(
  runner: CommandRunner,
  args: string[],
  options: RuntimeAdapterOptions = DEFAULT_PLUGIN_OPTIONS,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return runner.exec("openclaw", args, pluginCommandOptions(options));
}

export function resolveOpenClawPluginBridgePolicy(
  adapter: string,
  input?: {
    mode?: OpenClawPluginBridgeMode;
    packageSpec?: string;
    contextEnginePackageSpec?: string;
    installSource?: OpenClawPluginInstallSource;
    enableContextEngine?: boolean;
  },
): OpenClawPluginBridgePolicy {
  return {
    mode: input?.mode ?? (adapter === "openclaw" ? "managed" : "off"),
    packageSpec: input?.packageSpec?.trim() || DEFAULT_CLAWJS_PACKAGE_SPEC,
    contextEnginePackageSpec: input?.contextEnginePackageSpec?.trim() || DEFAULT_CLAWJS_CONTEXT_PACKAGE_SPEC,
    installSource: input?.installSource ?? "npm",
    enableContextEngine: input?.enableContextEngine === true,
  };
}

export async function listOpenClawPlugins(
  runner: CommandRunner,
  options: RuntimeAdapterOptions = DEFAULT_PLUGIN_OPTIONS,
): Promise<OpenClawPluginListResult> {
  const result = await execOpenClawPluginCommand(runner, ["plugins", "list", "--json"], options);
  const parsed = parseJson<OpenClawPluginListResult>(result.stdout);
  return {
    workspaceDir: parsed.workspaceDir,
    plugins: Array.isArray(parsed.plugins) ? parsed.plugins : [],
    diagnostics: Array.isArray(parsed.diagnostics) ? parsed.diagnostics : [],
  };
}

export async function getOpenClawPluginInfo(
  id: string,
  runner: CommandRunner,
  options: RuntimeAdapterOptions = DEFAULT_PLUGIN_OPTIONS,
): Promise<OpenClawPluginRecord | null> {
  try {
    const result = await execOpenClawPluginCommand(runner, ["plugins", "info", id, "--json"], options);
    return parseJson<OpenClawPluginRecord>(result.stdout);
  } catch {
    return null;
  }
}

export async function listOpenClawHooks(
  runner: CommandRunner,
  options: RuntimeAdapterOptions = DEFAULT_PLUGIN_OPTIONS,
): Promise<OpenClawHooksListResult> {
  const result = await runner.exec("openclaw", ["hooks", "list", "--json"], {
    env: options.env,
    timeoutMs: 20_000,
  });
  return parseJson<OpenClawHooksListResult>(result.stdout);
}

export async function doctorOpenClawPlugins(
  runner: CommandRunner,
  options: RuntimeAdapterOptions = DEFAULT_PLUGIN_OPTIONS,
): Promise<OpenClawPluginDoctorResult> {
  const result = await execOpenClawPluginCommand(runner, ["plugins", "doctor"], options);
  const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join("\n");
  const issues = parseDoctorIssues(output);
  const ok = issues.length === 0 && !/issues detected/i.test(output);
  return { ok, output, issues };
}

export async function installOpenClawPlugin(
  spec: string,
  runner: CommandRunner,
  options: RuntimeAdapterOptions = DEFAULT_PLUGIN_OPTIONS,
): Promise<void> {
  await execOpenClawPluginCommand(runner, ["plugins", "install", spec], options);
}

export async function enableOpenClawPlugin(
  id: string,
  runner: CommandRunner,
  options: RuntimeAdapterOptions = DEFAULT_PLUGIN_OPTIONS,
): Promise<void> {
  await execOpenClawPluginCommand(runner, ["plugins", "enable", id], options);
}

export async function disableOpenClawPlugin(
  id: string,
  runner: CommandRunner,
  options: RuntimeAdapterOptions = DEFAULT_PLUGIN_OPTIONS,
): Promise<void> {
  await execOpenClawPluginCommand(runner, ["plugins", "disable", id], options);
}

export async function updateOpenClawPlugin(
  id: string,
  runner: CommandRunner,
  options: RuntimeAdapterOptions = DEFAULT_PLUGIN_OPTIONS,
): Promise<void> {
  await execOpenClawPluginCommand(runner, ["plugins", "update", id], options);
}

export async function probeOpenClawPluginSupport(
  runner: CommandRunner,
  options: RuntimeAdapterOptions = DEFAULT_PLUGIN_OPTIONS,
): Promise<boolean> {
  try {
    await listOpenClawPlugins(runner, options);
    return true;
  } catch {
    return false;
  }
}

function readSelectedContextEngine(options: RuntimeAdapterOptions = DEFAULT_PLUGIN_OPTIONS): string | null {
  const config = readOpenClawRuntimeConfig({
    configPath: options.gateway?.configPath ?? options.configPath,
    env: options.env,
  });
  return config?.plugins?.slots?.contextEngine ?? null;
}

function setSelectedContextEngine(id: string, options: RuntimeAdapterOptions = DEFAULT_PLUGIN_OPTIONS): string {
  const config = readOpenClawRuntimeConfig({
    configPath: options.gateway?.configPath ?? options.configPath,
    env: options.env,
  }) ?? {};
  const next = {
    ...config,
    plugins: {
      ...config.plugins,
      slots: {
        ...config.plugins?.slots,
        contextEngine: id,
      },
    },
  };
  writeOpenClawRuntimeConfig(next, {
    configPath: options.gateway?.configPath ?? options.configPath,
    env: options.env,
  });
  return id;
}

export async function getOpenClawPluginBridgeStatus(
  runner: CommandRunner,
  options: RuntimeAdapterOptions,
  policy: OpenClawPluginBridgePolicy,
): Promise<OpenClawPluginBridgeStatus> {
  const diagnostics: string[] = [];

  if (options.adapter !== "openclaw") {
    return {
      supported: false,
      mode: policy.mode,
      installSource: policy.installSource,
      diagnostics: [`Plugin bridge requires the openclaw adapter, received ${options.adapter}`],
      plugins: [],
      basePlugin: normalizePluginRecord(undefined, CLAWJS_PLUGIN_ID, policy.packageSpec),
      contextPlugin: {
        ...normalizePluginRecord(undefined, CLAWJS_CONTEXT_PLUGIN_ID, policy.contextEnginePackageSpec),
        selected: false,
        selectedEngineId: null,
      },
    };
  }

  try {
    const list = await listOpenClawPlugins(runner, options);
    const base = list.plugins.find((plugin) => plugin.id === CLAWJS_PLUGIN_ID);
    const context = list.plugins.find((plugin) => plugin.id === CLAWJS_CONTEXT_PLUGIN_ID);
    const selectedEngineId = readSelectedContextEngine(options);

    for (const diagnostic of list.diagnostics) {
      diagnostics.push(typeof diagnostic === "string" ? diagnostic : diagnostic.message || JSON.stringify(diagnostic));
    }

    return {
      supported: true,
      mode: policy.mode,
      installSource: policy.installSource,
      configPath: options.gateway?.configPath ?? options.configPath,
      diagnostics,
      plugins: list.plugins,
      basePlugin: normalizePluginRecord(base, CLAWJS_PLUGIN_ID, policy.packageSpec),
      contextPlugin: {
        ...normalizePluginRecord(context, CLAWJS_CONTEXT_PLUGIN_ID, policy.contextEnginePackageSpec),
        selected: selectedEngineId === CLAWJS_CONTEXT_PLUGIN_ID,
        selectedEngineId,
      },
    };
  } catch (error) {
    diagnostics.push(error instanceof Error ? error.message : String(error));
    return {
      supported: false,
      mode: policy.mode,
      installSource: policy.installSource,
      configPath: options.gateway?.configPath ?? options.configPath,
      diagnostics,
      plugins: [],
      basePlugin: normalizePluginRecord(undefined, CLAWJS_PLUGIN_ID, policy.packageSpec),
      contextPlugin: {
        ...normalizePluginRecord(undefined, CLAWJS_CONTEXT_PLUGIN_ID, policy.contextEnginePackageSpec),
        selected: false,
        selectedEngineId: readSelectedContextEngine(options),
      },
    };
  }
}

async function maybeRestartGateway(
  runner: CommandRunner,
  options: RuntimeAdapterOptions,
  changed: boolean,
): Promise<boolean> {
  if (!changed) return false;
  try {
    await restartOpenClawGateway(runner, { env: options.env, configPath: options.gateway?.configPath ?? options.configPath });
    return true;
  } catch {
    return false;
  }
}

export async function ensureOpenClawPluginBridge(
  runner: CommandRunner,
  options: RuntimeAdapterOptions,
  policy: OpenClawPluginBridgePolicy,
): Promise<OpenClawPluginEnsureResult> {
  let status = await getOpenClawPluginBridgeStatus(runner, options, policy);
  const actions: string[] = [];
  let changed = false;

  if (policy.mode !== "managed" || !status.supported) {
    return {
      changed,
      restartedGateway: false,
      actions,
      status,
    };
  }

  if (!status.basePlugin.installed) {
    await installOpenClawPlugin(policy.packageSpec, runner, options);
    actions.push(`install:${policy.packageSpec}`);
    changed = true;
  }

  status = await getOpenClawPluginBridgeStatus(runner, options, policy);

  if (status.basePlugin.installed && !status.basePlugin.enabled) {
    await enableOpenClawPlugin(CLAWJS_PLUGIN_ID, runner, options);
    actions.push(`enable:${CLAWJS_PLUGIN_ID}`);
    changed = true;
  }

  if (policy.enableContextEngine) {
    status = await getOpenClawPluginBridgeStatus(runner, options, policy);

    if (!status.contextPlugin.installed) {
      await installOpenClawPlugin(policy.contextEnginePackageSpec, runner, options);
      actions.push(`install:${policy.contextEnginePackageSpec}`);
      changed = true;
    }

    status = await getOpenClawPluginBridgeStatus(runner, options, policy);

    if (status.contextPlugin.installed && !status.contextPlugin.enabled) {
      await enableOpenClawPlugin(CLAWJS_CONTEXT_PLUGIN_ID, runner, options);
      actions.push(`enable:${CLAWJS_CONTEXT_PLUGIN_ID}`);
      changed = true;
    }

    if (status.contextPlugin.selectedEngineId !== CLAWJS_CONTEXT_PLUGIN_ID) {
      setSelectedContextEngine(CLAWJS_CONTEXT_PLUGIN_ID, options);
      actions.push(`select-context:${CLAWJS_CONTEXT_PLUGIN_ID}`);
      changed = true;
    }
  }

  const restartedGateway = await maybeRestartGateway(runner, options, changed);
  status = await getOpenClawPluginBridgeStatus(runner, options, policy);

  return {
    changed,
    restartedGateway,
    actions,
    status,
  };
}

function resolveTargets(target: OpenClawManagedPluginTarget): OpenClawManagedPluginTarget[] {
  return target === "all" ? ["clawjs", "context"] : [target];
}

export async function installManagedOpenClawPlugins(
  target: OpenClawManagedPluginTarget,
  runner: CommandRunner,
  options: RuntimeAdapterOptions,
  policy: OpenClawPluginBridgePolicy,
): Promise<OpenClawPluginEnsureResult> {
  const actions: string[] = [];
  let changed = false;

  for (const item of resolveTargets(target)) {
    if (item === "clawjs") {
      await installOpenClawPlugin(policy.packageSpec, runner, options);
      actions.push(`install:${policy.packageSpec}`);
      changed = true;
    } else {
      await installOpenClawPlugin(policy.contextEnginePackageSpec, runner, options);
      actions.push(`install:${policy.contextEnginePackageSpec}`);
      changed = true;
    }
  }

  const restartedGateway = await maybeRestartGateway(runner, options, changed);
  const status = await getOpenClawPluginBridgeStatus(runner, options, policy);
  return { changed, restartedGateway, actions, status };
}

export async function enableManagedOpenClawPlugins(
  target: OpenClawManagedPluginTarget,
  runner: CommandRunner,
  options: RuntimeAdapterOptions,
  policy: OpenClawPluginBridgePolicy,
): Promise<OpenClawPluginEnsureResult> {
  const actions: string[] = [];
  let changed = false;

  for (const item of resolveTargets(target)) {
    if (item === "clawjs") {
      await enableOpenClawPlugin(CLAWJS_PLUGIN_ID, runner, options);
      actions.push(`enable:${CLAWJS_PLUGIN_ID}`);
      changed = true;
    } else {
      await enableOpenClawPlugin(CLAWJS_CONTEXT_PLUGIN_ID, runner, options);
      actions.push(`enable:${CLAWJS_CONTEXT_PLUGIN_ID}`);
      if (readSelectedContextEngine(options) !== CLAWJS_CONTEXT_PLUGIN_ID) {
        setSelectedContextEngine(CLAWJS_CONTEXT_PLUGIN_ID, options);
        actions.push(`select-context:${CLAWJS_CONTEXT_PLUGIN_ID}`);
      }
      changed = true;
    }
  }

  const restartedGateway = await maybeRestartGateway(runner, options, changed);
  const status = await getOpenClawPluginBridgeStatus(runner, options, policy);
  return { changed, restartedGateway, actions, status };
}

export async function disableManagedOpenClawPlugins(
  target: OpenClawManagedPluginTarget,
  runner: CommandRunner,
  options: RuntimeAdapterOptions,
  policy: OpenClawPluginBridgePolicy,
): Promise<OpenClawPluginEnsureResult> {
  const actions: string[] = [];
  let changed = false;

  for (const item of resolveTargets(target)) {
    if (item === "clawjs") {
      await disableOpenClawPlugin(CLAWJS_PLUGIN_ID, runner, options);
      actions.push(`disable:${CLAWJS_PLUGIN_ID}`);
    } else {
      await disableOpenClawPlugin(CLAWJS_CONTEXT_PLUGIN_ID, runner, options);
      actions.push(`disable:${CLAWJS_CONTEXT_PLUGIN_ID}`);
      if (readSelectedContextEngine(options) === CLAWJS_CONTEXT_PLUGIN_ID) {
        setSelectedContextEngine("legacy", options);
        actions.push("select-context:legacy");
      }
    }
    changed = true;
  }

  const restartedGateway = await maybeRestartGateway(runner, options, changed);
  const status = await getOpenClawPluginBridgeStatus(runner, options, policy);
  return { changed, restartedGateway, actions, status };
}

export async function updateManagedOpenClawPlugins(
  target: OpenClawManagedPluginTarget,
  runner: CommandRunner,
  options: RuntimeAdapterOptions,
  policy: OpenClawPluginBridgePolicy,
): Promise<OpenClawPluginEnsureResult> {
  const actions: string[] = [];
  let changed = false;

  for (const item of resolveTargets(target)) {
    const id = item === "clawjs" ? CLAWJS_PLUGIN_ID : CLAWJS_CONTEXT_PLUGIN_ID;
    await updateOpenClawPlugin(id, runner, options);
    actions.push(`update:${id}`);
    changed = true;
  }

  const restartedGateway = await maybeRestartGateway(runner, options, changed);
  const status = await getOpenClawPluginBridgeStatus(runner, options, policy);
  return { changed, restartedGateway, actions, status };
}
