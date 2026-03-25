import fs from "fs";
import os from "os";
import path from "path";

import type { ChannelDescriptor } from "@clawjs/core";

import type { CommandRunner } from "./contracts.ts";

export interface OpenClawGatewayConfig {
  url: string;
  token?: string;
  port: number;
  source: "explicit" | "config";
  configPath?: string;
}

export interface OpenClawGatewayStatus {
  configured: boolean;
  available: boolean;
  running: boolean;
  config: OpenClawGatewayConfig | null;
  response?: unknown;
  lastError?: string;
}

export interface OpenClawGatewayCallOptions extends GatewayConfigOptions {
  runner: CommandRunner;
  timeoutMs?: number;
}

export interface OpenClawGatewayWaitOptions extends OpenClawGatewayCallOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

interface OpenClawConfigFile {
  gateway?: {
    port?: number;
    auth?: {
      token?: string;
    };
  };
  plugins?: {
    entries?: Record<string, {
      enabled?: boolean;
    }>;
  };
}

export interface OpenClawGatewayChannelState {
  configured?: boolean;
  connected?: boolean;
  running?: boolean;
  lastError?: string | null;
  label?: string;
  kind?: ChannelDescriptor["kind"];
  endpoint?: string;
  provider?: string;
  metadata?: Record<string, unknown>;
}

export interface OpenClawGatewayChannelAccountState {
  configured?: boolean;
  linked?: boolean;
  connected?: boolean;
  running?: boolean;
  lastError?: string | null;
  metadata?: Record<string, unknown>;
}

export interface OpenClawGatewayChannelsResponse {
  channels?: Record<string, OpenClawGatewayChannelState>;
  channelAccounts?: Record<string, OpenClawGatewayChannelAccountState[]>;
}

export interface GatewayConfigOptions {
  url?: string;
  token?: string;
  port?: number;
  configPath?: string;
  env?: NodeJS.ProcessEnv;
}

export function resolveOpenClawConfigPath(options: GatewayConfigOptions = {}): string {
  const env = options.env ?? process.env;
  const configuredPath = options.configPath?.trim() || env.OPENCLAW_CONFIG_PATH?.trim();
  if (configuredPath) return configuredPath;

  const configuredStateDir = env.OPENCLAW_STATE_DIR?.trim();
  if (configuredStateDir) {
    return path.join(configuredStateDir, "openclaw.json");
  }

  return path.join(os.homedir(), ".openclaw", "openclaw.json");
}

function normalizeGatewayUrl(url: string, port: number): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (/^https?:\/\//.test(trimmed)) return trimmed;
  return `http://${trimmed || `127.0.0.1:${port}`}`;
}

function normalizeGatewayWsUrl(url: string): string {
  const normalized = normalizeGatewayUrl(url, 18789);
  if (normalized.startsWith("https://")) {
    return `wss://${normalized.slice("https://".length)}`;
  }
  if (normalized.startsWith("http://")) {
    return `ws://${normalized.slice("http://".length)}`;
  }
  return normalized;
}

function parseGatewayCallOutput(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readChannelKind(value: unknown): ChannelDescriptor["kind"] | undefined {
  return value === "chat" || value === "email" || value === "webhook" || value === "voice" || value === "social" || value === "unknown"
    ? value
    : undefined;
}

function titleizeIdentifier(value: string): string {
  return value
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveChannelLabel(id: string, channel?: OpenClawGatewayChannelState): string {
  const explicit = readString(channel?.label);
  if (explicit) return explicit;

  const knownLabels: Record<string, string> = {
    discord: "Discord",
    email: "Email",
    gmail: "Gmail",
    outlook: "Outlook",
    slack: "Slack",
    telegram: "Telegram",
    webhook: "Webhook",
    whatsapp: "WhatsApp",
  };

  return knownLabels[id] ?? titleizeIdentifier(id);
}

function resolveChannelKind(id: string, channel?: OpenClawGatewayChannelState): ChannelDescriptor["kind"] {
  const explicit = readChannelKind(channel?.kind);
  if (explicit) return explicit;

  const knownKinds: Record<string, ChannelDescriptor["kind"]> = {
    discord: "chat",
    email: "email",
    gmail: "email",
    outlook: "email",
    slack: "chat",
    telegram: "chat",
    webhook: "webhook",
    whatsapp: "chat",
  };

  return knownKinds[id] ?? "unknown";
}

function readEnabledChannelIds(options: GatewayConfigOptions = {}): Set<string> {
  const configPath = resolveOpenClawConfigPath(options);
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as OpenClawConfigFile;
    const entries = raw.plugins?.entries ?? {};
    return new Set(Object.entries(entries)
      .filter(([, entry]) => entry?.enabled === true)
      .map(([id]) => id));
  } catch {
    return new Set<string>();
  }
}

function normalizeGatewayChannelsResponse(input: unknown): OpenClawGatewayChannelsResponse {
  const value = typeof input === "object" && input !== null ? input as Record<string, unknown> : {};
  const channels = typeof value.channels === "object" && value.channels !== null
    ? value.channels as Record<string, OpenClawGatewayChannelState>
    : {};
  const channelAccountsSource = typeof value.channelAccounts === "object" && value.channelAccounts !== null
    ? value.channelAccounts as Record<string, unknown>
    : {};
  const channelAccounts = Object.fromEntries(
    Object.entries(channelAccountsSource).map(([id, accounts]) => [id, Array.isArray(accounts) ? accounts as OpenClawGatewayChannelAccountState[] : []]),
  );

  return { channels, channelAccounts };
}

function buildOpenClawChannelDescriptor(
  id: string,
  response: OpenClawGatewayChannelsResponse,
  enabledChannelIds: Set<string>,
): ChannelDescriptor {
  const channel = response.channels?.[id];
  const accounts = response.channelAccounts?.[id] ?? [];
  const pluginEnabled = enabledChannelIds.has(id);
  const linked = accounts.some((account) => readBoolean(account?.linked));
  const connected = readBoolean(channel?.connected) || accounts.some((account) => readBoolean(account?.connected));
  const configured = pluginEnabled || readBoolean(channel?.configured) || accounts.some((account) => readBoolean(account?.configured) || readBoolean(account?.linked) || readBoolean(account?.running));
  const running = readBoolean(channel?.running) || accounts.some((account) => readBoolean(account?.running));
  const lastError = readString(accounts.find((account) => readString(account?.lastError))?.lastError) ?? readString(channel?.lastError) ?? null;
  const status: ChannelDescriptor["status"] = lastError
    ? "degraded"
    : connected
      ? "connected"
      : configured || running
        ? "configured"
        : "disconnected";

  return {
    id,
    label: resolveChannelLabel(id, channel),
    kind: resolveChannelKind(id, channel),
    status,
    ...(readString(channel?.endpoint) ? { endpoint: readString(channel?.endpoint) } : {}),
    provider: readString(channel?.provider) ?? id,
    lastError,
    metadata: {
      pluginEnabled,
      linked,
      connected,
      configured,
      running,
      accountCount: accounts.length,
      ...(channel?.metadata ? { gateway: channel.metadata } : {}),
    },
  };
}

export function readOpenClawGatewayConfig(options: GatewayConfigOptions = {}): OpenClawGatewayConfig | null {
  if (options.url?.trim()) {
    const port = options.port ?? 18789;
    return {
      url: normalizeGatewayUrl(options.url, port),
      ...(options.token?.trim() ? { token: options.token.trim() } : {}),
      port,
      source: "explicit",
    };
  }

  const configPath = resolveOpenClawConfigPath(options);
  let raw: OpenClawConfigFile;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as OpenClawConfigFile;
  } catch {
    return null;
  }

  const port = raw.gateway?.port ?? options.port ?? 18789;
  const token = raw.gateway?.auth?.token?.trim();

  return {
    url: normalizeGatewayUrl(`127.0.0.1:${port}`, port),
    ...(token ? { token } : {}),
    port,
    source: "config",
    configPath,
  };
}

export async function callOpenClawGateway(
  method: string,
  params: Record<string, unknown> = {},
  options: OpenClawGatewayCallOptions,
): Promise<unknown> {
  const config = readOpenClawGatewayConfig(options);
  const args = [
    "gateway",
    "call",
    "--json",
    "--timeout",
    String(options.timeoutMs ?? 10_000),
    "--params",
    JSON.stringify(params),
  ];

  if (config?.token) {
    args.push("--token", config.token);
  }
  if (config?.url) {
    args.push("--url", normalizeGatewayWsUrl(config.url));
  }

  args.push(method);

  const result = await options.runner.exec("openclaw", args, {
    env: options.env,
    timeoutMs: options.timeoutMs ?? 12_000,
  });
  return parseGatewayCallOutput(result.stdout);
}

export async function getOpenClawGatewayStatus(
  runner: CommandRunner,
  options: GatewayConfigOptions = {},
): Promise<OpenClawGatewayStatus> {
  const config = readOpenClawGatewayConfig(options);
  if (!config) {
    return {
      configured: false,
      available: false,
      running: false,
      config: null,
    };
  }

  try {
    const response = await callOpenClawGateway("channels.status", { probe: true }, {
      runner,
      ...options,
      timeoutMs: 3_000,
    });
    return {
      configured: true,
      available: true,
      running: true,
      config,
      response,
    };
  } catch (error) {
    return {
      configured: true,
      available: false,
      running: false,
      config,
      lastError: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function listOpenClawChannels(
  runner: CommandRunner,
  options: GatewayConfigOptions = {},
): Promise<ChannelDescriptor[]> {
  const enabledChannelIds = readEnabledChannelIds(options);
  let response: OpenClawGatewayChannelsResponse = {};

  try {
    response = normalizeGatewayChannelsResponse(await callOpenClawGateway("channels.status", { probe: true }, {
      runner,
      ...options,
      timeoutMs: 3_000,
    }));
  } catch {
    if (enabledChannelIds.size === 0) {
      return [];
    }
  }

  const ids = new Set<string>([
    ...enabledChannelIds,
    ...Object.keys(response.channels ?? {}),
    ...Object.keys(response.channelAccounts ?? {}),
  ]);

  return Array.from(ids)
    .sort((left, right) => left.localeCompare(right))
    .map((id) => buildOpenClawChannelDescriptor(id, response, enabledChannelIds));
}

export async function startOpenClawGateway(runner: CommandRunner, options: GatewayConfigOptions = {}): Promise<void> {
  await runner.exec("openclaw", ["gateway", "start"], {
    env: options.env,
    timeoutMs: 20_000,
  });
}

export async function stopOpenClawGateway(runner: CommandRunner, options: GatewayConfigOptions = {}): Promise<void> {
  await runner.exec("openclaw", ["gateway", "stop"], {
    env: options.env,
    timeoutMs: 20_000,
  });
}

export async function restartOpenClawGateway(runner: CommandRunner, options: GatewayConfigOptions = {}): Promise<void> {
  await runner.exec("openclaw", ["gateway", "restart"], {
    env: options.env,
    timeoutMs: 20_000,
  });
}

export async function waitForOpenClawGateway(
  runner: CommandRunner,
  options: OpenClawGatewayWaitOptions = { runner: undefined as never },
): Promise<OpenClawGatewayStatus> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const intervalMs = options.intervalMs ?? 1_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const status = await getOpenClawGatewayStatus(runner, options);
    if (status.available) {
      return status;
    }
    await sleep(intervalMs);
  }

  throw new Error("OpenClaw gateway did not become ready before the timeout elapsed");
}
