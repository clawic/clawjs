import fs from "fs";
import os from "os";
import path from "path";

import type { CapabilityName, ProgressEvent } from "@clawjs/core";

import { NodeProcessHost, type ExecResult } from "../host/process.ts";
import type { RuntimeCompatReport, RuntimeDoctorReport, RuntimeProbeStatus } from "./contracts.ts";
import { buildRuntimeCapabilityMap, buildRuntimeCompatReport } from "./adapters/shared.ts";
import { buildOpenClawCommand, resolveOpenClawBinaryPath, type OpenClawCommandOptions } from "./openclaw-command.ts";

export interface OpenClawRuntimeStatus extends RuntimeProbeStatus {}
export interface CompatReport extends RuntimeCompatReport {}
export interface DoctorReport extends RuntimeDoctorReport {}

export interface CommandRunner {
  exec(command: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }): Promise<ExecResult>;
}

export interface RuntimeSetupInput {
  agentId: string;
  workspaceDir: string;
}

export interface RuntimeCommandSpec {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
}

export type OpenClawRuntimeOperation = "install" | "uninstall" | "setup" | "repair";
export type OpenClawRuntimeProgressStatus = "start" | "complete" | "error";

export interface OpenClawRuntimeProgressStep {
  phase: string;
  message: string;
  percent: number;
  command?: RuntimeCommandSpec;
}

export interface OpenClawRuntimeProgressPlan {
  operation: OpenClawRuntimeOperation;
  capability: CapabilityName;
  steps: OpenClawRuntimeProgressStep[];
}

export interface OpenClawRuntimeProgressEvent extends ProgressEvent {
  operation: OpenClawRuntimeOperation;
  status: OpenClawRuntimeProgressStatus;
  command?: RuntimeCommandSpec;
}

export type OpenClawRuntimeProgressSink = (event: OpenClawRuntimeProgressEvent) => void;

function isExecutablePath(candidate: string): boolean {
  try {
    const stat = fs.statSync(candidate);
    return stat.isFile() || stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function normalizePathEntries(entries: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function resolvePackageManagerPath(binary: string, env: NodeJS.ProcessEnv = process.env): string {
  const trimmed = binary.trim();
  if (!trimmed) return binary;
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    return isExecutablePath(trimmed) ? trimmed : binary;
  }

  const pathEntries = (env.PATH || process.env.PATH || "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const homeDir = env.HOME?.trim() || os.homedir();
  const fixedCandidates = process.platform === "win32"
    ? []
    : [
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        path.join(homeDir, ".volta", "bin"),
        path.join(homeDir, ".local", "bin"),
      ];

  const nvmDir = process.platform === "win32"
    ? null
    : path.join(homeDir, ".nvm", "versions", "node");

  const candidates = [...pathEntries];
  for (const entry of fixedCandidates) {
    if (!candidates.includes(entry)) candidates.push(entry);
  }

  if (nvmDir && fs.existsSync(nvmDir)) {
    try {
      const versions = fs.readdirSync(nvmDir)
        .map((version) => path.join(nvmDir, version, "bin"))
        .filter((entry) => !candidates.includes(entry))
        .sort((left, right) => right.localeCompare(left));
      candidates.push(...versions);
    } catch {
      // ignore nvm scan failures
    }
  }

  const extensions = process.platform === "win32"
    ? (env.PATHEXT || ".EXE;.CMD;.BAT")
        .split(";")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [""];

  for (const directory of candidates) {
    for (const extension of extensions) {
      const candidate = path.join(directory, `${trimmed}${extension}`);
      if (isExecutablePath(candidate)) {
        return candidate;
      }
    }
  }

  return binary;
}

export function deriveGlobalPrefixFromPackageManagerBinary(binaryPath: string): string | null {
  const trimmed = binaryPath.trim();
  if (!trimmed.includes("/") && !trimmed.includes("\\")) {
    return null;
  }
  return path.resolve(path.dirname(trimmed), "..");
}

export function buildOpenClawPackageManagerEnv(
  binaryPath: string,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv | undefined {
  const prefix = deriveGlobalPrefixFromPackageManagerBinary(binaryPath);
  if (!prefix) {
    return undefined;
  }

  const pathEntries = normalizePathEntries([
    path.join(prefix, "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    ...(baseEnv.PATH || "").split(path.delimiter),
  ]);

  return {
    ...baseEnv,
    HOME: baseEnv.HOME?.trim() || os.homedir(),
    PATH: pathEntries.join(path.delimiter),
    npm_config_prefix: prefix,
    NPM_CONFIG_PREFIX: prefix,
  };
}

function runtimeOperationCapability(operation: OpenClawRuntimeOperation): CapabilityName {
  return operation === "setup" ? "workspace" : "runtime";
}

export type OpenClawVersionParseStrategy = "empty" | "semver-token" | "openclaw-prefix" | "fallback";

export interface OpenClawVersionParseResult {
  version: string | null;
  strategy: OpenClawVersionParseStrategy;
  family: string | null;
}

function emitOpenClawRuntimeProgress(
  sink: OpenClawRuntimeProgressSink | undefined,
  event: Omit<OpenClawRuntimeProgressEvent, "timestamp">,
): void {
  sink?.({
    ...event,
    timestamp: new Date().toISOString(),
  });
}

function buildProgressStep(
  phase: string,
  message: string,
  percent: number,
  command?: RuntimeCommandSpec,
): OpenClawRuntimeProgressStep {
  return {
    phase,
    message,
    percent,
    ...(command ? { command } : {}),
  };
}

export function buildOpenClawRuntimeProgressPlan(
  operation: OpenClawRuntimeOperation,
  input?: RuntimeSetupInput,
  installer: "npm" | "pnpm" = "npm",
  commandOptions: OpenClawCommandOptions = {},
): OpenClawRuntimeProgressPlan {
  switch (operation) {
    case "install":
      return {
        operation,
        capability: runtimeOperationCapability(operation),
        steps: [
          buildProgressStep("runtime.install.prepare", `Resolve the ${installer} command for OpenClaw.`, 10),
          buildProgressStep(
            "runtime.install.execute",
            "Install the OpenClaw CLI.",
            60,
            buildOpenClawInstallCommand(installer, commandOptions.env),
          ),
          buildProgressStep("runtime.install.finalize", "OpenClaw is ready to be probed again.", 100),
        ],
      };
    case "uninstall":
      return {
        operation,
        capability: runtimeOperationCapability(operation),
        steps: [
          buildProgressStep("runtime.uninstall.prepare", `Resolve the ${installer} command used to remove OpenClaw.`, 10),
          buildProgressStep(
            "runtime.uninstall.execute",
            "Remove the OpenClaw CLI.",
            60,
            buildOpenClawUninstallCommand(installer, commandOptions.env),
          ),
          buildProgressStep("runtime.uninstall.finalize", "OpenClaw has been removed from the current runtime context.", 100),
        ],
      };
    case "setup":
      if (!input) {
        throw new Error("RuntimeSetupInput is required for setup progress plans");
      }
      return {
        operation,
        capability: runtimeOperationCapability(operation),
        steps: [
          buildProgressStep("workspace.setup.prepare", `Prepare the workspace agent registration for ${input.agentId}.`, 10),
          buildProgressStep(
            "workspace.setup.execute",
            "Register the agent in the target workspace.",
            60,
            buildOpenClawWorkspaceSetupCommand(input, commandOptions),
          ),
          buildProgressStep("workspace.setup.finalize", "Workspace setup is ready for orchestration.", 100),
        ],
      };
    case "repair":
      return {
        operation,
        capability: runtimeOperationCapability(operation),
        steps: [
          buildProgressStep("runtime.repair.prepare", "Prepare the gateway repair command.", 10),
          buildProgressStep(
            "runtime.repair.execute",
            "Repair the OpenClaw gateway installation.",
            60,
            buildOpenClawRepairCommand(commandOptions),
          ),
          buildProgressStep("runtime.repair.finalize", "The runtime can be rechecked after repair.", 100),
        ],
      };
  }
}

async function runOpenClawRuntimeProgressPlan(
  plan: OpenClawRuntimeProgressPlan,
  runner: CommandRunner,
  onProgress?: OpenClawRuntimeProgressSink,
  timeoutMs = 30_000,
): Promise<void> {
  for (const step of plan.steps) {
    emitOpenClawRuntimeProgress(onProgress, {
      operation: plan.operation,
      capability: plan.capability,
      phase: step.phase,
      message: step.message,
      percent: step.percent,
      status: "start",
      ...(step.command ? { command: step.command } : {}),
    });

    if (!step.command) {
      emitOpenClawRuntimeProgress(onProgress, {
        operation: plan.operation,
        capability: plan.capability,
        phase: step.phase,
        message: step.message,
        percent: step.percent,
        status: "complete",
      });
      continue;
    }

    try {
      await runner.exec(step.command.command, step.command.args, {
        env: step.command.env,
        timeoutMs,
      });
      emitOpenClawRuntimeProgress(onProgress, {
        operation: plan.operation,
        capability: plan.capability,
        phase: step.phase,
        message: step.message,
        percent: step.percent,
        status: "complete",
        command: step.command,
      });
    } catch (error) {
      emitOpenClawRuntimeProgress(onProgress, {
        operation: plan.operation,
        capability: plan.capability,
        phase: step.phase,
        message: error instanceof Error ? error.message : "OpenClaw runtime operation failed",
        percent: step.percent,
        status: "error",
        command: step.command,
      });
      throw error;
    }
  }
}

export function parseOpenClawVersion(stdout: string): string | null {
  return describeOpenClawVersion(stdout).version;
}

function parseVersionFamily(version: string | null): string | null {
  if (!version) return null;
  const match = version.match(/^(\d+)\.(\d+)(?:\.\d+)?(?:[-+].*)?$/);
  if (!match) return null;
  return `${match[1]}.${match[2]}`;
}

export function describeOpenClawVersion(stdout: string): OpenClawVersionParseResult {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return { version: null, strategy: "empty", family: null };
  }

  const semverMatch = trimmed.match(/\b(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)\b/);
  if (semverMatch?.[1]) {
    return {
      version: semverMatch[1],
      strategy: "semver-token",
      family: parseVersionFamily(semverMatch[1]),
    };
  }

  const prefixless = trimmed
    .replace(/^openclaw(?:\s+version)?\s*/i, "")
    .replace(/^v(?=\d)/i, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();

  if (prefixless) {
    return {
      version: prefixless,
      strategy: "openclaw-prefix",
      family: parseVersionFamily(prefixless),
    };
  }

  return { version: trimmed, strategy: "fallback", family: parseVersionFamily(trimmed) };
}

export function buildCapabilitySignature(capabilities: Record<string, boolean>): string {
  return Object.entries(capabilities)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, enabled]) => `${name}=${enabled ? "1" : "0"}`)
    .join("|");
}

function buildRuntimeDiagnostics(
  status: Pick<OpenClawRuntimeStatus, "capabilities" | "diagnostics" | "version">,
  parseResult?: OpenClawVersionParseResult,
): Record<string, unknown> {
  return {
    ...status.diagnostics,
    versionFamily: parseResult?.family ?? parseVersionFamily(status.version),
    versionParseStrategy: parseResult?.strategy ?? "fallback",
    capabilitySignature: buildCapabilitySignature(status.capabilities),
  };
}

export async function detectBinary(
  binary: string,
  runner: CommandRunner = new NodeProcessHost(),
  options: OpenClawCommandOptions = {},
): Promise<boolean> {
  try {
    const resolvedBinary = binary === "openclaw" ? resolveOpenClawBinaryPath(options) : binary;
    if (resolvedBinary.includes("/") || resolvedBinary.includes("\\")) {
      await runner.exec(resolvedBinary, ["--version"], {
        env: buildOpenClawCommand([], options).env,
        timeoutMs: 5_000,
      });
      return true;
    }
    await runner.exec("which", [resolvedBinary], {
      env: buildOpenClawCommand([], options).env,
      timeoutMs: 5_000,
    });
    return true;
  } catch {
    return false;
  }
}

export async function probeOpenClawCapabilities(
  runner: CommandRunner = new NodeProcessHost(),
  options: OpenClawCommandOptions = {},
): Promise<Record<string, boolean>> {
  const capabilities: Record<string, boolean> = {
    version: false,
    modelsStatus: false,
    agentsList: false,
    gatewayCall: false,
    pluginsList: false,
  };

  const cliAvailable = await detectBinary("openclaw", runner, options);
  if (!cliAvailable) return capabilities;

  for (const [key, args] of Object.entries({
    version: ["--version"],
    modelsStatus: ["models", "status", "--json"],
    agentsList: ["agents", "list", "--json"],
    gatewayCall: ["gateway", "call", "--json", "--timeout", "1000", "--params", "{\"probe\":true}", "channels.status"],
    pluginsList: ["plugins", "list", "--json"],
  })) {
    try {
      const command = buildOpenClawCommand(args, options);
      await runner.exec(command.command, command.args, {
        env: command.env,
        timeoutMs: 8_000,
      });
      capabilities[key] = true;
    } catch {
      capabilities[key] = false;
    }
  }

  return capabilities;
}

export async function getOpenClawRuntimeStatus(
  runner: CommandRunner = new NodeProcessHost(),
  options: OpenClawCommandOptions = {},
): Promise<OpenClawRuntimeStatus> {
  const cliAvailable = await detectBinary("openclaw", runner, options);
  if (!cliAvailable) {
    const capabilities = {
      version: false,
      modelsStatus: false,
      agentsList: false,
      gatewayCall: false,
      pluginsList: false,
    };
    return {
      adapter: "openclaw",
      runtimeName: "OpenClaw",
      version: null,
      installed: false,
      cliAvailable: false,
      gatewayAvailable: false,
      capabilities,
      capabilityMap: buildRuntimeCapabilityMap({
        runtime: { supported: true, status: "error", strategy: "cli" },
        workspace: { supported: true, status: "ready", strategy: "native" },
        auth: { supported: true, status: "degraded", strategy: "cli" },
        models: { supported: true, status: "degraded", strategy: "cli" },
        conversation_cli: { supported: true, status: "error", strategy: "cli" },
        conversation_gateway: { supported: true, status: "degraded", strategy: "gateway" },
        streaming: { supported: true, status: "degraded", strategy: "cli" },
        memory: { supported: true, status: "degraded", strategy: "derived" },
        skills: { supported: true, status: "degraded", strategy: "derived" },
        channels: { supported: true, status: "degraded", strategy: "gateway" },
        scheduler: { supported: true, status: "degraded", strategy: "derived" },
        sandbox: { supported: false, status: "unsupported", strategy: "unsupported" },
        plugins: { supported: false, status: "unsupported", strategy: "unsupported" },
        doctor: { supported: true, status: "ready", strategy: "native" },
        compat: { supported: true, status: "ready", strategy: "native" },
      }),
      diagnostics: {
        lastError: "OpenClaw CLI not found",
        capabilitySignature: buildCapabilitySignature(capabilities),
        versionParseStrategy: "empty",
        versionFamily: null,
      },
    };
  }

  let version: string | null = null;
  let parseResult: OpenClawVersionParseResult = { version: null, strategy: "empty", family: null };
  try {
    const command = buildOpenClawCommand(["--version"], options);
    const versionResult = await runner.exec(command.command, command.args, {
      env: command.env,
      timeoutMs: 8_000,
    });
    parseResult = describeOpenClawVersion(versionResult.stdout);
    version = parseResult.version;
  } catch {
    version = null;
  }

  const capabilities = await probeOpenClawCapabilities(runner, options);

  return {
    adapter: "openclaw",
    runtimeName: "OpenClaw",
    version,
    installed: true,
    cliAvailable: true,
    gatewayAvailable: capabilities.gatewayCall,
    capabilities,
    capabilityMap: buildRuntimeCapabilityMap({
      runtime: { supported: true, status: "ready", strategy: "cli" },
      workspace: { supported: true, status: "ready", strategy: "native" },
      auth: { supported: true, status: capabilities.modelsStatus ? "ready" : "degraded", strategy: "cli" },
      models: { supported: true, status: capabilities.modelsStatus ? "ready" : "degraded", strategy: "cli" },
      conversation_cli: { supported: true, status: "ready", strategy: "cli" },
      conversation_gateway: { supported: true, status: capabilities.gatewayCall ? "ready" : "degraded", strategy: "gateway" },
      streaming: { supported: true, status: "ready", strategy: capabilities.gatewayCall ? "gateway" : "cli" },
      memory: { supported: true, status: "degraded", strategy: "derived" },
      skills: { supported: true, status: "degraded", strategy: "derived" },
      channels: { supported: true, status: capabilities.gatewayCall ? "ready" : "degraded", strategy: "gateway" },
      scheduler: { supported: true, status: "degraded", strategy: "derived" },
      sandbox: { supported: false, status: "unsupported", strategy: "unsupported" },
      plugins: {
        supported: capabilities.pluginsList,
        status: capabilities.pluginsList ? "ready" : "degraded",
        strategy: capabilities.pluginsList ? "native" : "unsupported",
      },
      doctor: { supported: true, status: "ready", strategy: "native" },
      compat: { supported: true, status: "ready", strategy: "native" },
    }),
    diagnostics: buildRuntimeDiagnostics({ capabilities, diagnostics: {}, version }, parseResult),
  };
}

function getOpenClawCapabilityMap(status: Pick<OpenClawRuntimeStatus, "cliAvailable" | "gatewayAvailable" | "capabilities"> & { capabilityMap?: OpenClawRuntimeStatus["capabilityMap"] }) {
  if (status.capabilityMap) {
    return status.capabilityMap;
  }

  return buildRuntimeCapabilityMap({
    runtime: { supported: true, status: status.cliAvailable ? "ready" : "error", strategy: "cli" },
    workspace: { supported: true, status: "ready", strategy: "native" },
    auth: { supported: true, status: status.capabilities.modelsStatus ? "ready" : "degraded", strategy: "cli" },
    models: { supported: true, status: status.capabilities.modelsStatus ? "ready" : "degraded", strategy: "cli" },
    conversation_cli: { supported: true, status: status.cliAvailable ? "ready" : "error", strategy: "cli" },
    conversation_gateway: { supported: true, status: status.gatewayAvailable ? "ready" : "degraded", strategy: "gateway" },
    streaming: { supported: true, status: status.cliAvailable ? "ready" : "degraded", strategy: status.gatewayAvailable ? "gateway" : "cli" },
    memory: { supported: true, status: "degraded", strategy: "derived" },
    skills: { supported: true, status: "degraded", strategy: "derived" },
    channels: { supported: true, status: status.gatewayAvailable ? "ready" : "degraded", strategy: "gateway" },
    scheduler: { supported: true, status: "degraded", strategy: "derived" },
    sandbox: { supported: false, status: "unsupported", strategy: "unsupported" },
    plugins: {
      supported: status.capabilities.pluginsList,
      status: status.capabilities.pluginsList ? "ready" : "degraded",
      strategy: status.capabilities.pluginsList ? "native" : "unsupported",
    },
    doctor: { supported: true, status: "ready", strategy: "native" },
    compat: { supported: true, status: "ready", strategy: "native" },
  });
}

export function buildCompatReport(status: OpenClawRuntimeStatus): CompatReport {
  const issues: string[] = [];
  if (!status.cliAvailable) issues.push("OpenClaw CLI is not installed.");
  if (status.cliAvailable && !status.capabilities.modelsStatus) issues.push("`openclaw models status --json` is unavailable.");
  if (status.cliAvailable && !status.capabilities.agentsList) issues.push("`openclaw agents list --json` is unavailable.");

  return buildRuntimeCompatReport({
    runtimeAdapter: "openclaw",
    runtimeVersion: status.version,
    capabilityMap: getOpenClawCapabilityMap(status),
    degraded: issues.length > 0,
    issues,
    diagnostics: buildRuntimeDiagnostics(status),
  });
}

export function buildDoctorReport(status: OpenClawRuntimeStatus): DoctorReport {
  const compat = buildCompatReport(status);
  const issues = [...compat.issues];
  const suggestedRepairs: string[] = [];

  if (!status.cliAvailable) {
    suggestedRepairs.push("Install OpenClaw and ensure the `openclaw` binary is on PATH.");
  }
  if (status.cliAvailable && !status.capabilities.modelsStatus) {
    suggestedRepairs.push("Verify that the installed OpenClaw version still supports `models status --json`.");
  }
  if (status.cliAvailable && !status.capabilities.agentsList) {
    suggestedRepairs.push("Verify that the installed OpenClaw version still supports `agents list --json`.");
  }

  return {
    ok: issues.length === 0,
    runtime: status,
    compat,
    issues,
    suggestedRepairs,
  };
}

export function buildOpenClawInstallCommand(
  installer: "npm" | "pnpm" = "npm",
  env: NodeJS.ProcessEnv = process.env,
): { command: string; args: string[]; env?: NodeJS.ProcessEnv } {
  if (installer === "pnpm") {
    return {
      command: resolvePackageManagerPath("pnpm", env),
      args: ["add", "-g", "openclaw"],
    };
  }
  const command = resolvePackageManagerPath("npm", env);
  return {
    command,
    args: ["install", "-g", "openclaw"],
    env: buildOpenClawPackageManagerEnv(command, env),
  };
}

export function buildOpenClawUninstallCommand(
  installer: "npm" | "pnpm" = "npm",
  env: NodeJS.ProcessEnv = process.env,
): { command: string; args: string[]; env?: NodeJS.ProcessEnv } {
  if (installer === "pnpm") {
    return {
      command: resolvePackageManagerPath("pnpm", env),
      args: ["remove", "-g", "openclaw"],
    };
  }
  const command = resolvePackageManagerPath("npm", env);
  return {
    command,
    args: ["uninstall", "-g", "openclaw"],
    env: buildOpenClawPackageManagerEnv(command, env),
  };
}

export function buildOpenClawWorkspaceSetupCommand(
  input: RuntimeSetupInput,
  options: OpenClawCommandOptions = {},
): RuntimeCommandSpec {
  return buildOpenClawCommand([
    "agents",
    "add",
    input.agentId,
    "--non-interactive",
    "--workspace",
    input.workspaceDir,
    "--json",
  ], options);
}

export function buildOpenClawRepairCommand(options: OpenClawCommandOptions = {}): RuntimeCommandSpec {
  return buildOpenClawCommand(["gateway", "install"], options);
}

export async function installOpenClawRuntime(
  runner: CommandRunner,
  installer: "npm" | "pnpm" = "npm",
  onProgress?: OpenClawRuntimeProgressSink,
  commandOptions: OpenClawCommandOptions = {},
): Promise<void> {
  await runOpenClawRuntimeProgressPlan(
    buildOpenClawRuntimeProgressPlan("install", undefined, installer, commandOptions),
    runner,
    onProgress,
    120_000,
  );
}

export async function uninstallOpenClawRuntime(
  runner: CommandRunner,
  installer: "npm" | "pnpm" = "npm",
  onProgress?: OpenClawRuntimeProgressSink,
  commandOptions: OpenClawCommandOptions = {},
): Promise<void> {
  await runOpenClawRuntimeProgressPlan(
    buildOpenClawRuntimeProgressPlan("uninstall", undefined, installer, commandOptions),
    runner,
    onProgress,
    120_000,
  );
}

export async function setupOpenClawWorkspace(
  input: RuntimeSetupInput,
  runner: CommandRunner,
  onProgress?: OpenClawRuntimeProgressSink,
  options: OpenClawCommandOptions = {},
): Promise<void> {
  await runOpenClawRuntimeProgressPlan(buildOpenClawRuntimeProgressPlan("setup", input, "npm", options), runner, onProgress);
}

export async function repairOpenClawRuntime(
  runner: CommandRunner,
  onProgress?: OpenClawRuntimeProgressSink,
  options: OpenClawCommandOptions = {},
): Promise<void> {
  await runOpenClawRuntimeProgressPlan(buildOpenClawRuntimeProgressPlan("repair", undefined, "npm", options), runner, onProgress);
}
