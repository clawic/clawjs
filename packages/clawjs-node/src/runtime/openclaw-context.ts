import fs from "fs";
import os from "os";
import path from "path";

import { NodeProcessHost } from "../host/process.ts";
import { resolveConversationsDir } from "../conversations/store.ts";
import {
  readOpenClawGatewayConfig,
  resolveOpenClawConfigPath,
  type GatewayConfigOptions,
  type OpenClawGatewayConfig,
} from "./gateway.ts";
import { buildOpenClawCommand, type OpenClawCommandOptions } from "./openclaw-command.ts";

export interface OpenClawAgentConfig {
  id: string;
  name?: string;
  workspace?: string;
  agentDir?: string;
  model?: string;
}

export interface OpenClawConfigFile {
  gateway?: {
    port?: number;
    auth?: {
      token?: string;
    };
  };
  agents?: {
    defaults?: {
      workspace?: string;
    };
    list?: OpenClawAgentConfig[];
  };
  plugins?: {
    enabled?: boolean;
    allow?: string[];
    deny?: string[];
    slots?: {
      memory?: string;
      contextEngine?: string;
    };
    entries?: Record<string, {
      enabled?: boolean;
      config?: Record<string, unknown>;
      hooks?: {
        allowPromptInjection?: boolean;
      };
    }>;
  };
}

export interface ResolveOpenClawContextOptions extends GatewayConfigOptions {
  stateDir?: string;
  agentId?: string;
  workspaceDir?: string;
  agentDir?: string;
  conversationsDir?: string;
}

export interface OpenClawRuntimeContext {
  stateDir: string;
  configPath: string;
  agentId: string;
  workspaceDir: string;
  agentDir: string;
  conversationsDir: string;
  configuredAgent: OpenClawAgentConfig | null;
  cliAgent: OpenClawAgentConfig | null;
  cliAgentDetected: boolean;
  gateway: OpenClawGatewayConfig | null;
}

function resolveHomePath(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function readValue(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? resolveHomePath(trimmed) : null;
}

function readConfigFile(configPath: string): OpenClawConfigFile | null {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8")) as OpenClawConfigFile;
  } catch {
    return null;
  }
}

export function readOpenClawRuntimeConfig(options: Pick<ResolveOpenClawContextOptions, "configPath" | "env"> = {}): OpenClawConfigFile | null {
  return readConfigFile(resolveOpenClawConfigPath(options));
}

export function writeOpenClawRuntimeConfig(
  config: OpenClawConfigFile,
  options: Pick<ResolveOpenClawContextOptions, "configPath" | "env"> = {},
): OpenClawConfigFile {
  const configPath = resolveOpenClawConfigPath(options);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return config;
}

function getConfiguredAgent(config: OpenClawConfigFile | null, agentId: string): OpenClawAgentConfig | null {
  const agents = config?.agents?.list;
  if (!Array.isArray(agents)) return null;
  return agents.find((agent) => agent?.id === agentId) ?? null;
}

function normalizeAgentRecord(value: unknown): OpenClawAgentConfig | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!id) return null;
  return {
    id,
    ...(typeof record.name === "string" && record.name.trim() ? { name: record.name.trim() } : {}),
    ...(typeof record.workspace === "string" && record.workspace.trim() ? { workspace: record.workspace.trim() } : {}),
    ...(typeof record.agentDir === "string" && record.agentDir.trim() ? { agentDir: record.agentDir.trim() } : {}),
    ...(typeof record.model === "string" && record.model.trim() ? { model: record.model.trim() } : {}),
  };
}

function mergeAgentRecords(
  configuredAgent: OpenClawAgentConfig | null,
  cliAgent: OpenClawAgentConfig | null,
): OpenClawAgentConfig | null {
  if (configuredAgent && cliAgent) {
    return {
      id: configuredAgent.id,
      name: configuredAgent.name ?? cliAgent.name,
      workspace: configuredAgent.workspace ?? cliAgent.workspace,
      agentDir: configuredAgent.agentDir ?? cliAgent.agentDir,
      model: configuredAgent.model ?? cliAgent.model,
    };
  }

  return configuredAgent ?? cliAgent;
}

export async function listOpenClawAgents(
  runner: { exec(command: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }): Promise<{ stdout: string; stderr: string; exitCode: number }> } = new NodeProcessHost(),
  options: OpenClawCommandOptions & { timeoutMs?: number } = {},
): Promise<OpenClawAgentConfig[]> {
  const command = buildOpenClawCommand(["agents", "list", "--json"], options);
  const result = await runner.exec(command.command, command.args, {
    env: command.env,
    timeoutMs: options.timeoutMs ?? 4_000,
  });
  const parsed = JSON.parse(result.stdout || "[]") as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((entry) => normalizeAgentRecord(entry))
    .filter((entry): entry is OpenClawAgentConfig => entry !== null);
}

export function resolveOpenClawContext(options: ResolveOpenClawContextOptions = {}): OpenClawRuntimeContext {
  const env = options.env ?? process.env;
  const configPath = resolveOpenClawConfigPath({
    configPath: options.configPath,
    env,
  });
  const stateDir = readValue(options.stateDir)
    || readValue(env.OPENCLAW_STATE_DIR)
    || path.dirname(configPath);
  const config = readConfigFile(configPath);
  const agentId = readValue(options.agentId)
    || readValue(env.OPENCLAW_AGENT_ID)
    || config?.agents?.list?.find((agent) => typeof agent?.id === "string" && agent.id.trim())?.id?.trim()
    || "default";
  const configuredAgent = getConfiguredAgent(config, agentId);
  const workspaceDir = readValue(options.workspaceDir)
    || readValue(env.OPENCLAW_WORKSPACE_DIR)
    || readValue(configuredAgent?.workspace)
    || readValue(config?.agents?.defaults?.workspace)
    || path.join(stateDir, "workspaces", agentId);
  const agentDir = readValue(options.agentDir)
    || readValue(env.OPENCLAW_AGENT_DIR)
    || readValue(configuredAgent?.agentDir)
    || path.join(stateDir, "agents", agentId, "agent");
  const conversationsDir = readValue(options.conversationsDir)
    || readValue(env.OPENCLAW_CONVERSATIONS_DIR)
    || resolveConversationsDir(workspaceDir);

  return {
    stateDir,
    configPath,
    agentId,
    workspaceDir,
    agentDir,
    conversationsDir,
    configuredAgent,
    cliAgent: null,
    cliAgentDetected: false,
    gateway: readOpenClawGatewayConfig({
      url: options.url,
      token: options.token,
      port: options.port,
      configPath,
      env,
    }),
  };
}

export async function resolveOpenClawContextWithCli(
  runner: { exec(command: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }): Promise<{ stdout: string; stderr: string; exitCode: number }> } = new NodeProcessHost(),
  options: ResolveOpenClawContextOptions & OpenClawCommandOptions & { timeoutMs?: number } = {},
): Promise<OpenClawRuntimeContext> {
  const context = resolveOpenClawContext(options);
  const env = options.env ?? process.env;

  let cliAgent: OpenClawAgentConfig | null = null;
  try {
    cliAgent = (await listOpenClawAgents(runner, options))
      .find((agent) => agent.id === context.agentId) ?? null;
  } catch {
    cliAgent = null;
  }

  const configuredAgent = mergeAgentRecords(context.configuredAgent, cliAgent);
  const workspaceDir = readValue(options.workspaceDir)
    || readValue(env.OPENCLAW_WORKSPACE_DIR)
    || readValue(configuredAgent?.workspace)
    || context.workspaceDir;
  const agentDir = readValue(options.agentDir)
    || readValue(env.OPENCLAW_AGENT_DIR)
    || readValue(configuredAgent?.agentDir)
    || context.agentDir;
  const conversationsDir = readValue(options.conversationsDir)
    || readValue(env.OPENCLAW_CONVERSATIONS_DIR)
    || resolveConversationsDir(workspaceDir);

  return {
    ...context,
    workspaceDir,
    agentDir,
    conversationsDir,
    configuredAgent,
    cliAgent,
    cliAgentDetected: !!cliAgent,
  };
}
