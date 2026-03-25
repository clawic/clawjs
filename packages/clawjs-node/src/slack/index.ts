import { maskCredential, type ChannelDescriptor, type SlackBotProfile, type SlackChannelSummary, type SlackStateSnapshot, type SlackTransportStatus } from "@clawjs/core";

import type { WorkspaceDataStore } from "../data/store.ts";
import type { CommandRunner } from "../runtime/contracts.ts";
import type { ConversationStore } from "../conversations/store.ts";
import { DEFAULT_SECRETS_PROXY_PATH } from "../secrets/index.ts";
import { readSlackStateSnapshot, writeSlackStateSnapshot } from "../state/store.ts";
import { NodeFileSystemHost } from "../host/filesystem.ts";

const SLACK_API_BASE_URL = "https://slack.com/api";
const SLACK_SESSION_MAP_DOCUMENT = "slack-session-map";

type JsonRecord = Record<string, unknown>;

export interface SlackConnectBotInput {
  secretName: string;
  socketMode?: boolean;
}

export interface SlackSendMessageInput {
  channel: string;
  text: string;
  threadTs?: string;
  mrkdwn?: boolean;
}

export interface SlackStatusResult extends SlackStateSnapshot {
  channel: ChannelDescriptor;
}

export interface SlackService {
  channel(): ChannelDescriptor;
  status(): Promise<SlackStatusResult>;
  connectBot(input: SlackConnectBotInput): Promise<SlackStatusResult>;
  sendMessage(input: SlackSendMessageInput): Promise<JsonRecord>;
  listChannels(query?: string): Promise<SlackChannelSummary[]>;
  getChannel(channelId: string): Promise<SlackChannelSummary>;
}

export interface CreateSlackServiceOptions {
  workspaceDir: string;
  dataStore: WorkspaceDataStore;
  conversationStore: ConversationStore;
  runner: CommandRunner;
  env?: NodeJS.ProcessEnv;
  filesystem?: NodeFileSystemHost;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function nowIso(): string {
  return new Date().toISOString();
}

function readState(workspaceDir: string, filesystem: NodeFileSystemHost): SlackStateSnapshot {
  return readSlackStateSnapshot(workspaceDir, filesystem) ?? {
    schemaVersion: 1,
    updatedAt: nowIso(),
    connected: false,
    transport: {
      mode: "disabled",
      active: false,
    },
    recentErrors: [],
    knownChannels: [],
  };
}

function writeState(
  workspaceDir: string,
  filesystem: NodeFileSystemHost,
  next: SlackStateSnapshot,
): SlackStateSnapshot {
  return writeSlackStateSnapshot(workspaceDir, {
    ...next,
    schemaVersion: 1,
    updatedAt: nowIso(),
  }, filesystem);
}

function validateSecretName(secretName: string): string {
  const trimmed = secretName.trim();
  if (!trimmed) {
    throw new Error("slack secretName is required");
  }
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    throw new Error(`slack secretName contains unsupported characters: ${secretName}`);
  }
  return trimmed;
}

function maskSecretReference(secretName: string): string {
  return `vault:${maskCredential(secretName) ?? "configured"}`;
}

function resolveSecretsProxyPath(env?: NodeJS.ProcessEnv): string {
  return env?.CLAWJS_SECRETS_PROXY_PATH?.trim() || process.env.CLAWJS_SECRETS_PROXY_PATH?.trim() || DEFAULT_SECRETS_PROXY_PATH;
}

function buildRunnerEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...(env ?? {}),
  };
}

async function callSlackApi<TResult = JsonRecord>(
  runner: CommandRunner,
  env: NodeJS.ProcessEnv | undefined,
  secretName: string,
  method: string,
  params: JsonRecord = {},
  timeoutMs = 15_000,
): Promise<TResult> {
  const proxyPath = resolveSecretsProxyPath(env);
  const url = `${SLACK_API_BASE_URL}/${method}`;
  const body = JSON.stringify(params);
  const args = [
    "request",
    "--method",
    "POST",
    "--url",
    url,
    "--header",
    "Content-Type: application/json",
    "--header",
    `Authorization: Bearer {{${secretName}}}`,
    "--body",
    body,
    "--timeout",
    String(Math.max(1, Math.ceil(timeoutMs / 1000))),
  ];
  const result = await runner.exec(proxyPath, args, {
    env: buildRunnerEnv(env),
    timeoutMs: timeoutMs + 1_000,
  });
  const payload = JSON.parse(result.stdout || "null") as { ok?: boolean; error?: string; [key: string]: unknown };
  if (!payload || payload.ok !== true) {
    throw new Error(`Slack ${method} failed${payload?.error ? `: ${payload.error}` : ""}`);
  }
  return payload as unknown as TResult;
}

/* ------------------------------------------------------------------ */
/*  Normalizers                                                       */
/* ------------------------------------------------------------------ */

function normalizeBotProfile(raw: JsonRecord): SlackBotProfile {
  return {
    id: String(raw.user_id ?? raw.bot_id ?? ""),
    teamId: typeof raw.team_id === "string" ? raw.team_id : "",
    name: typeof raw.user === "string" ? raw.user : "",
    teamName: typeof raw.team === "string" ? raw.team : undefined,
  };
}

function normalizeChannelSummary(raw: JsonRecord): SlackChannelSummary {
  const name = typeof raw.name === "string" ? raw.name : String(raw.id ?? "");
  const type: SlackChannelSummary["type"] = typeof raw.is_im === "boolean" && raw.is_im
    ? "im"
    : typeof raw.is_mpim === "boolean" && raw.is_mpim
      ? "mpim"
      : typeof raw.is_group === "boolean" && raw.is_group
        ? "group"
        : "channel";

  return {
    id: String(raw.id ?? ""),
    name,
    type,
    isArchived: typeof raw.is_archived === "boolean" ? raw.is_archived : undefined,
    isMember: typeof raw.is_member === "boolean" ? raw.is_member : undefined,
    memberCount: typeof raw.num_members === "number" ? raw.num_members : undefined,
    topic: typeof (raw.topic as JsonRecord | undefined)?.value === "string"
      ? (raw.topic as JsonRecord).value as string
      : undefined,
    purpose: typeof (raw.purpose as JsonRecord | undefined)?.value === "string"
      ? (raw.purpose as JsonRecord).value as string
      : undefined,
    lastMessageAt: nowIso(),
  };
}

function buildChannel(snapshot: SlackStateSnapshot): ChannelDescriptor {
  const lastError = snapshot.recentErrors[0] ?? null;
  const status: ChannelDescriptor["status"] = !snapshot.secretName
    ? "disconnected"
    : !snapshot.connected
      ? "configured"
      : lastError
        ? "degraded"
        : snapshot.transport.active
          ? "connected"
          : "configured";
  return {
    id: "slack",
    label: snapshot.botProfile?.name ? `Slack (${snapshot.botProfile.name})` : "Slack",
    kind: "chat",
    status,
    provider: "slack",
    lastSyncAt: snapshot.transport.lastSyncAt,
    lastError,
    metadata: {
      botId: snapshot.botProfile?.id,
      botName: snapshot.botProfile?.name,
      teamId: snapshot.botProfile?.teamId,
      teamName: snapshot.botProfile?.teamName,
      mode: snapshot.transport.mode,
      knownChannels: snapshot.knownChannels.length,
    },
  };
}

function dedupeChannels(channels: SlackChannelSummary[]): SlackChannelSummary[] {
  const byId = new Map<string, SlackChannelSummary>();
  for (const ch of channels) {
    byId.set(ch.id, ch);
  }
  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function appendRecentError(snapshot: SlackStateSnapshot, message: string): SlackStateSnapshot {
  return {
    ...snapshot,
    recentErrors: [message, ...snapshot.recentErrors.filter((e) => e !== message)].slice(0, 10),
  };
}

function updateKnownChannels(snapshot: SlackStateSnapshot, channels: SlackChannelSummary[]): SlackStateSnapshot {
  return {
    ...snapshot,
    knownChannels: dedupeChannels([...channels, ...snapshot.knownChannels]),
  };
}

/* ------------------------------------------------------------------ */
/*  Session / conversation mapping                                    */
/* ------------------------------------------------------------------ */

function readSessionMap(dataStore: WorkspaceDataStore): Record<string, string> {
  return dataStore.document<Record<string, string>>(SLACK_SESSION_MAP_DOCUMENT).read() ?? {};
}

function writeSessionMap(dataStore: WorkspaceDataStore, value: Record<string, string>): void {
  dataStore.document<Record<string, string>>(SLACK_SESSION_MAP_DOCUMENT).write(value);
}

/* ------------------------------------------------------------------ */
/*  Service factory                                                   */
/* ------------------------------------------------------------------ */

export function createSlackService(options: CreateSlackServiceOptions): SlackService {
  const filesystem = options.filesystem ?? new NodeFileSystemHost();

  async function persist(snapshot: SlackStateSnapshot): Promise<SlackStateSnapshot> {
    return writeState(options.workspaceDir, filesystem, snapshot);
  }

  async function refreshStatus(snapshot: SlackStateSnapshot): Promise<SlackStateSnapshot> {
    if (!snapshot.secretName) return snapshot;
    try {
      await callSlackApi(
        options.runner,
        options.env,
        snapshot.secretName,
        "auth.test",
      );
      return {
        ...snapshot,
        transport: {
          ...snapshot.transport,
          lastSyncAt: nowIso(),
        },
      };
    } catch (error) {
      return appendRecentError(snapshot, error instanceof Error ? error.message : "slack status refresh failed");
    }
  }

  async function status(): Promise<SlackStatusResult> {
    const snapshot = await persist(await refreshStatus(readState(options.workspaceDir, filesystem)));
    return {
      ...snapshot,
      channel: buildChannel(snapshot),
    };
  }

  async function requireConnectedState(): Promise<SlackStateSnapshot> {
    const snapshot = readState(options.workspaceDir, filesystem);
    if (!snapshot.secretName) {
      throw new Error("slack bot is not connected");
    }
    return snapshot;
  }

  async function connectBot(input: SlackConnectBotInput): Promise<SlackStatusResult> {
    const secretName = validateSecretName(input.secretName);

    const authResult = await callSlackApi<JsonRecord>(
      options.runner,
      options.env,
      secretName,
      "auth.test",
    );

    const profile = normalizeBotProfile(authResult);

    const transportMode: SlackTransportStatus["mode"] = input.socketMode ? "socket" : "events-api";

    const snapshot: SlackStateSnapshot = {
      ...readState(options.workspaceDir, filesystem),
      connected: true,
      secretName,
      maskedCredential: maskSecretReference(secretName),
      botProfile: profile,
      transport: {
        mode: transportMode,
        active: true,
        lastSyncAt: nowIso(),
      },
      recentErrors: [],
    };

    const persisted = await persist(snapshot);
    return {
      ...persisted,
      channel: buildChannel(persisted),
    };
  }

  async function sendMessage(input: SlackSendMessageInput): Promise<JsonRecord> {
    const snapshot = await requireConnectedState();
    const params: JsonRecord = {
      channel: input.channel,
      text: input.text,
    };
    if (input.threadTs) {
      params.thread_ts = input.threadTs;
    }
    if (typeof input.mrkdwn === "boolean") {
      params.mrkdwn = input.mrkdwn;
    }
    return callSlackApi<JsonRecord>(
      options.runner,
      options.env,
      snapshot.secretName!,
      "chat.postMessage",
      params,
    );
  }

  async function listChannels(query?: string): Promise<SlackChannelSummary[]> {
    const snapshot = await requireConnectedState();

    const result = await callSlackApi<JsonRecord>(
      options.runner,
      options.env,
      snapshot.secretName!,
      "conversations.list",
      { types: "public_channel,private_channel", limit: 200, exclude_archived: true },
    );

    const rawChannels = Array.isArray(result.channels) ? result.channels as JsonRecord[] : [];
    const channels = rawChannels.map(normalizeChannelSummary);

    await persist(updateKnownChannels(snapshot, channels));

    const normalizedQuery = query?.trim().toLowerCase();
    if (!normalizedQuery) return channels;
    return channels.filter((ch) => {
      const haystack = [ch.id, ch.name, ch.topic, ch.purpose].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }

  async function getChannel(channelId: string): Promise<SlackChannelSummary> {
    const snapshot = await requireConnectedState();
    const result = await callSlackApi<JsonRecord>(
      options.runner,
      options.env,
      snapshot.secretName!,
      "conversations.info",
      { channel: channelId },
    );

    const raw = (result.channel ?? {}) as JsonRecord;
    const channel = normalizeChannelSummary(raw);
    await persist(updateKnownChannels(snapshot, [channel]));
    return channel;
  }

  return {
    channel() {
      return buildChannel(readState(options.workspaceDir, filesystem));
    },
    status,
    connectBot,
    sendMessage,
    listChannels,
    getChannel,
  };
}
